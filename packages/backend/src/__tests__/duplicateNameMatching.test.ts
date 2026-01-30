/**
 * 동명이인 매칭 + 주민번호/입사일 복합 매칭 테스트
 */
import {
  matchContractsToWageLedger,
  mergeMatchResultToWageLedger,
  normalizeName,
  normalizeRRN,
  rrnMatch,
} from '../services/document-matcher.service';
import { employeeAnalysisService } from '../services/employeeAnalysis.service';
import { crossValidationService } from '../services/crossValidation.service';
import { WageLedgerData, EmploymentContractData, InsuranceListData } from '../types/document.types';

// === 헬퍼: 테스트용 급여대장 생성 ===
function makeWageLedger(
  employees: { name: string; rrn?: string; hireDate?: string; wage?: number }[]
): WageLedgerData {
  return {
    period: '2024-01 ~ 2024-06',
    totalWage: employees.reduce((s, e) => s + (e.wage || 3000000), 0),
    employees: employees.map(e => ({
      name: e.name,
      residentRegistrationNumber: e.rrn || '',
      hireDate: e.hireDate || '2023-01-01',
      position: '사원',
      monthlyWage: e.wage || 3000000,
    })),
  };
}

// === 헬퍼: 테스트용 근로계약서 생성 ===
function makeContract(
  name: string,
  rrn?: string,
  startDate?: string
): EmploymentContractData {
  return {
    employeeName: name,
    employerName: '테스트회사',
    contractStartDate: startDate || '2023-01-01',
    workType: 'FULL_TIME',
    monthlySalary: 3000000,
    weeklyWorkHours: 40,
    residentRegistrationNumber: rrn,
  };
}

// === 헬퍼: 테스트용 근로계약서 생성 (급여/근로시간 커스텀) ===
function makeContractWithWage(
  name: string,
  opts: { rrn?: string; startDate?: string; salary?: number; hours?: number }
): EmploymentContractData {
  return {
    employeeName: name,
    employerName: '테스트회사',
    contractStartDate: opts.startDate || '2023-01-01',
    workType: 'FULL_TIME',
    monthlySalary: opts.salary || 3000000,
    weeklyWorkHours: opts.hours || 40,
    residentRegistrationNumber: opts.rrn,
  };
}

// === 헬퍼: 테스트용 보험명부 생성 ===
function makeInsuranceList(
  employees: { name: string; enrollDate?: string }[]
): InsuranceListData {
  return {
    employees: employees.map(e => ({
      name: e.name,
      insuranceNumber: '1234567890',
      enrollmentDate: e.enrollDate || '2023-01-01',
      employmentInsurance: true,
      isCurrentEmployee: true,
    })),
  };
}

// =============================================
// 1. 유틸 함수 테스트
// =============================================
describe('rrnMatch - 주민번호 매칭', () => {
  it('동일 주민번호 매칭', () => {
    expect(rrnMatch('940215-1234567', '940215-1234567')).toBe(true);
  });

  it('하이픈/공백 차이 무시', () => {
    expect(rrnMatch('940215-1234567', '9402151234567')).toBe(true);
  });

  it('마스킹된 번호 - 앞자리 일치', () => {
    // 940215-1 vs 940215-1234567 → 앞 7자리 일치
    expect(rrnMatch('940215-1******', '940215-1234567')).toBe(true);
  });

  it('다른 주민번호 불일치', () => {
    expect(rrnMatch('940215-1234567', '850303-2345678')).toBe(false);
  });

  it('빈 값 불일치', () => {
    expect(rrnMatch('', '940215-1234567')).toBe(false);
    expect(rrnMatch(undefined, '940215-1234567')).toBe(false);
    expect(rrnMatch(undefined, undefined)).toBe(false);
  });

  it('너무 짧은 번호 불일치', () => {
    expect(rrnMatch('12345', '940215-1234567')).toBe(false);
  });
});

describe('normalizeRRN', () => {
  it('하이픈/공백/마스킹 제거', () => {
    expect(normalizeRRN('940215-1234567')).toBe('9402151234567');
    expect(normalizeRRN('940215-1******')).toBe('9402151');
    expect(normalizeRRN('940215 1234567')).toBe('9402151234567');
  });
});

