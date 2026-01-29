export enum SubsidyProgram {
  YOUTH_JOB_LEAP = 'YOUTH_JOB_LEAP',
  EMPLOYMENT_PROMOTION = 'EMPLOYMENT_PROMOTION',
  REGULAR_CONVERSION = 'REGULAR_CONVERSION',
  SENIOR_CONTINUED_EMPLOYMENT = 'SENIOR_CONTINUED_EMPLOYMENT',
  SENIOR_EMPLOYMENT_SUPPORT = 'SENIOR_EMPLOYMENT_SUPPORT',
  PARENTAL_EMPLOYMENT_STABILITY = 'PARENTAL_EMPLOYMENT_STABILITY',
}

export type RegionType = 'CAPITAL' | 'NON_CAPITAL';

export const SUBSIDY_PROGRAM_LABELS: Record<SubsidyProgram, string> = {
  [SubsidyProgram.YOUTH_JOB_LEAP]: '청년일자리도약장려금',
  [SubsidyProgram.EMPLOYMENT_PROMOTION]: '고용촉진장려금',
  [SubsidyProgram.REGULAR_CONVERSION]: '정규직전환지원금',
  [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: '고령자계속고용장려금',
  [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: '고령자고용지원금',
  [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: '출산육아기 고용안정장려금',
};

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
    representativeName?: string;
    businessAddress?: string;
    businessType?: string;
    businessItem?: string;
    industryCode?: string;
    industryName?: string;
    establishmentDate?: string;
    employmentInsuranceNumber?: string;
    headCount?: number;
    regionType?: string;
    companySize?: string;
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
