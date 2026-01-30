import {
  WageLedgerData,
  InsuranceListData,
  EmploymentContractData,
} from '../types/document.types';
import { normalizeName } from './document-matcher.service';
import {
  SubsidyProgram,
  PerEmployeeCalculation,
  EligibleProgramInfo,
  IneligibleProgramInfo,
  CalculationBreakdown,
  CalculationStep,
  PaymentScheduleItem,
  RegionType,
} from '../types/subsidy.types';

interface AnalyzedEmployee {
  name: string;
  residentRegistrationNumber?: string;
  age?: number;
  birthYear?: number;
  isYouth: boolean;
  isSenior: boolean;
  hireDate?: string;
  employmentDurationMonths?: number;
  weeklyWorkHours?: number;
  monthlySalary?: number;
  hasEmploymentInsurance: boolean;
  workType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  isCurrentEmployee?: boolean;
  terminationDate?: string;
  terminationReasonCode?: string;
}

const PROGRAM_NAMES: Record<SubsidyProgram, string> = {
  [SubsidyProgram.YOUTH_JOB_LEAP]: '청년일자리도약장려금',
  [SubsidyProgram.EMPLOYMENT_PROMOTION]: '고용촉진장려금',
  [SubsidyProgram.REGULAR_CONVERSION]: '정규직전환지원금',
  [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: '고령자계속고용장려금',
  [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: '고령자고용지원금',
  [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: '출산육아기 고용안정장려금',
};

export class EmployeeAnalysisService {
  mergeEmployeeData(
    wageLedger?: WageLedgerData,
    insuranceList?: InsuranceListData,
    contracts?: EmploymentContractData[]
  ): AnalyzedEmployee[] {
    const employeeMap = new Map<string, AnalyzedEmployee>();
    const hasInsuranceData = insuranceList && insuranceList.employees && insuranceList.employees.length > 0;

    if (wageLedger?.employees) {
      for (const emp of wageLedger.employees) {
        const key = this.normalizeEmployeeName(emp.name);
        // 4대보험 명부가 없는 경우, 정규직/계약직은 고용보험 가입으로 추정
        const assumeInsurance = !hasInsuranceData &&
          (emp.workType === 'FULL_TIME' || emp.workType === 'CONTRACT' || !emp.workType);

        employeeMap.set(key, {
          name: emp.name,
          residentRegistrationNumber: emp.residentRegistrationNumber,
          age: emp.calculatedAge,
          birthYear: emp.birthYear,
          isYouth: emp.isYouth ?? false,
          isSenior: emp.isSenior ?? false,
          hireDate: emp.hireDate,
          employmentDurationMonths: emp.employmentDurationMonths,
          weeklyWorkHours: emp.weeklyWorkHours,
          monthlySalary: emp.monthlyWage,
          hasEmploymentInsurance: !!emp.insuranceEnrollmentDate || assumeInsurance,
          workType: emp.workType,
          isCurrentEmployee: emp.isCurrentEmployee,
          terminationDate: emp.terminationDate,
          terminationReasonCode: emp.terminationReasonCode,
        });
      }
    }

    if (insuranceList?.employees) {
      for (const ins of insuranceList.employees) {
        const key = this.normalizeEmployeeName(ins.name);
        const existing = employeeMap.get(key);

        if (existing) {
          // undefined인 경우 기존 값 유지 또는 false로 설정
          existing.hasEmploymentInsurance = ins.employmentInsurance ?? existing.hasEmploymentInsurance ?? false;
          if (!existing.hireDate && ins.enrollmentDate) {
            existing.hireDate = ins.enrollmentDate;
          }
          // 보험명부에서 퇴사 정보 전달
          if (ins.isCurrentEmployee === false) {
            existing.isCurrentEmployee = false;
            existing.terminationDate = existing.terminationDate ?? ins.lossDate;
            existing.terminationReasonCode = existing.terminationReasonCode ?? ins.lossReasonCode;
          }
        } else {
          employeeMap.set(key, {
            name: ins.name,
            isYouth: false,
            isSenior: false,
            hasEmploymentInsurance: ins.employmentInsurance ?? false,
            hireDate: ins.enrollmentDate,
            isCurrentEmployee: ins.isCurrentEmployee,
            terminationDate: ins.lossDate,
            terminationReasonCode: ins.lossReasonCode,
          });
        }
      }
    }

    if (contracts) {
      for (const contract of contracts) {
        const key = this.normalizeEmployeeName(contract.employeeName);
        const existing = employeeMap.get(key);

        if (existing) {
          existing.weeklyWorkHours =
            existing.weeklyWorkHours ?? contract.weeklyWorkHours;
          existing.monthlySalary =
            existing.monthlySalary ?? contract.monthlySalary;
          existing.workType = existing.workType ?? contract.workType;
          existing.age = existing.age ?? contract.calculatedAge;
          existing.isYouth = existing.isYouth || (contract.isYouth ?? false);
          existing.isSenior = existing.isSenior || (contract.isSenior ?? false);
          existing.residentRegistrationNumber =
            existing.residentRegistrationNumber ??
            contract.residentRegistrationNumber;
        } else {
          // 4대보험 명부가 없는 경우, 정규직/계약직은 고용보험 가입으로 추정
          const assumeInsurance = !hasInsuranceData &&
            (contract.workType === 'FULL_TIME' || contract.workType === 'CONTRACT' || !contract.workType);

          employeeMap.set(key, {
            name: contract.employeeName,
            residentRegistrationNumber: contract.residentRegistrationNumber,
            age: contract.calculatedAge,
            isYouth: contract.isYouth ?? false,
            isSenior: contract.isSenior ?? false,
            hireDate: contract.contractStartDate,
            weeklyWorkHours: contract.weeklyWorkHours,
            monthlySalary: contract.monthlySalary,
            hasEmploymentInsurance:
              contract.socialInsuranceEnrollment?.employmentInsurance ?? assumeInsurance,
            workType: contract.workType,
          });
        }
      }
    }

    return Array.from(employeeMap.values());
  }

  private normalizeEmployeeName(name: string): string {
    return normalizeName(name);
  }

  analyzeEmployeeEligibility(
    employee: AnalyzedEmployee,
    regionType: RegionType = 'CAPITAL'
  ): PerEmployeeCalculation {
    const eligiblePrograms: EligibleProgramInfo[] = [];
    const ineligiblePrograms: IneligibleProgramInfo[] = [];

    // 퇴사자는 모든 프로그램에서 NOT_ELIGIBLE 처리
    if (employee.isCurrentEmployee === false) {
      const allPrograms = [
        SubsidyProgram.YOUTH_JOB_LEAP,
        SubsidyProgram.EMPLOYMENT_PROMOTION,
        SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
      ];
      for (const program of allPrograms) {
        ineligiblePrograms.push({
          program,
          programName: PROGRAM_NAMES[program],
          reasons: ['퇴사자는 지원 대상이 아닙니다'],
          missingRequirements: [],
        });
      }

      return {
        employeeName: employee.name,
        residentRegistrationNumber: employee.residentRegistrationNumber,
        age: employee.age,
        isYouth: employee.isYouth,
        isSenior: employee.isSenior,
        hireDate: employee.hireDate,
        employmentDurationMonths: employee.employmentDurationMonths,
        weeklyWorkHours: employee.weeklyWorkHours,
        monthlySalary: employee.monthlySalary,
        isCurrentEmployee: false,
        eligiblePrograms,
        ineligiblePrograms,
        totalEstimatedSubsidy: 0,
      };
    }

    this.checkYouthJobLeap(
      employee,
      regionType,
      eligiblePrograms,
      ineligiblePrograms
    );
    this.checkSeniorPrograms(employee, eligiblePrograms, ineligiblePrograms);
    this.checkEmploymentPromotion(
      employee,
      eligiblePrograms,
      ineligiblePrograms
    );

    const totalEstimatedSubsidy = eligiblePrograms.reduce(
      (sum, p) => sum + p.estimatedAmount,
      0
    );

    return {
      employeeName: employee.name,
      residentRegistrationNumber: employee.residentRegistrationNumber,
      age: employee.age,
      isYouth: employee.isYouth,
      isSenior: employee.isSenior,
      hireDate: employee.hireDate,
      employmentDurationMonths: employee.employmentDurationMonths,
      weeklyWorkHours: employee.weeklyWorkHours,
      monthlySalary: employee.monthlySalary,
      isCurrentEmployee: employee.isCurrentEmployee,
      eligiblePrograms,
      ineligiblePrograms,
      totalEstimatedSubsidy,
    };
  }

  private checkYouthJobLeap(
    employee: AnalyzedEmployee,
    regionType: RegionType,
    eligible: EligibleProgramInfo[],
    ineligible: IneligibleProgramInfo[]
  ): void {
    const program = SubsidyProgram.YOUTH_JOB_LEAP;
    const programName = PROGRAM_NAMES[program];
    const reasons: string[] = [];
    const missingRequirements: string[] = [];

    if (!employee.isYouth) {
      reasons.push(`청년 연령 요건 미충족 (15~34세 필요, 현재: ${employee.age ?? '미확인'}세)`);
      missingRequirements.push('청년 연령 확인 (주민등록번호)');
    }

    if (!employee.hasEmploymentInsurance) {
      reasons.push('고용보험 미가입');
      missingRequirements.push('고용보험 가입');
    }

    if (employee.workType === 'PART_TIME') {
      reasons.push('시간제 근로자 (주 30시간 이상 필요)');
      missingRequirements.push('주 30시간 이상 근로');
    }

    if (regionType === 'CAPITAL') {
      reasons.push('수도권 지역: 취업애로청년 요건 확인 필요');
    }

    if (
      employee.isYouth &&
      employee.hasEmploymentInsurance &&
      employee.workType !== 'PART_TIME'
    ) {
      const monthlyAmount = 600000;
      const totalMonths = 12;
      const baseAmount = monthlyAmount * totalMonths;
      let incentiveAmount = 0;

      if (regionType === 'NON_CAPITAL') {
        incentiveAmount = 4800000;
      }

      const breakdown = this.createYouthJobLeapBreakdown(
        employee,
        regionType,
        monthlyAmount,
        totalMonths,
        incentiveAmount
      );

      eligible.push({
        program,
        programName,
        estimatedAmount: baseAmount + incentiveAmount,
        paymentPeriod: '6개월 고용유지 후 신청, 12개월간 지급',
        breakdown,
      });
    } else {
      ineligible.push({
        program,
        programName,
        reasons,
        missingRequirements,
      });
    }
  }

  private createYouthJobLeapBreakdown(
    _employee: AnalyzedEmployee,
    regionType: RegionType,
    monthlyAmount: number,
    totalMonths: number,
    incentiveAmount: number
  ): CalculationBreakdown {
    const steps: CalculationStep[] = [
      {
        stepNumber: 1,
        description: '월 지원금 확인',
        formula: '기본 지원금 = 월 60만원 (2026년 기준)',
        inputValues: { 월지원금: monthlyAmount },
        result: monthlyAmount,
      },
      {
        stepNumber: 2,
        description: '지급 기간 확인',
        formula: '지급 기간 = 12개월',
        inputValues: { 지급개월수: totalMonths },
        result: totalMonths,
      },
      {
        stepNumber: 3,
        description: '기본 지원금 계산',
        formula: '기본 총액 = 월 지원금 × 지급 개월수',
        inputValues: { 월지원금: monthlyAmount, 지급개월수: totalMonths },
        result: monthlyAmount * totalMonths,
      },
    ];

    if (incentiveAmount > 0) {
      steps.push({
        stepNumber: 4,
        description: '비수도권 장기근속 인센티브',
        formula: '2년 근속 시 추가 지급 (일반 480만원 / 취업애로 720만원)',
        inputValues: { 지역: regionType, 인센티브: incentiveAmount },
        result: incentiveAmount,
      });
    }

    steps.push({
      stepNumber: steps.length + 1,
      description: '최종 예상 지원금',
      formula: '총액 = 기본 총액 + 인센티브',
      inputValues: {
        기본총액: monthlyAmount * totalMonths,
        인센티브: incentiveAmount,
      },
      result: monthlyAmount * totalMonths + incentiveAmount,
    });

    const paymentSchedule: PaymentScheduleItem[] = [
      {
        period: '채용 후 6개월',
        amount: monthlyAmount * 6,
        conditions: '6개월 고용유지 후 1차 신청',
      },
      {
        period: '채용 후 12개월',
        amount: monthlyAmount * 6,
        conditions: '추가 6개월 고용유지 후 2차 신청',
      },
    ];

    if (incentiveAmount > 0) {
      paymentSchedule.push({
        period: '채용 후 24개월',
        amount: incentiveAmount,
        conditions: '2년 근속 시 장기근속 인센티브 별도 신청',
      });
    }

    return {
      programName: PROGRAM_NAMES[SubsidyProgram.YOUTH_JOB_LEAP],
      eligibleEmployees: 1,
      calculationFormula: '월 60만원 × 12개월 + 비수도권 인센티브',
      steps,
      baseAmount: monthlyAmount * totalMonths,
      incentiveAmount,
      totalAmount: monthlyAmount * totalMonths + incentiveAmount,
      paymentSchedule,
    };
  }

  private checkSeniorPrograms(
    employee: AnalyzedEmployee,
    eligible: EligibleProgramInfo[],
    ineligible: IneligibleProgramInfo[]
  ): void {
    if (!employee.isSenior) {
      ineligible.push({
        program: SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
        programName: PROGRAM_NAMES[SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT],
        reasons: [`고령자 연령 요건 미충족 (60세 이상 필요, 현재: ${employee.age ?? '미확인'}세)`],
        missingRequirements: ['60세 이상 연령 확인'],
      });
      return;
    }

    if (!employee.hasEmploymentInsurance) {
      ineligible.push({
        program: SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
        programName: PROGRAM_NAMES[SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT],
        reasons: ['고용보험 미가입'],
        missingRequirements: ['고용보험 가입'],
      });
      return;
    }

    const quarterlyAmount = 300000;
    const totalQuarters = 8;
    const totalAmount = quarterlyAmount * totalQuarters;

    const breakdown = this.createSeniorSupportBreakdown(
      quarterlyAmount,
      totalQuarters
    );

    eligible.push({
      program: SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
      programName: PROGRAM_NAMES[SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT],
      estimatedAmount: totalAmount,
      paymentPeriod: '분기별 지급, 최대 2년 (8분기)',
      breakdown,
    });
  }

  private createSeniorSupportBreakdown(
    quarterlyAmount: number,
    totalQuarters: number
  ): CalculationBreakdown {
    const steps: CalculationStep[] = [
      {
        stepNumber: 1,
        description: '분기별 지원금 확인',
        formula: '분기 지원금 = 30만원',
        inputValues: { 분기지원금: quarterlyAmount },
        result: quarterlyAmount,
      },
      {
        stepNumber: 2,
        description: '지급 기간 확인',
        formula: '최대 지급 기간 = 2년 (8분기)',
        inputValues: { 총분기수: totalQuarters },
        result: totalQuarters,
      },
      {
        stepNumber: 3,
        description: '최종 예상 지원금',
        formula: '총액 = 분기 지원금 × 총 분기수',
        inputValues: { 분기지원금: quarterlyAmount, 총분기수: totalQuarters },
        result: quarterlyAmount * totalQuarters,
      },
    ];

    const paymentSchedule: PaymentScheduleItem[] = Array.from(
      { length: totalQuarters },
      (_, i) => ({
        period: `${i + 1}분기`,
        amount: quarterlyAmount,
        conditions: `피보험기간 1년 초과 60세 이상 근로자 고용 유지`,
      })
    );

    return {
      programName: PROGRAM_NAMES[SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT],
      eligibleEmployees: 1,
      calculationFormula: '분기 30만원 × 최대 8분기 (2년)',
      steps,
      baseAmount: quarterlyAmount * totalQuarters,
      incentiveAmount: 0,
      totalAmount: quarterlyAmount * totalQuarters,
      paymentSchedule,
    };
  }

  private checkEmploymentPromotion(
    employee: AnalyzedEmployee,
    eligible: EligibleProgramInfo[],
    ineligible: IneligibleProgramInfo[]
  ): void {
    const program = SubsidyProgram.EMPLOYMENT_PROMOTION;
    const programName = PROGRAM_NAMES[program];
    const reasons: string[] = [];
    const missingRequirements: string[] = [];

    if (!employee.hasEmploymentInsurance) {
      reasons.push('고용보험 미가입');
      missingRequirements.push('고용보험 가입');
    }

    reasons.push('취업취약계층 해당 여부 확인 필요');
    missingRequirements.push(
      '취업지원프로그램 이수 증빙 (국민취업지원제도, 여성새로일하기센터 등)'
    );

    if (employee.isSenior) {
      const monthlyAmount = 600000;
      const totalMonths = 12;
      const breakdown = this.createEmploymentPromotionBreakdown(
        monthlyAmount,
        totalMonths
      );

      eligible.push({
        program,
        programName,
        estimatedAmount: monthlyAmount * totalMonths,
        paymentPeriod: '6개월 단위 신청, 최대 1년',
        breakdown,
      });
    } else {
      ineligible.push({
        program,
        programName,
        reasons,
        missingRequirements,
      });
    }
  }

  private createEmploymentPromotionBreakdown(
    monthlyAmount: number,
    totalMonths: number
  ): CalculationBreakdown {
    const steps: CalculationStep[] = [
      {
        stepNumber: 1,
        description: '월 지원금 확인 (취업취약계층 유형별)',
        formula: '중증장애인/여성가장: 월 60만원, 기타: 월 30만원',
        inputValues: { 월지원금: monthlyAmount },
        result: monthlyAmount,
      },
      {
        stepNumber: 2,
        description: '지급 기간 확인',
        formula: '최대 1년 (장애인/여성가장) 또는 6개월',
        inputValues: { 지급개월수: totalMonths },
        result: totalMonths,
      },
      {
        stepNumber: 3,
        description: '최종 예상 지원금',
        formula: '총액 = 월 지원금 × 지급 개월수',
        inputValues: { 월지원금: monthlyAmount, 지급개월수: totalMonths },
        result: monthlyAmount * totalMonths,
      },
    ];

    return {
      programName: PROGRAM_NAMES[SubsidyProgram.EMPLOYMENT_PROMOTION],
      eligibleEmployees: 1,
      calculationFormula: '월 30~60만원 × 6~12개월 (취약계층 유형별)',
      steps,
      baseAmount: monthlyAmount * totalMonths,
      incentiveAmount: 0,
      totalAmount: monthlyAmount * totalMonths,
      paymentSchedule: [
        {
          period: '채용 후 6개월',
          amount: monthlyAmount * 6,
          conditions: '1차: 6개월 고용유지 후 신청',
        },
        {
          period: '채용 후 12개월',
          amount: monthlyAmount * 6,
          conditions: '2차: 추가 6개월 고용유지 후 신청 (해당 유형만)',
        },
      ],
    };
  }

  analyzeAllEmployees(
    wageLedger?: WageLedgerData,
    insuranceList?: InsuranceListData,
    contracts?: EmploymentContractData[],
    regionType: RegionType = 'CAPITAL'
  ): PerEmployeeCalculation[] {
    const employees = this.mergeEmployeeData(
      wageLedger,
      insuranceList,
      contracts
    );
    return employees.map((emp) =>
      this.analyzeEmployeeEligibility(emp, regionType)
    );
  }

  getEmployeeSummary(calculations: PerEmployeeCalculation[]): {
    totalEmployees: number;
    youthCount: number;
    seniorCount: number;
    eligibleForAnyProgram: number;
    totalEstimatedSubsidy: number;
    byProgram: Map<SubsidyProgram, { count: number; total: number }>;
  } {
    const byProgram = new Map<SubsidyProgram, { count: number; total: number }>();

    for (const program of Object.values(SubsidyProgram)) {
      byProgram.set(program, { count: 0, total: 0 });
    }

    let eligibleForAnyProgram = 0;

    for (const calc of calculations) {
      if (calc.eligiblePrograms.length > 0) {
        eligibleForAnyProgram++;
      }

      for (const eligible of calc.eligiblePrograms) {
        const current = byProgram.get(eligible.program)!;
        current.count++;
        current.total += eligible.estimatedAmount;
      }
    }

    return {
      totalEmployees: calculations.length,
      youthCount: calculations.filter((c) => c.isYouth).length,
      seniorCount: calculations.filter((c) => c.isSenior).length,
      eligibleForAnyProgram,
      totalEstimatedSubsidy: calculations.reduce(
        (sum, c) => sum + c.totalEstimatedSubsidy,
        0
      ),
      byProgram,
    };
  }
}

export const employeeAnalysisService = new EmployeeAnalysisService();