// =============================================
// 2. document-matcher: 동명이인 매칭
// =============================================
describe('matchContractsToWageLedger - 동명이인 처리', () => {
  it('동명이인 2명을 주민번호로 각각 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2023-03-15' },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-01-02' },
    ]);
    const contracts = [
      makeContract('김철수', '940215-1234567', '2023-03-15'),
      makeContract('김철수', '960101-1234567', '2024-01-02'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(2);
    expect(result.unmatchedCount).toBe(0);
    // 각각 다른 주민번호에 매칭되어야 함
    const rrns = result.employees
      .filter(e => e.matched)
      .map(e => e.residentRegistrationNumber)
      .sort();
    expect(rrns).toEqual(['940215-1234567', '960101-1234567']);
  });

  it('동명이인 2명을 입사일로 구분', () => {
    // 주민번호 없이 입사일만으로 구분
    const wageLedger = makeWageLedger([
      { name: '이영희', hireDate: '2020-01-01' },
      { name: '이영희', hireDate: '2024-06-01' },
    ]);
    const contracts = [
      makeContract('이영희', '950101-2345678', '2020-01-05'),  // 2020년 입사자
      makeContract('이영희', '000315-4345678', '2024-06-01'),  // 2024년 입사자
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(2);
    // 각 직원에 올바른 계약서가 매칭되었는지 확인
    const emp2020 = result.employees.find(
      e => e.matched && e.residentRegistrationNumber === '950101-2345678'
    );
    const emp2024 = result.employees.find(
      e => e.matched && e.residentRegistrationNumber === '000315-4345678'
    );
    expect(emp2020).toBeDefined();
    expect(emp2024).toBeDefined();
  });

  it('1:1 매칭 보장 - 한 계약서가 두 번 사용되지 않음', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', hireDate: '2023-01-01' },
      { name: '김철수', hireDate: '2024-01-01' },
    ]);
    // 계약서는 1개뿐
    const contracts = [
      makeContract('김철수', '940215-1234567', '2023-01-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(1);
  });

  it('이름이 다른 동일인을 주민번호로 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567' },
    ]);
    // OCR로 이름이 다르게 추출됐지만 주민번호는 동일
    const contracts = [
      makeContract('김철숫', '940215-1234567', '2023-01-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    // 주민번호 1순위 매칭으로 성공
    expect(result.matchedCount).toBe(1);
    expect(result.employees[0].residentRegistrationNumber).toBe('940215-1234567');
  });

  it('기존 단일 이름 매칭이 깨지지 않음', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수' },
      { name: '이영희' },
      { name: '박지민' },
    ]);
    const contracts = [
      makeContract('김철수', '940215-1234567'),
      makeContract('이영희', '000125-4345678'),
      makeContract('박지민', '680505-1234567'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(3);
    expect(result.unmatchedCount).toBe(0);
    expect(result.contractOnlyEmployees.length).toBe(0);
  });
});

// =============================================
// 3. mergeMatchResultToWageLedger - 병합 동명이인
// =============================================
describe('mergeMatchResultToWageLedger - 동명이인 병합', () => {
  it('동명이인 매칭 결과가 급여대장에 올바르게 병합됨', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2023-03-15' },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-01-02' },
    ]);
    const contracts = [
      makeContract('김철수', '940215-1234567', '2023-03-15'),
      makeContract('김철수', '960101-1234567', '2024-01-02'),
    ];

    const matchResult = matchContractsToWageLedger(wageLedger, contracts);
    const merged = mergeMatchResultToWageLedger(wageLedger, matchResult, contracts);

    expect(merged.employees.length).toBe(2);
    const rrns = merged.employees.map(e => e.residentRegistrationNumber).sort();
    expect(rrns).toEqual(['940215-1234567', '960101-1234567']);
  });
});

