/**
 * 문서 간 데이터 매칭 서비스
 * 근로계약서의 주민번호를 급여대장 직원에 매칭하여 나이 정보 추가
 */

import { EmployeeData, WageLedgerData, EmploymentContractData } from '../types/document.types';
import { getBirthInfoFromResidentNumber } from '../utils/korean.utils';

export interface EmployeeMatchResult {
  /** 급여대장 직원 이름 */
  name: string;
  /** 매칭된 근로계약서 이름 (정규화 후) */
  matchedName?: string;
  /** 매칭된 주민번호 */
  residentRegistrationNumber?: string;
  /** 계산된 나이 */
  calculatedAge?: number;
  /** 생년월일 */
  birthDate?: string;
  /** 청년 여부 (15~34세) */
  isYouth?: boolean;
  /** 고령자 여부 (60세 이상) */
  isSenior?: boolean;
  /** 매칭 성공 여부 */
  matched: boolean;
}

/** 근로계약서에만 있는 직원 정보 */
export interface ContractOnlyEmployee {
  /** 직원 이름 */
  name: string;
  /** 주민등록번호 */
  residentRegistrationNumber?: string;
  /** 계산된 나이 */
  calculatedAge?: number;
  /** 청년 여부 */
  isYouth?: boolean;
  /** 고령자 여부 */
  isSenior?: boolean;
}

export interface DocumentMatchResult {
  /** 매칭 결과 */
  employees: EmployeeMatchResult[];
  /** 총 급여대장 직원 수 */
  totalWageLedgerEmployees: number;
  /** 매칭된 직원 수 */
  matchedCount: number;
  /** 매칭되지 않은 직원 수 (급여대장에 있지만 근로계약서 없음) */
  unmatchedCount: number;
  /** 청년 대상자 수 */
  youthCount: number;
  /** 고령자 대상자 수 */
  seniorCount: number;
  /** 매칭률 (%) */
  matchRate: number;
  /** 근로계약서에만 있는 직원 (급여대장에 없음) - 확인 필요 */
  contractOnlyEmployees: ContractOnlyEmployee[];
}

/**
 * 이름 정규화 (유니코드 정규화 + 공백/특수문자 제거)
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/\s+/g, '')
    .replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318Fa-zA-Z]/g, '')
    .trim();
}

/**
 * 한글 음절을 초성+중성+종성으로 분해 (유니코드 조합 차이 대응)
 */
function decomposeKorean(str: string): string {
  return [...str].map(ch => {
    const code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7AF) return ch;
    const offset = code - 0xAC00;
    const cho = Math.floor(offset / (21 * 28));
    const jung = Math.floor((offset % (21 * 28)) / 28);
    const jong = offset % 28;
    return String.fromCharCode(0x1100 + cho, 0x1161 + jung) + (jong ? String.fromCharCode(0x11A7 + jong) : '');
  }).join('');
}

/**
 * 두 이름이 일치하는지 확인 (퍼지 매칭)
 */
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // 정확히 일치
  if (n1 === n2) return true;

  // 한쪽이 다른 쪽을 포함 (예: "김철수" vs "김철수A")
  if (n1.includes(n2) || n2.includes(n1)) {
    if (Math.abs(n1.length - n2.length) <= 1) return true;
  }

  // 한글 자모 분해 후 비교 (다른 유니코드 조합 대응)
  const d1 = decomposeKorean(n1);
  const d2 = decomposeKorean(n2);
  if (d1 === d2) return true;

  // 길이 같고 1글자만 다른 경우 (OCR 오차 대응)
  if (n1.length === n2.length && n1.length >= 2) {
    let diff = 0;
    for (let i = 0; i < n1.length; i++) {
      if (n1[i] !== n2[i]) diff++;
    }
    if (diff <= 1) return true;
  }

  return false;
}

/**
 * 주민등록번호에서 나이 계산
 */
function calculateAgeFromRRN(rrn: string): { age: number; birthDate: string } | null {
  const birthInfo = getBirthInfoFromResidentNumber(rrn);
  if (!birthInfo) return null;

  const currentYear = new Date().getFullYear();
  const age = currentYear - birthInfo.birthYear;

  const birthDate = `${birthInfo.birthYear}-${String(birthInfo.birthMonth).padStart(2, '0')}-${String(birthInfo.birthDay).padStart(2, '0')}`;

  return { age, birthDate };
}

