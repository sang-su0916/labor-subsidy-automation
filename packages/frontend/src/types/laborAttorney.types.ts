/**
 * Labor Attorney Report Types
 * 
 * Types for generating printable forms for labor attorneys (노무사) 
 * to submit employment subsidy applications.
 */

import { SubsidyProgram } from './subsidy.types';

// Extended Business Information for application forms
export interface ExtendedBusinessInfo {
  // Basic info
  name: string;
  registrationNumber: string;
  representativeName: string;
  address: string;
  
  // Additional fields for application
  employmentInsuranceNumber?: string;  // 고용보험 관리번호
  industryCode?: string;               // 업종코드
  industryName?: string;               // 업종명
  establishmentDate?: string;          // 설립일/개업일
  totalEmployeeCount?: number;         // 상시근로자 수
  
  // Regional info
  region: 'CAPITAL' | 'NON_CAPITAL';
  regionName?: string;                 // 지역명 (예: 서울특별시 강남구)
  
  // Business size
  isSmallBusiness: boolean;            // 우선지원대상기업 여부
  businessSizeCategory?: string;       // 기업규모 (중소기업, 중견기업, 대기업)
}

// Extended Employee Information for application forms
export interface ExtendedEmployeeInfo {
  // Basic info
  id: string;
  name: string;
  birthDate: string;
  
  // Identification
  residentRegistrationNumber?: string;  // 주민등록번호 (000000-0000000)
  
  // Employment details
  hireDate: string;
  position?: string;                    // 직위/직책
  department?: string;                  // 부서
  jobDescription?: string;              // 담당업무
  
  // Work type
  workType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  weeklyWorkHours?: number;             // 주간 근무시간
  
  // Salary
  monthlySalary: number;
  monthlyWageHistory?: MonthlyWageRecord[];  // 월별 임금 내역
  
  // Insurance
  employmentInsuranceEnrollmentDate?: string;  // 고용보험 가입일
  hasEmploymentInsurance: boolean;
  hasNationalPension: boolean;
  hasHealthInsurance: boolean;
  hasIndustrialAccident?: boolean;
  
  // Calculated fields
  age?: number;
  employmentDurationMonths?: number;
  isYouth?: boolean;                    // 15-34세
  isSenior?: boolean;                   // 60세 이상
}

// Monthly wage record for detailed reporting
export interface MonthlyWageRecord {
  yearMonth: string;      // YYYY-MM
  baseSalary: number;     // 기본급
  allowances?: number;    // 수당
  totalWage: number;      // 총 지급액
  workDays?: number;      // 근무일수
}

// Bank account information for subsidy payment
export interface BankAccountInfo {
  bankName: string;           // 은행명
  accountNumber: string;      // 계좌번호
  accountHolderName: string;  // 예금주
  accountHolderType?: 'BUSINESS' | 'REPRESENTATIVE';  // 계좌 유형 (법인/대표자)
}

// Per-employee program eligibility for the form
export interface EmployeeProgramEligibility {
  employeeId: string;
  employeeName: string;
  programs: Array<{
    program: SubsidyProgram;
    programName: string;
    eligible: boolean;
    estimatedAmount: number;
    applicationPeriod?: string;
    notes?: string[];
  }>;
}

// Document checklist item
export interface DocumentChecklistItem {
  id: string;
  documentName: string;          // 서류명
  description?: string;          // 설명
  isRequired: boolean;           // 필수 여부
  isSubmitted?: boolean;         // 제출 여부 (체크박스용)
  notes?: string;                // 비고
}

// Program-specific application details
export interface ProgramApplicationDetail {
  program: SubsidyProgram;
  programName: string;
  
  // Application info
  applicationSite: string;       // 신청처 (고용24 등)
  applicationPeriod: string;     // 신청 기한
  contactInfo: string;           // 문의처
  
  // Eligible employees
  eligibleEmployees: ExtendedEmployeeInfo[];
  
  // Amounts
  estimatedTotalAmount: number;
  monthlyAmount?: number;
  quarterlyAmount?: number;
  supportDurationMonths: number;
  
  // Required documents
  requiredDocuments: DocumentChecklistItem[];
  
  // Additional notes
  notes?: string[];
}