// =============================================
// 4. employeeAnalysis: 동명이인 병합
// =============================================
describe('employeeAnalysisService.mergeEmployeeData - 동명이인', () => {
  it('동명이인이 별도 직원으로 보존됨', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2023-03-15', wage: 3500000 },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-01-02', wage: 2800000 },
    ]);

    const result = employeeAnalysisService.mergeEmployeeData(wageLedger, undefined, undefined);

    expect(result.length).toBe(2);
    expect(result.filter(e => e.name === '김철수').length).toBe(2);
  });

  it('보험명부 병합 시 동명이인 각각에 입사일로 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', hireDate: '2020-01-01', wage: 3500000 },
      { name: '김철수', hireDate: '2024-06-01', wage: 2800000 },
    ]);
    const insurance = makeInsuranceList([
      { name: '김철수', enrollDate: '2020-01-05' },
      { name: '김철수', enrollDate: '2024-06-01' },
    ]);

    const result = employeeAnalysisService.mergeEmployeeData(wageLedger, insurance, undefined);

    expect(result.length).toBe(2);
    // 둘 다 보험 가입 상태여야 함
    expect(result.every(e => e.hasEmploymentInsurance)).toBe(true);
  });

  it('계약서 병합 시 주민번호로 동명이인 구분', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2023-03-15' },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-01-02' },
    ]);
    const contracts = [
      makeContract('김철수', '940215-1234567', '2023-03-15'),
      makeContract('김철수', '960101-1234567', '2024-01-02'),
    ];

    const result = employeeAnalysisService.mergeEmployeeData(wageLedger, undefined, contracts);

    expect(result.length).toBe(2);
    const rrns = result.map(e => e.residentRegistrationNumber).sort();
    expect(rrns).toEqual(['940215-1234567', '960101-1234567']);
  });
});

// =============================================
// 5. 동명이인 3명 이상 매칭
// =============================================
describe('matchContractsToWageLedger - 동명이인 3명 이상', () => {
  it('동명이인 3명을 주민번호로 각각 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2020-01-01' },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2022-06-01' },
      { name: '김철수', rrn: '001231-3234567', hireDate: '2024-03-01' },
    ]);
    const contracts = [
      makeContract('김철수', '001231-3234567', '2024-03-01'),
      makeContract('김철수', '940215-1234567', '2020-01-01'),
      makeContract('김철수', '960101-1234567', '2022-06-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(3);
    expect(result.unmatchedCount).toBe(0);
    expect(result.contractOnlyEmployees.length).toBe(0);

    const rrns = result.employees
      .filter(e => e.matched)
      .map(e => e.residentRegistrationNumber)
      .sort();
    expect(rrns).toEqual(['001231-3234567', '940215-1234567', '960101-1234567']);
  });

  it('동명이인 3명 중 계약서 2개만 있으면 1명 미매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2020-01-01' },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2022-06-01' },
      { name: '김철수', rrn: '001231-3234567', hireDate: '2024-03-01' },
    ]);
    const contracts = [
      makeContract('김철수', '940215-1234567', '2020-01-01'),
      makeContract('김철수', '960101-1234567', '2022-06-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(2);
    expect(result.unmatchedCount).toBe(1);
  });
});

// =============================================
// 6. 주민번호/입사일 모두 없는 동명이인 (fallback)
// =============================================
describe('matchContractsToWageLedger - fallback 동작', () => {
  it('주민번호 없고 입사일도 기본값이면 첫번째부터 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '박지민' },
      { name: '박지민' },
    ]);
    const contracts = [
      makeContract('박지민', undefined, undefined),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    // 계약서 1개이므로 1명만 매칭, 1명 미매칭
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(1);
  });

  it('주민번호 없을 때 입사일로 올바르게 구분', () => {
    const wageLedger = makeWageLedger([
      { name: '박지민', hireDate: '2020-03-01' },
      { name: '박지민', hireDate: '2024-09-15' },
    ]);
    const contracts = [
      makeContract('박지민', '850505-2345678', '2024-09-15'),
      makeContract('박지민', '950101-2345678', '2020-03-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(2);
    // 2024년 입사자에게 850505 주민번호가 매칭되어야 함
    const emp2024 = result.employees.find(
      e => e.matched && e.residentRegistrationNumber === '850505-2345678'
    );
    expect(emp2024).toBeDefined();
  });
});

