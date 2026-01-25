import {
  EmployeeData,
  WageLedgerData,
  InsuranceListData,
  InsuranceEmployeeData,
  BusinessRegistrationData,
  EmploymentContractData,
} from '../../types/document.types';
import {
  SubsidyProgram,
  SubsidyCalculation,
  EligibilityStatus,
  SubsidyReportWithExclusions,
  SubsidyRequirement,
} from '../../types/subsidy.types';

interface MockEmployeeInput {
  name: string;
  age?: number;
  birthYear?: number;
  residentRegistrationNumber?: string;
  hireDate?: string;
  monthlyWage?: number;
  position?: string;
  department?: string;
  weeklyWorkHours?: number;
  workType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
}

export function createMockEmployee(input: MockEmployeeInput): EmployeeData {
  const currentYear = new Date().getFullYear();
  const age = input.age ?? (input.birthYear ? currentYear - input.birthYear : 30);
  const birthYear = input.birthYear ?? currentYear - age;
  
  const birthYearShort = String(birthYear).slice(2);
  const genderDigit = birthYear >= 2000 ? '3' : '1';
  const rrn = input.residentRegistrationNumber ?? `${birthYearShort}0101-${genderDigit}******`;

  return {
    name: input.name,
    residentRegistrationNumber: rrn,
    hireDate: input.hireDate ?? '2023-01-15',
    position: input.position ?? '사원',
    department: input.department ?? '개발부',
    monthlyWage: input.monthlyWage ?? 3000000,
    weeklyWorkHours: input.weeklyWorkHours ?? 40,
    calculatedAge: age,
    birthYear: birthYear,
    isYouth: age >= 15 && age <= 34,
    isSenior: age >= 60,
    workType: input.workType ?? 'FULL_TIME',
  };
}

export function createMockWageLedger(employees: MockEmployeeInput[]): WageLedgerData {
  const employeeData = employees.map(createMockEmployee);
  const totalWage = employeeData.reduce((sum, e) => sum + e.monthlyWage, 0);
  
  return {
    period: '2024-01 ~ 2024-06',
    employees: employeeData,
    totalWage,
  };
}

export function createMockInsurance(
  employeeNames: string[],
  options?: {
    hasEmploymentInsurance?: boolean;
    hasNationalPension?: boolean;
    hasHealthInsurance?: boolean;
    hasIndustrialAccident?: boolean;
  }
): InsuranceListData {
  const defaults = {
    hasEmploymentInsurance: true,
    hasNationalPension: true,
    hasHealthInsurance: true,
    hasIndustrialAccident: true,
    ...options,
  };

  return {
    employees: employeeNames.map((name, idx) => ({
      name,
      insuranceNumber: `${1234567890 + idx}`,
      enrollmentDate: '2023-01-15',
      employmentInsurance: defaults.hasEmploymentInsurance,
      nationalPension: defaults.hasNationalPension,
      healthInsurance: defaults.hasHealthInsurance,
      industrialAccident: defaults.hasIndustrialAccident,
    })),
  };
}

export function createMockBusinessRegistration(
  overrides?: Partial<BusinessRegistrationData>
): BusinessRegistrationData {
  return {
    businessNumber: '123-45-67890',
    businessName: '(주)테스트회사',
    representativeName: '김대표',
    businessAddress: '서울특별시 강남구 테헤란로 123',
    businessType: '서비스업',
    businessItem: '소프트웨어 개발',
    registrationDate: '2020-01-15',
    ...overrides,
  };
}

export function createMockEmploymentContract(
  overrides?: Partial<EmploymentContractData>
): EmploymentContractData {
  return {
    employeeName: '김직원',
    employerName: '(주)테스트회사',
    contractStartDate: '2024-01-02',
    workType: 'FULL_TIME',
    monthlySalary: 3500000,
    weeklyWorkHours: 40,
    ...overrides,
  };
}

export function createMockCalculation(
  program: SubsidyProgram,
  totalAmount: number,
  eligibility: EligibilityStatus = 'ELIGIBLE',
  options?: {
    monthlyAmount?: number;
    totalMonths?: number;
    notes?: string[];
    requirementsMet?: SubsidyRequirement[];
    requirementsNotMet?: SubsidyRequirement[];
  }
): SubsidyCalculation {
  return {
    program,
    monthlyAmount: options?.monthlyAmount ?? Math.floor(totalAmount / 12),
    totalMonths: options?.totalMonths ?? 12,
    totalAmount,
    requirementsMet: options?.requirementsMet ?? [],
    requirementsNotMet: options?.requirementsNotMet ?? [],
    eligibility,
    notes: options?.notes ?? [],
  };
}

export function createMockReport(
  overrides?: Partial<SubsidyReportWithExclusions>
): SubsidyReportWithExclusions {
  return {
    id: 'test-report-001',
    generatedAt: new Date().toISOString(),
    businessInfo: {
      name: '(주)테스트회사',
      registrationNumber: '123-45-67890',
    },
    calculations: [],
    checklist: [],
    requiredDocuments: [],
    eligibleCalculations: [],
    excludedSubsidies: [],
    totalEligibleAmount: 0,
    applicationChecklist: [],
    ...overrides,
  };
}

export function getHireDateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}

export function getHireDateMonthsFromNow(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}