// Complete Labor Attorney Report Data
export interface LaborAttorneyReportData {
  // Header
  reportTitle: string;
  reportDate: string;
  reportId?: string;
  
  // Business info
  businessInfo: ExtendedBusinessInfo;
  
  // Bank account for payment
  bankAccount?: BankAccountInfo;
  
  // All employees
  employees: ExtendedEmployeeInfo[];
  
  // Employee summary
  employeeSummary: {
    total: number;
    youth: number;     // 청년 (15-34세)
    senior: number;    // 고령자 (60세+)
    fullTime: number;
    partTime: number;
    contract: number;
  };
  
  // Program-specific details
  programDetails: ProgramApplicationDetail[];
  
  // Summary
  totalEstimatedAmount: number;
  eligibleProgramCount: number;
  
  // Comprehensive document checklist
  masterChecklist: DocumentChecklistItem[];
  
  // Notes and disclaimers
  disclaimers: string[];
}

// Predefined document checklists by program
export const PROGRAM_DOCUMENT_CHECKLISTS: Record<SubsidyProgram, DocumentChecklistItem[]> = {
  [SubsidyProgram.YOUTH_JOB_LEAP]: [
    { id: 'yjl-1', documentName: '지원금 신청서', isRequired: true },
    { id: 'yjl-2', documentName: '근로계약서 사본', isRequired: true },
    { id: 'yjl-3', documentName: '4대보험 가입자명부', isRequired: true },
    { id: 'yjl-4', documentName: '월별 임금대장 (최근 6개월)', isRequired: true },
    { id: 'yjl-5', documentName: '급여이체 확인서 (최근 6개월)', isRequired: true },
    { id: 'yjl-6', documentName: '사업자등록증 사본', isRequired: true },
    { id: 'yjl-7', documentName: '대표자 신분증 사본', isRequired: true },
    { id: 'yjl-8', documentName: '고용보험 피보험자격 취득 확인서', isRequired: true },
    { id: 'yjl-9', documentName: '청년 본인 확인 서류 (주민등록등본)', isRequired: true },
    { id: 'yjl-10', documentName: '비수도권 인센티브 신청 시 사업장 소재지 증빙', isRequired: false, notes: '비수도권 사업장만 해당' },
    { id: 'yjl-11', documentName: '청년 채용계획서 (해당 시)', isRequired: false },
  ],
  [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: [
    { id: 'sce-1', documentName: '지원금 신청서', isRequired: true },
    { id: 'sce-2', documentName: '정년 연장/폐지 도입 증빙 (취업규칙 또는 단체협약)', isRequired: true },
    { id: 'sce-3', documentName: '근로계약서 사본', isRequired: true },
    { id: 'sce-4', documentName: '4대보험 가입자명부', isRequired: true },
    { id: 'sce-5', documentName: '월별 임금대장', isRequired: true },
    { id: 'sce-6', documentName: '급여이체 확인서', isRequired: true },
    { id: 'sce-7', documentName: '사업자등록증 사본', isRequired: true },
    { id: 'sce-8', documentName: '고용보험 피보험자격 취득 확인서', isRequired: true },
    { id: 'sce-9', documentName: '정년 도래 확인 서류', isRequired: true },
    { id: 'sce-10', documentName: '계속고용 확인서', isRequired: true },
    { id: 'sce-11', documentName: '법인등기부등본 (법인인 경우)', isRequired: false },
    { id: 'sce-12', documentName: '대표자 신분증 사본', isRequired: true },
  ],
  [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: [
    { id: 'ses-1', documentName: '지원금 신청서', isRequired: true },
    { id: 'ses-2', documentName: '근로계약서 사본', isRequired: true },
    { id: 'ses-3', documentName: '4대보험 가입자명부', isRequired: true },
    { id: 'ses-4', documentName: '월별 임금대장', isRequired: true },
    { id: 'ses-5', documentName: '급여이체 확인서', isRequired: true },
    { id: 'ses-6', documentName: '사업자등록증 사본', isRequired: true },
    { id: 'ses-7', documentName: '고용보험 피보험자격 취득 확인서', isRequired: true },
    { id: 'ses-8', documentName: '고령자 본인 확인 서류 (주민등록등본)', isRequired: true },
    { id: 'ses-9', documentName: '대표자 신분증 사본', isRequired: true },
    { id: 'ses-10', documentName: '법인등기부등본 (법인인 경우)', isRequired: false },
  ],
  [SubsidyProgram.EMPLOYMENT_PROMOTION]: [
    { id: 'ep-1', documentName: '지원금 신청서', isRequired: true },
    { id: 'ep-2', documentName: '취업취약계층 확인서류 (해당 증빙)', isRequired: true, notes: '장애인증명서, 국가유공자증 등' },
    { id: 'ep-3', documentName: '근로계약서 사본', isRequired: true },
    { id: 'ep-4', documentName: '4대보험 가입자명부', isRequired: true },
    { id: 'ep-5', documentName: '월별 임금대장', isRequired: true },
    { id: 'ep-6', documentName: '급여이체 확인서', isRequired: true },
    { id: 'ep-7', documentName: '사업자등록증 사본', isRequired: true },
    { id: 'ep-8', documentName: '고용보험 피보험자격 취득 확인서', isRequired: true },
    { id: 'ep-9', documentName: '취업지원 프로그램 이수 확인서 (해당 시)', isRequired: false },
    { id: 'ep-10', documentName: '구인등록 확인서', isRequired: true },
    { id: 'ep-11', documentName: '대표자 신분증 사본', isRequired: true },
  ],
  [SubsidyProgram.REGULAR_CONVERSION]: [
    { id: 'rc-1', documentName: '지원금 신청서', isRequired: true },
    { id: 'rc-2', documentName: '정규직 전환 확인서류', isRequired: true, notes: '취업규칙, 근로계약서 변경 전/후' },
    { id: 'rc-3', documentName: '근로계약서 사본 (전환 전/후)', isRequired: true },
    { id: 'rc-4', documentName: '4대보험 가입자명부', isRequired: true },
    { id: 'rc-5', documentName: '월별 임금대장', isRequired: true, notes: '전환 전/후 비교용' },
    { id: 'rc-6', documentName: '급여이체 확인서', isRequired: true },
    { id: 'rc-7', documentName: '사업자등록증 사본', isRequired: true },
    { id: 'rc-8', documentName: '고용보험 피보험자격 취득 확인서', isRequired: true },
    { id: 'rc-9', documentName: '임금인상 증빙서류 (해당 시)', isRequired: false, notes: '5% 이상 인상 시 월 60만원 지급' },
    { id: 'rc-10', documentName: '대표자 신분증 사본', isRequired: true },
  ],
  [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: [
    { id: 'pes-1', documentName: '지원금 신청서', isRequired: true },
    { id: 'pes-2', documentName: '육아휴직/근로시간 단축 확인서', isRequired: true },
    { id: 'pes-3', documentName: '육아휴직 급여 신청서 사본', isRequired: true },
    { id: 'pes-4', documentName: '근로계약서 사본', isRequired: true },
    { id: 'pes-5', documentName: '4대보험 가입자명부', isRequired: true },
    { id: 'pes-6', documentName: '월별 임금대장', isRequired: true },
    { id: 'pes-7', documentName: '급여이체 확인서', isRequired: true },
    { id: 'pes-8', documentName: '대체인력 채용 확인 서류 (해당 시)', isRequired: false, notes: '대체인력 지원금 신청 시' },
    { id: 'pes-9', documentName: '사업자등록증 사본', isRequired: true },
    { id: 'pes-10', documentName: '고용보험 피보험자격 취득 확인서', isRequired: true },
    { id: 'pes-11', documentName: '출산/육아 관련 증빙 (출생증명서 등)', isRequired: true },
    { id: 'pes-12', documentName: '업무분담자 지정 확인서 (해당 시)', isRequired: false, notes: '업무분담 지원금 신청 시' },
    { id: 'pes-13', documentName: '대표자 신분증 사본', isRequired: true },
  ],
};

// Korean bank list for dropdown
export const KOREAN_BANKS = [
  '국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '농협은행',
  'IBK기업은행',
  'SC제일은행',
  '케이뱅크',
  '카카오뱅크',
  '토스뱅크',
  '새마을금고',
  '신협',
  '우체국',
  '수협은행',
  '대구은행',
  '부산은행',
  '광주은행',
  '전북은행',
  '경남은행',
  '제주은행',
];