/**
 * 근로계약서 데이터를 급여대장 직원에 매칭
 */
export function matchContractsToWageLedger(
  wageLedger: WageLedgerData,
  contracts: EmploymentContractData[]
): DocumentMatchResult {
  const employees: EmployeeMatchResult[] = [];
  let matchedCount = 0;
  let youthCount = 0;
  let seniorCount = 0;

  // 근로계약서 데이터를 이름으로 인덱싱
  const contractMap = new Map<string, EmploymentContractData>();
  for (const contract of contracts) {
    if (contract.employeeName) {
      const normalizedName = normalizeName(contract.employeeName);
      contractMap.set(normalizedName, contract);
    }
  }

  // 급여대장 직원 각각에 대해 매칭 시도
  for (const employee of wageLedger.employees) {
    const normalizedEmpName = normalizeName(employee.name);

    // 정확한 매칭 먼저 시도
    let matchedContract = contractMap.get(normalizedEmpName);
    let matchedName = normalizedEmpName;

    // 정확한 매칭 실패 시 퍼지 매칭 시도
    if (!matchedContract) {
      for (const [contractName, contract] of contractMap) {
        if (namesMatch(normalizedEmpName, contractName)) {
          matchedContract = contract;
          matchedName = contractName;
          break;
        }
      }
    }

    if (matchedContract && matchedContract.residentRegistrationNumber) {
      const ageInfo = calculateAgeFromRRN(matchedContract.residentRegistrationNumber);

      const result: EmployeeMatchResult = {
        name: employee.name,
        matchedName: matchedContract.employeeName,
        residentRegistrationNumber: matchedContract.residentRegistrationNumber,
        calculatedAge: ageInfo?.age,
        birthDate: ageInfo?.birthDate,
        isYouth: ageInfo ? ageInfo.age >= 15 && ageInfo.age <= 34 : undefined,
        isSenior: ageInfo ? ageInfo.age >= 60 : undefined,
        matched: true,
      };

      employees.push(result);
      matchedCount++;

      if (result.isYouth) youthCount++;
      if (result.isSenior) seniorCount++;
    } else {
      employees.push({
        name: employee.name,
        matched: false,
      });
    }
  }

  const totalWageLedgerEmployees = wageLedger.employees.length;
  const unmatchedCount = totalWageLedgerEmployees - matchedCount;
  const matchRate = totalWageLedgerEmployees > 0
    ? Math.round((matchedCount / totalWageLedgerEmployees) * 100)
    : 0;

  const wageLedgerNames = new Set(
    wageLedger.employees.map(emp => normalizeName(emp.name))
  );
  
  const contractOnlyEmployees: ContractOnlyEmployee[] = [];
  for (const contract of contracts) {
    if (!contract.employeeName) continue;
    const normalizedName = normalizeName(contract.employeeName);
    
    let foundInWageLedger = wageLedgerNames.has(normalizedName);
    if (!foundInWageLedger) {
      for (const wlName of wageLedgerNames) {
        if (namesMatch(normalizedName, wlName)) {
          foundInWageLedger = true;
          break;
        }
      }
    }
    
    if (!foundInWageLedger) {
      const ageInfo = contract.residentRegistrationNumber 
        ? calculateAgeFromRRN(contract.residentRegistrationNumber) 
        : null;
      
      contractOnlyEmployees.push({
        name: contract.employeeName,
        residentRegistrationNumber: contract.residentRegistrationNumber,
        calculatedAge: ageInfo?.age,
        isYouth: ageInfo ? ageInfo.age >= 15 && ageInfo.age <= 34 : undefined,
        isSenior: ageInfo ? ageInfo.age >= 60 : undefined,
      });
    }
  }

  return {
    employees,
    totalWageLedgerEmployees,
    matchedCount,
    unmatchedCount,
    youthCount,
    seniorCount,
    matchRate,
    contractOnlyEmployees,
  };
}

/**
 * 매칭 결과를 급여대장 데이터에 병합
 */
