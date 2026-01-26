import { DocumentType, FileFormat } from '../config/constants';

export interface UploadedDocument {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  fileFormat: FileFormat;
  documentType: DocumentType | null;
  uploadedAt: string;
  path: string;
  sessionId: string;
}

export interface Session {
  id: string;
  createdAt: string;
  documents: string[]; // document IDs
}

export interface BusinessRegistrationData {
  businessNumber: string;
  businessName: string;
  representativeName: string;
  businessAddress: string;
  businessType: string;
  businessItem: string;
  registrationDate: string;
  /** 업종코드 (통계청 분류 코드) */
  industryCode?: string;
  /** 업종명 (상세) */
  industryName?: string;
  /** 법인 설립일 (법인 사업자의 경우) */
  establishmentDate?: string;
  /** 고용보험 관리번호 */
  employmentInsuranceNumber?: string;
  /** 상시 근로자 수 */
  headCount?: number;
  /** 사업자 유형: 개인/법인/기타 */
  businessCategory?: 'INDIVIDUAL' | 'CORPORATION' | 'OTHER';
  /** 우선지원대상기업 여부 (중소기업 등) */
  isSmallMediumBusiness?: boolean;
}

export interface EmployeeData {
  name: string;
  residentRegistrationNumber: string;
  hireDate: string;
  position: string;
  department?: string;
  monthlyWage: number;
  weeklyWorkHours?: number;
  insuranceEnrollmentDate?: string;
  calculatedAge?: number;
  birthYear?: number;
  employmentDurationMonths?: number;
  isYouth?: boolean;
  isSenior?: boolean;
  workType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
}

export interface WageLedgerData {
  period: string;
  employees: EmployeeData[];
  totalWage: number;
}

export interface EmploymentContractData {
  employeeName: string;
  employerName: string;
  employerRepresentative?: string;
  contractStartDate: string;
  contractEndDate?: string;
  workType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  monthlySalary: number;
  weeklyWorkHours: number;
  residentRegistrationNumber?: string;
  birthDate?: string;
  calculatedAge?: number;
  isYouth?: boolean;
  isSenior?: boolean;
  probationPeriodMonths?: number;
  isProbation?: boolean;
  jobPosition?: string;
  department?: string;
  workplaceAddress?: string;
  dailyWorkHours?: number;
  workDaysPerWeek?: number;
  overtimeAllowed?: boolean;
  socialInsuranceEnrollment?: {
    employmentInsurance?: boolean;
    nationalPension?: boolean;
    healthInsurance?: boolean;
    industrialAccident?: boolean;
  };
  contractType?: 'INDEFINITE' | 'FIXED_TERM' | 'TEMPORARY';
  isRenewal?: boolean;
}

export interface InsuranceEmployeeData {
  name: string;
  insuranceNumber: string;
  enrollmentDate: string;
  employmentInsurance?: boolean;
  nationalPension?: boolean;
  healthInsurance?: boolean;
  industrialAccident?: boolean;
  /** 데이터 출처: 'extracted' = 문서에서 추출됨, 'unknown' = 확인 불가 */
  dataSource?: 'extracted' | 'unknown';
}

export interface InsuranceListData {
  employees: InsuranceEmployeeData[];
}

export type ExtractedDocumentData =
  | BusinessRegistrationData
  | WageLedgerData
  | EmploymentContractData
  | InsuranceListData;
