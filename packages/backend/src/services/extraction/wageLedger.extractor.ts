import { EmployeeData, WageLedgerData } from '../../types/document.types';
import { ExtractionContext } from './businessRegistration.extractor';
import {
  extractMoneyAmount,
  extractDate,
  extractKoreanName,
  extractResidentNumber,
  normalizeKoreanText,
  extractAllDates,
  calculateAgeFromResidentNumber,
} from '../../utils/korean.utils';

interface TableStructure {
  headerLineIndex: number;
  columns: ColumnMapping;
  separator: 'tab' | 'space' | 'pipe';
}

interface ColumnMapping {
  name: number;
  residentNumber: number;
  hireDate: number;
  position: number;
  department: number;
  wage: number;
}

const HEADER_KEYWORDS = {
  name: ['성명', '이름', '직원명', '피보험자명', '근로자', '사원명', '근무자', '피용자'],
  residentNumber: ['주민번호', '주민등록번호', '생년월일', '주민', '생년', '주민(생년)'],
  hireDate: ['입사일', '채용일', '고용일', '취득일', '입사', '채용', '취득', '입사년월일'],
  position: ['직위', '직급', '직책', '역할', '근무형태'],
  department: ['부서', '부문', '팀', '소속', '사업장'],
  wage: ['급여', '월급', '월급여', '임금', '보수', '월보수', '지급액', '실지급액', '총지급액',
         '기본급', '월지급액', '급여합계', '급여계', '지급총액', '월급여액'],
};

function detectSeparator(line: string): 'tab' | 'space' | 'pipe' {
  if (line.includes('\t')) return 'tab';
  if (line.includes('|')) return 'pipe';
  return 'space';
}

function splitLine(line: string, separator: 'tab' | 'space' | 'pipe'): string[] {
  switch (separator) {
    case 'tab':
      return line.split('\t').map(s => s.trim()).filter(Boolean);
    case 'pipe':
      return line.split('|').map(s => s.trim()).filter(Boolean);
    case 'space':
      return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  }
}

/**
 * 표 구조 감지 (탭, 파이프, 다중 공백)
 */
function hasTabularStructure(line: string): boolean {
  return line.includes('\t') || line.includes('|') || /\s{3,}/.test(line);
}

/**
 * 헤더 라인 찾기 (2단계 검색)
 * 1차: 첫 20줄에서 엄격 검색 (3+ 키워드)
 * 2차: 전체 문서에서 완화 검색 (2+ 키워드 + 표 구조)
 */
function findHeaderLine(lines: string[]): { index: number; line: string } | null {
  // 1차 검색: 첫 20줄에서 3개 이상 키워드 매칭
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].toLowerCase();
    let matchCount = 0;

    for (const keywords of Object.values(HEADER_KEYWORDS)) {
      if (keywords.some(kw => line.includes(kw))) {
        matchCount++;
      }
    }

    if (matchCount >= 3) {
      return { index: i, line: lines[i] };
    }
  }

  // 2차 검색: 첫 30줄에서 2개 이상 키워드 + 표 구조
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].toLowerCase();
    let matchCount = 0;

    for (const keywords of Object.values(HEADER_KEYWORDS)) {
      if (keywords.some(kw => line.includes(kw))) {
        matchCount++;
      }
    }

    if (matchCount >= 2 && hasTabularStructure(lines[i])) {
      return { index: i, line: lines[i] };
    }
  }

  // 3차 검색: 전체 문서에서 이름 + 급여 키워드 포함된 라인 (헤더일 가능성)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const hasNameKeyword = HEADER_KEYWORDS.name.some(kw => line.includes(kw));
    const hasWageKeyword = HEADER_KEYWORDS.wage.some(kw => line.includes(kw));

    if (hasNameKeyword && hasWageKeyword && hasTabularStructure(lines[i])) {
      return { index: i, line: lines[i] };
    }
  }

  return null;
}

function detectColumnMapping(headerLine: string, separator: 'tab' | 'space' | 'pipe'): ColumnMapping {
  const parts = splitLine(headerLine, separator);
  const mapping: ColumnMapping = {
    name: -1,
    residentNumber: -1,
    hireDate: -1,
    position: -1,
    department: -1,
    wage: -1,
  };

  for (const [field, keywords] of Object.entries(HEADER_KEYWORDS)) {
    const index = parts.findIndex(part => 
      keywords.some(kw => part.toLowerCase().includes(kw))
    );
    if (index !== -1) {
      mapping[field as keyof ColumnMapping] = index;
    }
  }

  return mapping;
}