export function mergeMatchResultToWageLedger(
  wageLedger: WageLedgerData,
  matchResult: DocumentMatchResult,
  contracts?: EmploymentContractData[]
): WageLedgerData {
  const matchMap = new Map<string, EmployeeMatchResult>();
  for (const emp of matchResult.employees) {
    matchMap.set(normalizeName(emp.name), emp);
  }

  const updatedEmployees: EmployeeData[] = wageLedger.employees.map(emp => {
    const match = matchMap.get(normalizeName(emp.name));

    if (match?.matched) {
      return {
        ...emp,
        residentRegistrationNumber: match.residentRegistrationNumber || emp.residentRegistrationNumber,
        calculatedAge: match.calculatedAge ?? emp.calculatedAge,
        isYouth: match.isYouth ?? emp.isYouth,
        isSenior: match.isSenior ?? emp.isSenior,
      };
    }

    return emp;
  });

  // 근로계약서에만 있는 직원도 급여대장에 추가
  if (matchResult.contractOnlyEmployees?.length && contracts) {
    const contractMap = new Map<string, EmploymentContractData>();
    for (const contract of contracts) {
      if (contract.employeeName) {
        contractMap.set(normalizeName(contract.employeeName), contract);
      }
    }

    for (const contractOnly of matchResult.contractOnlyEmployees) {
      const contract = contractMap.get(normalizeName(contractOnly.name));
      updatedEmployees.push({
        name: contractOnly.name,
        residentRegistrationNumber: contractOnly.residentRegistrationNumber || '',
        hireDate: contract?.contractStartDate || '',
        position: contract?.jobPosition || '',
        monthlyWage: contract?.monthlySalary || 0,
        weeklyWorkHours: contract?.weeklyWorkHours,
        calculatedAge: contractOnly.calculatedAge,
        isYouth: contractOnly.isYouth,
        isSenior: contractOnly.isSenior,
        workType: contract?.workType,
      });
    }
  }

  return {
    ...wageLedger,
    employees: updatedEmployees,
  };
}

/**
 * 문서 매칭 서비스 클래스
 */
export class DocumentMatcherService {
  /**
   * 근로계약서 목록을 급여대장에 매칭하고 결과 반환
   */
  matchAndMerge(
    wageLedger: WageLedgerData,
    contracts: EmploymentContractData[]
  ): {
    matchResult: DocumentMatchResult;
    mergedWageLedger: WageLedgerData;
  } {
    const matchResult = matchContractsToWageLedger(wageLedger, contracts);
    const mergedWageLedger = mergeMatchResultToWageLedger(wageLedger, matchResult, contracts);

    return { matchResult, mergedWageLedger };
  }

  /**
   * 매칭 요약 텍스트 생성
   */
  generateMatchSummary(matchResult: DocumentMatchResult): string[] {
    const summary: string[] = [];

    summary.push(`총 직원 수: ${matchResult.totalWageLedgerEmployees}명`);
    summary.push(`근로계약서 매칭: ${matchResult.matchedCount}명 (${matchResult.matchRate}%)`);

    if (matchResult.unmatchedCount > 0) {
      summary.push(`미매칭: ${matchResult.unmatchedCount}명 (근로계약서 없음)`);
    }

    if (matchResult.youthCount > 0) {
      summary.push(`청년(15~34세): ${matchResult.youthCount}명`);
    }

    if (matchResult.seniorCount > 0) {
      summary.push(`고령자(60세+): ${matchResult.seniorCount}명`);
    }

    // 매칭된 직원 상세
    const matchedEmps = matchResult.employees.filter(e => e.matched);
    if (matchedEmps.length > 0) {
      summary.push('');
      summary.push('【매칭된 직원 목록】');
      for (const emp of matchedEmps) {
        const ageInfo = emp.calculatedAge ? `${emp.calculatedAge}세` : '나이미상';
        const tags: string[] = [];
        if (emp.isYouth) tags.push('청년');
        if (emp.isSenior) tags.push('고령자');
        const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
        summary.push(`  - ${emp.name}: ${ageInfo}${tagStr}`);
      }
    }

    // 미매칭 직원
    const unmatchedEmps = matchResult.employees.filter(e => !e.matched);
    if (unmatchedEmps.length > 0) {
      summary.push('');
      summary.push('【미매칭 직원 (근로계약서 필요)】');
      for (const emp of unmatchedEmps) {
        summary.push(`  - ${emp.name}`);
      }
    }

    return summary;
  }
}

export const documentMatcherService = new DocumentMatcherService();
