import { InsuranceEmployeeData, InsuranceListData } from '../../types/document.types';
import { ExtractionContext } from './businessRegistration.extractor';
import { extractDate, extractKoreanName, normalizeKoreanText } from '../../utils/korean.utils';

interface ColumnMapping {
  name: number;
  insuranceNumber: number;
  enrollmentDate: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  industrialAccident: number;
}

const COLUMN_KEYWORDS = {
  name: ['성명', '이름', '피보험자명', '피보험자', '근로자명'],
  insuranceNumber: ['자격관리번호', '피보험자번호', '관리번호', '자격번호'],
  enrollmentDate: ['취득일', '가입일', '자격취득일', '취득일자', '가입일자'],
  employmentInsurance: ['고용보험', '고용', '실업급여'],
  nationalPension: ['국민연금', '연금', '국민'],
  healthInsurance: ['건강보험', '건강', '의료보험', '건보'],
  industrialAccident: ['산재보험', '산재', '산업재해', '업무상재해'],
};

const POSITIVE_PATTERNS = ['O', '○', '●', 'V', '√', '가입', '적용', 'Y', '1', 'YES'];
const NEGATIVE_PATTERNS = ['X', '×', '-', '미가입', '미적용', 'N', '0', 'NO', ''];

function detectSeparator(line: string): 'tab' | 'space' | 'pipe' {
  if (line.includes('\t')) return 'tab';
  if (line.includes('|')) return 'pipe';
  return 'space';
}

function splitLine(line: string, separator: 'tab' | 'space' | 'pipe'): string[] {
  switch (separator) {
    case 'tab':
      return line.split('\t').map(s => s.trim());
    case 'pipe':
      return line.split('|').map(s => s.trim());
    case 'space':
      return line.split(/\s{2,}/).map(s => s.trim());
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
 */
function findHeaderLine(lines: string[]): { index: number; line: string } | null {
  // 1차 검색: 첫 20줄에서 3개 이상 키워드 매칭
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].toLowerCase();
    let matchCount = 0;

    for (const keywords of Object.values(COLUMN_KEYWORDS)) {
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

    for (const keywords of Object.values(COLUMN_KEYWORDS)) {
      if (keywords.some(kw => line.includes(kw))) {
        matchCount++;
      }
    }

    if (matchCount >= 2 && hasTabularStructure(lines[i])) {
      return { index: i, line: lines[i] };
    }
  }

  return null;
}

function detectColumnMapping(headerLine: string, separator: 'tab' | 'space' | 'pipe'): ColumnMapping {
  const parts = splitLine(headerLine, separator);
  const mapping: ColumnMapping = {
    name: -1,
    insuranceNumber: -1,
    enrollmentDate: -1,
    employmentInsurance: -1,
    nationalPension: -1,
    healthInsurance: -1,
    industrialAccident: -1,
  };

  for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    const index = parts.findIndex(part =>
      keywords.some(kw => part.toLowerCase().includes(kw))
    );
    if (index !== -1) {
      mapping[field as keyof ColumnMapping] = index;
    }
  }

  return mapping;
}

function parseInsuranceStatus(cell: string): boolean {
  const cleanCell = cell.trim().toUpperCase();

  if (POSITIVE_PATTERNS.some(p => cleanCell.includes(p.toUpperCase()))) return true;
  if (NEGATIVE_PATTERNS.some(p => cleanCell === p.toUpperCase())) return false;

  if (/\d{4,}/.test(cell)) return true;

  return false;
}

function hasInsuranceKeyword(line: string, keywords: string[]): boolean {
  return keywords.some(kw => line.toLowerCase().includes(kw));
}