// =============================================
// 7. contract-only 직원 정확성 (usedContracts 기반)
// =============================================
describe('matchContractsToWageLedger - contractOnlyEmployees', () => {
  it('매칭된 계약서는 contractOnly에 포함되지 않음', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567' },
    ]);
    const contracts = [
      makeContract('김철수', '940215-1234567', '2023-01-01'),
      makeContract('이영희', '000101-4345678', '2024-01-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(1);
    expect(result.contractOnlyEmployees.length).toBe(1);
    expect(result.contractOnlyEmployees[0].name).toBe('이영희');
  });

  it('동명이인 중 일부만 매칭되면 나머지가 contractOnly에 포함', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567' },
    ]);
    // 동명이인 계약서 2개, 급여대장에는 1명
    const contracts = [
      makeContract('김철수', '940215-1234567', '2023-01-01'),
      makeContract('김철수', '001231-3234567', '2024-06-01'),
    ];

    const result = matchContractsToWageLedger(wageLedger, contracts);

    expect(result.matchedCount).toBe(1);
    // 매칭 안 된 김철수(001231)가 contractOnly에 있어야 함
    expect(result.contractOnlyEmployees.length).toBe(1);
    expect(result.contractOnlyEmployees[0].residentRegistrationNumber).toBe('001231-3234567');
  });
});

// =============================================
// 8. crossValidation - 동명이인 급여 비교
// =============================================
describe('crossValidationService.validateWageConsistency - 동명이인', () => {
  it('동명이인에서 올바른 직원의 급여를 비교', () => {
    // 김철수A: 급여 300만, 김철수B: 급여 250만
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2020-01-01', wage: 3000000 },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-01-01', wage: 2500000 },
    ]);
    // 계약서: 김철수B 급여 250만 (일치 → 경고 없어야 함)
    const contracts = [
      makeContractWithWage('김철수', {
        rrn: '960101-1234567',
        startDate: '2024-01-01',
        salary: 2500000,
      }),
    ];

    const inconsistencies = crossValidationService.validateWageConsistency(wageLedger, contracts);

    // 주민번호로 올바르게 매칭하면 급여 일치 → 경고 없음
    expect(inconsistencies.length).toBe(0);
  });

  it('동명이인에서 잘못된 직원과 비교하면 거짓 경고 발생 방지', () => {
    // 김철수A: 300만, 김철수B: 200만
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2020-01-01', wage: 3000000 },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-01-01', wage: 2000000 },
    ]);
    // 계약서: 김철수A 급여 300만 (주민번호로 매칭하면 일치)
    const contracts = [
      makeContractWithWage('김철수', {
        rrn: '940215-1234567',
        startDate: '2020-01-01',
        salary: 3000000,
      }),
    ];

    const inconsistencies = crossValidationService.validateWageConsistency(wageLedger, contracts);

    // 주민번호로 A를 찾아 비교 → 300만 vs 300만 → 경고 없음
    expect(inconsistencies.length).toBe(0);
  });

  it('실제 급여 차이가 있는 경우만 경고', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', wage: 3000000 },
    ]);
    // 계약서 급여가 50% 차이
    const contracts = [
      makeContractWithWage('김철수', {
        rrn: '940215-1234567',
        salary: 2000000,
      }),
    ];

    const inconsistencies = crossValidationService.validateWageConsistency(wageLedger, contracts);

    expect(inconsistencies.length).toBe(1);
    expect(inconsistencies[0].field).toBe('월급여');
    expect(inconsistencies[0].severity).toBe('HIGH');
  });
});

