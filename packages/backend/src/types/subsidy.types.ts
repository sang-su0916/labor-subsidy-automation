/**
 * 2026년 고용지원금 프로그램
 * 
 * 변경사항 (2026년):
 * - YOUTH_JOB_CREATION → YOUTH_JOB_LEAP (청년일자리도약장려금)
 * - 신규: SENIOR_CONTINUED_EMPLOYMENT (고령자계속고용장려금)
 * - 신규: SENIOR_EMPLOYMENT_SUPPORT (고령자고용지원금)
 * - 신규: PARENTAL_EMPLOYMENT_STABILITY (출산육아기 고용안정장려금)
 */
export enum SubsidyProgram {
  /** 청년일자리도약장려금 - 월 60만원 × 12개월, 비수도권 장기근속 인센티브 */
  YOUTH_JOB_LEAP = 'YOUTH_JOB_LEAP',
  /** 고용촉진장려금 - 취업취약계층 채용, 월 30~60만원 × 1~2년 */
  EMPLOYMENT_PROMOTION = 'EMPLOYMENT_PROMOTION',
  /** 고용유지지원금 - 경영악화 시 고용유지, 휴업수당의 2/3 */
  EMPLOYMENT_RETENTION = 'EMPLOYMENT_RETENTION',
  /** 고령자계속고용장려금 - 정년 연장/폐지/재고용, 수도권 월30만/비수도권 월40만 × 3년 */
  SENIOR_CONTINUED_EMPLOYMENT = 'SENIOR_CONTINUED_EMPLOYMENT',
  /** 고령자고용지원금 - 고령자 신규 채용, 분기 30만원 × 2년 */
  SENIOR_EMPLOYMENT_SUPPORT = 'SENIOR_EMPLOYMENT_SUPPORT',
  /** 출산육아기 고용안정장려금 - 육아휴직/근로시간 단축 지원, 월 30~140만원 */
  PARENTAL_EMPLOYMENT_STABILITY = 'PARENTAL_EMPLOYMENT_STABILITY',
}

export type RegionType = 'CAPITAL' | 'NON_CAPITAL';

export type YouthType = 'GENERAL' | 'EMPLOYMENT_DIFFICULTY';

export type SeniorProgramType = 'RETIREMENT_EXTENSION' | 'RETIREMENT_ABOLITION' | 'REEMPLOYMENT';

export type ParentalLeaveType = 'MATERNITY_LEAVE' | 'PARENTAL_LEAVE' | 'REDUCED_HOURS';

export interface SubsidyRequirement {
  id: string;
  description: string;
  isMet: boolean;
  details?: string;
}

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW';

export interface SubsidyCalculation {
  program: SubsidyProgram;
  monthlyAmount: number;
  totalMonths: number;
  totalAmount: number;
  requirementsMet: SubsidyRequirement[];
  requirementsNotMet: SubsidyRequirement[];
  eligibility: EligibilityStatus;
  notes: string[];
  regionType?: RegionType;
  incentiveAmount?: number;
  quarterlyAmount?: number;
}

export interface SubsidyReport {
  id: string;
  generatedAt: string;
  businessInfo: {
    name: string;
    registrationNumber: string;
  };
  calculations: SubsidyCalculation[];
  checklist: ChecklistItem[];
  requiredDocuments: string[];
}

export interface ChecklistItem {
  id: string;
  category: string;
  item: string;
  status: 'COMPLETED' | 'MISSING' | 'NEEDS_REVIEW';
  documentReference?: string;
}

export interface DuplicateExclusionRule {
  program1: SubsidyProgram;
  program2: SubsidyProgram;
  reason: string;
  priority: SubsidyProgram;
}

export interface ExcludedSubsidy {
  program: SubsidyProgram;
  reason: string;
  excludedBy: SubsidyProgram;
}

export interface SubsidyReportWithExclusions extends SubsidyReport {
  eligibleCalculations: SubsidyCalculation[];
  excludedSubsidies: ExcludedSubsidy[];
  totalEligibleAmount: number;
  applicationChecklist: ApplicationChecklistItem[];
}

export interface ApplicationChecklistItem {
  program: SubsidyProgram;
  programName: string;
  requiredDocuments: string[];
  applicationSite: string;
  applicationPeriod: string;
  contactInfo: string;
  notes: string[];
}

export interface CalculationStep {
  stepNumber: number;
  description: string;
  formula?: string;
  inputValues: Record<string, number | string>;
  result: number;
}

export interface CalculationBreakdown {
  programName: string;
  eligibleEmployees: number;
  calculationFormula: string;
  steps: CalculationStep[];
  baseAmount: number;
  incentiveAmount: number;
  totalAmount: number;
  paymentSchedule: PaymentScheduleItem[];
}

export interface PaymentScheduleItem {
  period: string;
  amount: number;
  conditions: string;
}

export interface PerEmployeeCalculation {
  employeeName: string;
  residentRegistrationNumber?: string;
  age?: number;
  isYouth: boolean;
  isSenior: boolean;
  hireDate?: string;
  employmentDurationMonths?: number;
  weeklyWorkHours?: number;
  monthlySalary?: number;
  eligiblePrograms: EligibleProgramInfo[];
  ineligiblePrograms: IneligibleProgramInfo[];
  totalEstimatedSubsidy: number;
}

export interface EligibleProgramInfo {
  program: SubsidyProgram;
  programName: string;
  estimatedAmount: number;
  paymentPeriod: string;
  breakdown: CalculationBreakdown;
}

export interface IneligibleProgramInfo {
  program: SubsidyProgram;
  programName: string;
  reasons: string[];
  missingRequirements: string[];
}

export interface DetailedSubsidyReport extends SubsidyReportWithExclusions {
  perEmployeeCalculations: PerEmployeeCalculation[];
  summaryByProgram: ProgramSummary[];
  dataQualityWarnings: DataQualityWarning[];
  calculationTimestamp: string;
}

export interface ProgramSummary {
  program: SubsidyProgram;
  programName: string;
  eligibleEmployeeCount: number;
  totalAmount: number;
  breakdown: CalculationBreakdown;
}

export interface DataQualityWarning {
  field: string;
  documentType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  suggestedAction: string;
}