function detectInsuranceFromLine(line: string): {
  employmentInsurance: boolean;
  nationalPension: boolean;
  healthInsurance: boolean;
  industrialAccident: boolean;
} {
  const lineUpper = line.toUpperCase();
  const hasNegative = NEGATIVE_PATTERNS.some(p => p && lineUpper.includes(p));
  
  return {
    employmentInsurance: hasInsuranceKeyword(line, COLUMN_KEYWORDS.employmentInsurance) && !hasNegative,
    nationalPension: hasInsuranceKeyword(line, COLUMN_KEYWORDS.nationalPension) && !hasNegative,
    healthInsurance: hasInsuranceKeyword(line, COLUMN_KEYWORDS.healthInsurance) && !hasNegative,
    industrialAccident: hasInsuranceKeyword(line, COLUMN_KEYWORDS.industrialAccident) && !hasNegative,
  };
}

function parseEmployeeRow(
  line: string,
  columns: ColumnMapping,
  separator: 'tab' | 'space' | 'pipe'
): InsuranceEmployeeData | null {
  const parts = splitLine(line, separator);
  
  const name = columns.name >= 0 && parts[columns.name]
    ? extractKoreanName(parts[columns.name])
    : extractKoreanName(line);

  if (!name) return null;

  const numberMatch = line.match(/(\d{10,})/);
  const insuranceNumber = columns.insuranceNumber >= 0 && parts[columns.insuranceNumber]
    ? parts[columns.insuranceNumber]
    : (numberMatch ? numberMatch[1] : '');

  const enrollmentDate = columns.enrollmentDate >= 0 && parts[columns.enrollmentDate]
    ? extractDate(parts[columns.enrollmentDate])
    : extractDate(line);

  let employmentInsurance = false;
  let nationalPension = false;
  let healthInsurance = false;
  let industrialAccident = false;

  if (columns.employmentInsurance >= 0 && parts[columns.employmentInsurance] !== undefined) {
    employmentInsurance = parseInsuranceStatus(parts[columns.employmentInsurance]);
  }
  if (columns.nationalPension >= 0 && parts[columns.nationalPension] !== undefined) {
    nationalPension = parseInsuranceStatus(parts[columns.nationalPension]);
  }
  if (columns.healthInsurance >= 0 && parts[columns.healthInsurance] !== undefined) {
    healthInsurance = parseInsuranceStatus(parts[columns.healthInsurance]);
  }
  if (columns.industrialAccident >= 0 && parts[columns.industrialAccident] !== undefined) {
    industrialAccident = parseInsuranceStatus(parts[columns.industrialAccident]);
  }

  const hasAnyInsuranceColumn = 
    columns.employmentInsurance >= 0 ||
    columns.nationalPension >= 0 ||
    columns.healthInsurance >= 0 ||
    columns.industrialAccident >= 0;

  if (!hasAnyInsuranceColumn) {
    const detected = detectInsuranceFromLine(line);
    employmentInsurance = detected.employmentInsurance;
    nationalPension = detected.nationalPension;
    healthInsurance = detected.healthInsurance;
    industrialAccident = detected.industrialAccident;
  }

  // 보험 정보를 확인할 수 없는 경우 undefined로 반환 (가정하지 않음)
  // 최소한 하나의 보험 정보라도 있어야 유효한 데이터로 간주
  const hasAnyInsuranceData = employmentInsurance || nationalPension || healthInsurance || industrialAccident;

  return {
    name,
    insuranceNumber,
    enrollmentDate: enrollmentDate || '',
    employmentInsurance: hasAnyInsuranceData ? employmentInsurance : undefined,
    nationalPension: hasAnyInsuranceData ? nationalPension : undefined,
    healthInsurance: hasAnyInsuranceData ? healthInsurance : undefined,
    industrialAccident: hasAnyInsuranceData ? industrialAccident : undefined,
    dataSource: hasAnyInsuranceData ? 'extracted' : 'unknown',
  } as InsuranceEmployeeData;
}

