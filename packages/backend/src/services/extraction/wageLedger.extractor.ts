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
         '기본급', '월지급액', '급여합계', '급여계', '지급총액', '월급여액', '지급합계', '차인지급액'],
  // 추가 컬럼 (사번 등)
  extra: ['사번', '번호', 'No', 'NO'],
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
 * 헤더 라인 찾기 (3단계 검색)
 * 1차: 첫 20줄에서 엄격 검색 (3+ 키워드)
 * 2차: 전체 문서에서 완화 검색 (2+ 키워드 + 표 구조)
 * 3차: 이름 + 급여/지급 키워드
 */
function findHeaderLine(lines: string[]): { index: number; line: string } | null {
  // 핵심 키워드 목록 (extra 제외)
  const coreKeywords = {
    name: HEADER_KEYWORDS.name,
    residentNumber: HEADER_KEYWORDS.residentNumber,
    hireDate: HEADER_KEYWORDS.hireDate,
    position: HEADER_KEYWORDS.position,
    department: HEADER_KEYWORDS.department,
    wage: HEADER_KEYWORDS.wage,
  };

  // 1차 검색: 첫 20줄에서 3개 이상 핵심 키워드 매칭
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].toLowerCase();
    let matchCount = 0;

    for (const keywords of Object.values(coreKeywords)) {
      if (keywords.some(kw => line.includes(kw))) {
        matchCount++;
      }
    }

    if (matchCount >= 3) {
      return { index: i, line: lines[i] };
    }
  }

  // 2차 검색: 첫 30줄에서 2개 이상 키워드 + 표 구조 (탭 포함)
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].toLowerCase();
    let matchCount = 0;

    for (const keywords of Object.values(coreKeywords)) {
      if (keywords.some(kw => line.includes(kw))) {
        matchCount++;
      }
    }

    // 사번 키워드도 체크 (추가 포인트)
    if (HEADER_KEYWORDS.extra.some(kw => line.includes(kw.toLowerCase()))) {
      matchCount++;
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

const TOTAL_ROW_KEYWORDS = ['합계', '총액', '총급여', '소계', '총인원', '계', '총계', '부서계'];

// 부서명 패턴 (사람 이름이 아닌 것들)
const DEPARTMENT_PATTERNS = /^(본사|생산|관리|물류|영업|총무|경리|인사|회계|기술|개발|합계|소계|계|총계|부서계|대표이사|임원|관리자|팀장|부장|과장|차장|이사)$/;

function isTotalRow(line: string): boolean {
  const normalized = line.replace(/\s+/g, '');
  return TOTAL_ROW_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * 유효한 사람 이름인지 검증
 */
function isValidPersonName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 4) return false;
  if (DEPARTMENT_PATTERNS.test(name)) return false;

  // 법률/문서 용어 패턴
  const legalTermPattern = /^(간의|관한|기본|목적|정함|사항|내용|회사|근로|계약|조항|규정|규칙|조건|일자|기간|급여|임금|시간|장소|업무|직위|직책|근무|휴가|휴일|보험|퇴직|해지|비밀|기타|상호|주소|대표|성명|연락|전화)$/;
  if (legalTermPattern.test(name)) return false;

  return true;
}

function isDataLine(line: string): boolean {
  if (isTotalRow(line)) return false;

  const name = extractKoreanName(line);
  // 추출된 이름이 유효한 사람 이름인지 검증
  if (!name || !isValidPersonName(name)) return false;

  const hasNumber = /\d/.test(line);
  return hasNumber;
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
      confidence = 80; // 기본값 상향 (75 → 80)
    }
  }

  // 유효한 이름만 필터링 (부서명, 법률용어 제거)
  employees = employees.filter(e => isValidPersonName(e.name));

  // 데이터 품질 보정
  if (employees.length > 0) {
    const validEmployees = employees.filter(e =>
      e.name && e.name.length >= 2 && e.monthlyWage > 0 && e.monthlyWage >= 100000 // 최소 10만원
    );
    const validRatio = validEmployees.length / employees.length;

    // 유효성 비율에 따른 신뢰도 조정
    if (validRatio >= 0.95) {
      confidence = Math.min(confidence + 10, 100);
    } else if (validRatio >= 0.8) {
      confidence = Math.min(confidence + 5, 100);
    } else if (validRatio < 0.5) {
      confidence -= 15;
    }

    // 주민번호 추출 성공률 보너스
    const rrnRatio = employees.filter(e => e.residentRegistrationNumber).length / employees.length;
    if (rrnRatio >= 0.8) {
      confidence = Math.min(confidence + 5, 100);
    }
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