// =============================================
// 9. crossValidation - 동명이인 날짜 비교
// =============================================
describe('crossValidationService.validateDateConsistency - 동명이인', () => {
  it('동명이인에서 입사일/취득일을 올바른 직원과 비교', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', hireDate: '2020-01-01' },
      { name: '김철수', hireDate: '2024-06-01' },
    ]);
    const insurance = makeInsuranceList([
      { name: '김철수', enrollDate: '2020-01-05' },   // 4일 차이 → 경고 없음
      { name: '김철수', enrollDate: '2024-06-03' },   // 2일 차이 → 경고 없음
    ]);

    const inconsistencies = crossValidationService.validateDateConsistency(
      wageLedger, insurance, undefined
    );

    // 각각 올바른 직원과 매칭되면 날짜 차이가 30일 이내 → 경고 없음
    expect(inconsistencies.length).toBe(0);
  });

  it('계약서와 입사일 비교에서 주민번호로 올바르게 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', rrn: '940215-1234567', hireDate: '2020-01-01' },
      { name: '김철수', rrn: '960101-1234567', hireDate: '2024-06-01' },
    ]);
    // 계약서: 김철수B(960101)의 계약시작일 2024-06-05 (4일 차이)
    const contracts = [
      makeContractWithWage('김철수', {
        rrn: '960101-1234567',
        startDate: '2024-06-05',
      }),
    ];

    const inconsistencies = crossValidationService.validateDateConsistency(
      wageLedger, undefined, contracts
    );

    // 주민번호로 B를 찾아 비교 → 4일 차이 → 30일 이내 → 경고 없음
    expect(inconsistencies.length).toBe(0);
  });
});

// =============================================
// 10. crossValidation - 직원 명부 동명이인 카운트
// =============================================
describe('crossValidationService.validateEmployeeListConsistency - 동명이인 카운트', () => {
  it('동명이인 2명이 양쪽에 있으면 2명 매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수' },
      { name: '김철수' },
      { name: '이영희' },
    ]);
    const insurance = makeInsuranceList([
      { name: '김철수' },
      { name: '김철수' },
      { name: '이영희' },
    ]);

    const result = crossValidationService.validateEmployeeListConsistency(
      wageLedger, insurance
    );

    expect(result.matchedEmployees.length).toBe(3);
    expect(result.unmatchedFromWageLedger.length).toBe(0);
    expect(result.unmatchedFromInsurance.length).toBe(0);
  });

  it('급여대장에 동명이인 3명, 보험명부에 2명이면 1명 미매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수' },
      { name: '김철수' },
      { name: '김철수' },
    ]);
    const insurance = makeInsuranceList([
      { name: '김철수' },
      { name: '김철수' },
    ]);

    const result = crossValidationService.validateEmployeeListConsistency(
      wageLedger, insurance
    );

    expect(result.matchedEmployees.length).toBe(2);
    expect(result.unmatchedFromWageLedger.length).toBe(1);
    expect(result.unmatchedFromInsurance.length).toBe(0);
  });

  it('보험명부에 더 많은 동명이인이 있으면 보험쪽 미매칭', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수' },
    ]);
    const insurance = makeInsuranceList([
      { name: '김철수' },
      { name: '김철수' },
      { name: '김철수' },
    ]);

    const result = crossValidationService.validateEmployeeListConsistency(
      wageLedger, insurance
    );

    expect(result.matchedEmployees.length).toBe(1);
    expect(result.unmatchedFromWageLedger.length).toBe(0);
    expect(result.unmatchedFromInsurance.length).toBe(2);
  });
});

// =============================================
// 11. employeeAnalysis - 3명 이상 동명이인 병합
// =============================================
describe('employeeAnalysisService.mergeEmployeeData - 3명 이상 동명이인', () => {
  it('동명이인 3명이 모두 보존되고 각각 보험 병합됨', () => {
    const wageLedger = makeWageLedger([
      { name: '김철수', hireDate: '2020-01-01', wage: 3000000 },
      { name: '김철수', hireDate: '2022-06-01', wage: 2800000 },
      { name: '김철수', hireDate: '2024-09-01', wage: 2500000 },
    ]);
    const insurance = makeInsuranceList([
      { name: '김철수', enrollDate: '2020-01-05' },
      { name: '김철수', enrollDate: '2022-06-03' },
      { name: '김철수', enrollDate: '2024-09-01' },
    ]);

    const result = employeeAnalysisService.mergeEmployeeData(wageLedger, insurance, undefined);

    expect(result.length).toBe(3);
    expect(result.filter(e => e.name === '김철수').length).toBe(3);
    // 모두 보험 가입 상태
    expect(result.every(e => e.hasEmploymentInsurance)).toBe(true);
  });
});