export function extractInsuranceList(text: string): {
  data: InsuranceListData | null;
  context: ExtractionContext;
} {
  const normalizedText = normalizeKoreanText(text);
  const errors: string[] = [];
  let confidence = 100;

  const lines = normalizedText.split('\n').filter(line => line.trim());
  const employees: InsuranceEmployeeData[] = [];

  const header = findHeaderLine(lines);
  
  if (header) {
    const separator = detectSeparator(header.line);
    const columns = detectColumnMapping(header.line, separator);
    const dataLines = lines.slice(header.index + 1);

    for (const line of dataLines) {
      const name = extractKoreanName(line);
      if (!name) continue;

      const employee = parseEmployeeRow(line, columns, separator);
      if (employee) {
        employees.push(employee);
      }
    }

    if (employees.length > 0) {
      confidence = Math.min(confidence, 90);
    }
  } else {
    for (const line of lines) {
      const name = extractKoreanName(line);
      if (!name) continue;

      const numberMatch = line.match(/(\d{10,})/);
      const insuranceNumber = numberMatch ? numberMatch[1] : '';
      const enrollmentDate = extractDate(line) || '';

      const detected = detectInsuranceFromLine(line);
      
      const hasAnyInfo = insuranceNumber || enrollmentDate || 
        detected.employmentInsurance || detected.nationalPension ||
        detected.healthInsurance || detected.industrialAccident;

      if (hasAnyInfo) {
        // 보험 정보가 명시적으로 있는 경우만 해당 값 사용, 없으면 undefined (가정하지 않음)
        employees.push({
          name,
          insuranceNumber,
          enrollmentDate,
          employmentInsurance: detected.employmentInsurance || undefined,
          nationalPension: detected.nationalPension || undefined,
          healthInsurance: detected.healthInsurance || undefined,
          industrialAccident: detected.industrialAccident || undefined,
          dataSource: 'extracted',
        } as InsuranceEmployeeData);
      }
    }

    if (employees.length > 0) {
      confidence = Math.min(confidence, 60);
    }
  }

  if (employees.length === 0) {
    errors.push('보험 가입자 정보를 찾을 수 없습니다');
    confidence -= 50;
  }

  const employeesWithDate = employees.filter(e => e.enrollmentDate);
  if (employeesWithDate.length < employees.length * 0.5) {
    errors.push('일부 직원의 자격취득일을 찾을 수 없습니다');
    confidence -= 10;
  }

  // 보험 가입 상태 불확실 경고 추가
  const employeesWithUnknownInsurance = employees.filter(e => e.dataSource === 'unknown');
  if (employeesWithUnknownInsurance.length > 0) {
    errors.push(`${employeesWithUnknownInsurance.length}명의 보험 가입 상태를 확인할 수 없습니다. 4대보험 가입자명부를 확인하세요.`);
    confidence -= 15;
  }

  // 보험 정보 일부만 있는 경우 경고
  const employeesWithPartialInsurance = employees.filter(e => {
    const hasAny = e.employmentInsurance || e.nationalPension || e.healthInsurance || e.industrialAccident;
    const hasAll = e.employmentInsurance && e.nationalPension && e.healthInsurance && e.industrialAccident;
    return hasAny && !hasAll;
  });
  if (employeesWithPartialInsurance.length > 0) {
    errors.push(`${employeesWithPartialInsurance.length}명이 일부 보험에만 가입되어 있습니다. 확인이 필요합니다.`);
    confidence -= 5;
  }

  return {
    data: {
      employees,
    },
    context: {
      rawText: text,
      normalizedText,
      errors,
      confidence: Math.max(0, confidence),
    },
  };
}

export function getInsuranceStatistics(insuranceList: InsuranceListData): {
  totalEmployees: number;
  employmentInsuranceCount: number;
  nationalPensionCount: number;
  healthInsuranceCount: number;
  industrialAccidentCount: number;
  fullCoverageCount: number;
} {
  const employees = insuranceList.employees;
  
  return {
    totalEmployees: employees.length,
    employmentInsuranceCount: employees.filter(e => e.employmentInsurance).length,
    nationalPensionCount: employees.filter(e => e.nationalPension).length,
    healthInsuranceCount: employees.filter(e => e.healthInsurance).length,
    industrialAccidentCount: employees.filter(e => e.industrialAccident).length,
    fullCoverageCount: employees.filter(e => 
      e.employmentInsurance && e.nationalPension && e.healthInsurance && e.industrialAccident
    ).length,
  };
}