function detectTableStructure(lines: string[]): TableStructure | null {
  const header = findHeaderLine(lines);
  if (!header) return null;

  const separator = detectSeparator(header.line);
  const columns = detectColumnMapping(header.line, separator);

  return {
    headerLineIndex: header.index,
    columns,
    separator,
  };
}

const TOTAL_ROW_KEYWORDS = ['합계', '총액', '총급여', '소계', '총인원'];

function isTotalRow(line: string): boolean {
  const normalized = line.replace(/\s+/g, '');
  return TOTAL_ROW_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function isDataLine(line: string): boolean {
  if (isTotalRow(line)) return false;
  
  const hasName = extractKoreanName(line) !== null;
  const hasNumber = /\d/.test(line);
  return hasName && hasNumber;
}

function extractBirthYear(residentNumber: string): number | null {
  const match = residentNumber.match(/(\d{2})(\d{2})(\d{2})-?(\d)/);
  if (!match) return null;

  const yearDigits = parseInt(match[1]);
  const genderDigit = parseInt(match[4]);

  if (genderDigit === 1 || genderDigit === 2) {
    return 1900 + yearDigits;
  } else if (genderDigit === 3 || genderDigit === 4) {
    return 2000 + yearDigits;
  }
  return null;
}

function calculateEmploymentDuration(hireDate: string): number | null {
  if (!hireDate) return null;
  
  const hireDateObj = new Date(hireDate);
  if (isNaN(hireDateObj.getTime())) return null;
  
  const now = new Date();
  const diffTime = now.getTime() - hireDateObj.getTime();
  const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
  
  return diffMonths;
}

function enrichEmployeeData(employee: EmployeeData): EmployeeData {
  const enriched = { ...employee };

  if (employee.residentRegistrationNumber) {
    const age = calculateAgeFromResidentNumber(employee.residentRegistrationNumber);
    const birthYear = extractBirthYear(employee.residentRegistrationNumber);

    if (age !== null) {
      enriched.calculatedAge = age;
      enriched.isYouth = age >= 15 && age <= 34;
      enriched.isSenior = age >= 60;
    }
    if (birthYear !== null) {
      enriched.birthYear = birthYear;
    }
  }

  if (employee.hireDate) {
    enriched.employmentDurationMonths = calculateEmploymentDuration(employee.hireDate) ?? undefined;
  }

  return enriched;
}

function parseEmployeeRow(
  line: string,
  columns: ColumnMapping,
  separator: 'tab' | 'space' | 'pipe'
): EmployeeData | null {
  const parts = splitLine(line, separator);
  
  const name = columns.name >= 0 && parts[columns.name] 
    ? extractKoreanName(parts[columns.name]) 
    : extractKoreanName(line);
  
  if (!name) return null;

  const residentNumber = columns.residentNumber >= 0 && parts[columns.residentNumber]
    ? extractResidentNumber(parts[columns.residentNumber])
    : extractResidentNumber(line);

  const hireDate = columns.hireDate >= 0 && parts[columns.hireDate]
    ? extractDate(parts[columns.hireDate])
    : extractDate(line);

  const position = columns.position >= 0 && parts[columns.position]
    ? parts[columns.position]
    : '';

  const department = columns.department >= 0 && parts[columns.department]
    ? parts[columns.department]
    : '';

  const wage = columns.wage >= 0 && parts[columns.wage]
    ? extractMoneyAmount(parts[columns.wage])
    : extractMoneyAmount(line);

  if (!wage) return null;

  return enrichEmployeeData({
    name,
    residentRegistrationNumber: residentNumber || '',
    hireDate: hireDate || '',
    position,
    department,
    monthlyWage: wage,
  });
}

function extractEmployeesFromTable(
  lines: string[],
  structure: TableStructure
): EmployeeData[] {
  const dataLines = lines.slice(structure.headerLineIndex + 1);
  const employees: EmployeeData[] = [];

  for (const line of dataLines) {
    if (!isDataLine(line)) continue;
    
    const employee = parseEmployeeRow(line, structure.columns, structure.separator);
    if (employee) {
      employees.push(employee);
    }
  }

  return employees;
}

function extractEmployeesFallback(lines: string[]): EmployeeData[] {
  const employees: EmployeeData[] = [];

  for (const line of lines) {
    if (isTotalRow(line)) continue;
    
    const name = extractKoreanName(line);
    const wage = extractMoneyAmount(line);

    if (name && wage) {
      const residentNumber = extractResidentNumber(line);
      const hireDate = extractDate(line);

      employees.push(enrichEmployeeData({
        name,
        residentRegistrationNumber: residentNumber || '',
        hireDate: hireDate || '',
        position: '',
        monthlyWage: wage,
      }));
    }
  }

  return employees;
}

export function extractWageLedger(text: string): {
  data: WageLedgerData | null;
  context: ExtractionContext;
} {
  const normalizedText = normalizeKoreanText(text);
  const errors: string[] = [];
  let confidence = 100;

  const lines = normalizedText.split('\n').filter(line => line.trim());

  const dates = extractAllDates(normalizedText);
  let period = '';
  if (dates.length >= 2) {
    period = `${dates[0]} ~ ${dates[dates.length - 1]}`;
  } else if (dates.length === 1) {
    period = dates[0];
  }

  let employees: EmployeeData[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _extractionMethod = 'none';

  const tableStructure = detectTableStructure(lines);
  if (tableStructure) {
    employees = extractEmployeesFromTable(lines, tableStructure);
    if (employees.length > 0) {
      _extractionMethod = 'table';
      // 테이블 구조 인식 성공 - 높은 신뢰도 유지
      confidence = 95;
    }
  }

  if (employees.length === 0) {
    employees = extractEmployeesFallback(lines);
    if (employees.length > 0) {
      _extractionMethod = 'fallback';
      confidence = 75;
    }
  }

  // 데이터 품질 보정
  if (employees.length > 0) {
    const validEmployees = employees.filter(e =>
      e.name && e.name.length >= 2 && e.monthlyWage > 0
    );
    const validRatio = validEmployees.length / employees.length;

    if (validRatio >= 0.9) confidence = Math.min(confidence + 5, 100);
    else if (validRatio < 0.5) confidence -= 15;
  }

  let totalWage = employees.reduce((sum, emp) => sum + emp.monthlyWage, 0);

  const totalPattern = /(합계|총액|총\s*급여|계)\s*[:：]?\s*/;
  const totalMatch = normalizedText.match(totalPattern);
  if (totalMatch) {
    const afterTotal = normalizedText.substring(normalizedText.indexOf(totalMatch[0]));
    const extractedTotal = extractMoneyAmount(afterTotal);
    if (extractedTotal && extractedTotal > totalWage) {
      totalWage = extractedTotal;
    }
  }

  if (employees.length === 0) {
    errors.push('직원 급여 정보를 찾을 수 없습니다');
    confidence -= 50;
  }

  if (!period) {
    errors.push('급여 기간을 찾을 수 없습니다');
    confidence -= 20;
  }

  // 청년/고령자 수는 getEmployeeStatistics에서 계산
  const ageExtractedCount = employees.filter(e => e.calculatedAge !== undefined).length;
  
  if (ageExtractedCount < employees.length * 0.5) {
    errors.push('일부 직원의 나이를 계산할 수 없습니다 (주민번호 확인 필요)');
    confidence -= 15;
  }

  return {
    data: {
      period,
      employees,
      totalWage,
    },
    context: {
      rawText: text,
      normalizedText,
      errors,
      confidence: Math.max(0, confidence),
    },
  };
}

export function getEmployeeStatistics(wageLedger: WageLedgerData): {
  totalEmployees: number;
  youthEmployees: number;
  seniorEmployees: number;
  avgAge: number | null;
  avgWage: number;
  ageDistribution: { youth: number; middle: number; senior: number };
} {
  const employees = wageLedger.employees;
  const employeesWithAge = employees.filter(e => e.calculatedAge !== undefined);
  
  const youthEmployees = employees.filter(e => e.isYouth).length;
  const seniorEmployees = employees.filter(e => e.isSenior).length;
  const middleEmployees = employees.length - youthEmployees - seniorEmployees;

  const avgAge = employeesWithAge.length > 0
    ? Math.round(employeesWithAge.reduce((sum, e) => sum + (e.calculatedAge || 0), 0) / employeesWithAge.length)
    : null;

  const avgWage = employees.length > 0
    ? Math.round(employees.reduce((sum, e) => sum + e.monthlyWage, 0) / employees.length)
    : 0;

  return {
    totalEmployees: employees.length,
    youthEmployees,
    seniorEmployees,
    avgAge,
    avgWage,
    ageDistribution: {
      youth: youthEmployees,
      middle: middleEmployees,
      senior: seniorEmployees,
    },
  };
}
