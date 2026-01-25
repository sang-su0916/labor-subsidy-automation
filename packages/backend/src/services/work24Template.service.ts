import * as XLSX from 'xlsx';
import { SubsidyProgram } from '../types/subsidy.types';
import { employeeAnalysisService } from './employeeAnalysis.service';
import {
  WageLedgerData,
  InsuranceListData,
  EmploymentContractData,
} from '../types/document.types';

interface TemplateEmployee {
  name: string;
  residentNumber6: string;
  residentNumber7: string;
  hireDate: string;
  monthlySalary: number;
  weeklyWorkHours: number | null;
  workType: string | null;
  hasEmploymentInsurance: boolean;
}

type Work24Program = 
  | 'YOUTH_JOB_LEAP'
  | 'EMPLOYMENT_PROMOTION'
  | 'SENIOR_CONTINUED_EMPLOYMENT'
  | 'SENIOR_EMPLOYMENT_SUPPORT';

const YOUTH_JOB_LEAP_COLUMNS = [
  '순번',
  '성명',
  '주민등록번호(앞6자리)',
  '주민등록번호(7번째자리)',
  '채용일(입사일)',
  '월 통상임금',
  '주 소정근로시간',
  '고용형태',
  '고용보험 피보험자격 취득일',
  '정규직 전환일(해당시)',
  '비고',
];

const EMPLOYMENT_PROMOTION_COLUMNS = [
  '순번',
  '성명',
  '주민등록번호(앞6자리)',
  '주민등록번호(7번째자리)',
  '채용일',
  '월 통상임금',
  '주 소정근로시간',
  '취업지원프로그램 이수여부',
  '고용보험 피보험자격 취득일',
  '취업취약계층 유형',
  '비고',
];

const SENIOR_COLUMNS = [
  '순번',
  '성명',
  '주민등록번호(앞6자리)',
  '주민등록번호(7번째자리)',
  '입사일',
  '월 통상임금',
  '주 소정근로시간',
  '정년도달일',
  '계속고용일',
  '고용보험 피보험자격 취득일',
  '비고',
];

export class Work24TemplateService {
  generateTemplate(
    program: Work24Program,
    wageLedger?: WageLedgerData,
    insuranceList?: InsuranceListData,
    employmentContracts?: EmploymentContractData[],
    regionType: 'CAPITAL' | 'NON_CAPITAL' = 'CAPITAL'
  ): Buffer {
    const employees = this.prepareEmployees(wageLedger, insuranceList, employmentContracts);
    const eligibleEmployees = this.filterEligibleEmployees(employees, program, regionType);
    
    const workbook = XLSX.utils.book_new();
    
    let columns: string[];
    let rows: (string | number)[][];
    
    switch (program) {
      case 'YOUTH_JOB_LEAP':
        columns = YOUTH_JOB_LEAP_COLUMNS;
        rows = this.buildYouthJobLeapRows(eligibleEmployees);
        break;
      case 'EMPLOYMENT_PROMOTION':
        columns = EMPLOYMENT_PROMOTION_COLUMNS;
        rows = this.buildEmploymentPromotionRows(eligibleEmployees);
        break;
      case 'SENIOR_CONTINUED_EMPLOYMENT':
      case 'SENIOR_EMPLOYMENT_SUPPORT':
        columns = SENIOR_COLUMNS;
        rows = this.buildSeniorRows(eligibleEmployees);
        break;
      default:
        throw new Error(`Unsupported program: ${program}`);
    }
    
    const sheetData = [columns, ...rows];
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    
    sheet['!cols'] = columns.map((col) => ({
      wch: Math.max(col.length * 2, 15),
    }));
    
    const programNames: Record<Work24Program, string> = {
      YOUTH_JOB_LEAP: '청년일자리도약장려금',
      EMPLOYMENT_PROMOTION: '고용촉진장려금',
      SENIOR_CONTINUED_EMPLOYMENT: '고령자계속고용장려금',
      SENIOR_EMPLOYMENT_SUPPORT: '고령자고용지원금',
    };
    
    XLSX.utils.book_append_sheet(workbook, sheet, programNames[program]);
    
    const instructionSheet = this.createInstructionSheet(program);
    XLSX.utils.book_append_sheet(workbook, instructionSheet, '작성안내');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  private prepareEmployees(
    wageLedger?: WageLedgerData,
    insuranceList?: InsuranceListData,
    employmentContracts?: EmploymentContractData[]
  ): TemplateEmployee[] {
    const merged = employeeAnalysisService.mergeEmployeeData(
      wageLedger,
      insuranceList,
      employmentContracts
    );
    
    return merged.map((emp) => {
      const normalized = (emp.residentRegistrationNumber || '').replace(/[-\s]/g, '');
      return {
        name: emp.name,
        residentNumber6: normalized.substring(0, 6),
        residentNumber7: normalized.length >= 7 ? normalized.substring(6, 7) : '',
        hireDate: emp.hireDate || '',
        monthlySalary: emp.monthlySalary || 0,
        weeklyWorkHours: emp.weeklyWorkHours ?? null,
        workType: emp.workType || null,
        hasEmploymentInsurance: emp.hasEmploymentInsurance,
      };
    });
  }

  private filterEligibleEmployees(
    employees: TemplateEmployee[],
    program: Work24Program,
    regionType: 'CAPITAL' | 'NON_CAPITAL'
  ): TemplateEmployee[] {
    return employees.filter((emp) => {
      if (!emp.hasEmploymentInsurance) return false;
      
      const age = this.calculateAgeFromResident(emp.residentNumber6, emp.residentNumber7);
      
      switch (program) {
        case 'YOUTH_JOB_LEAP':
          return age >= 15 && age <= 34;
        case 'EMPLOYMENT_PROMOTION':
          return true;
        case 'SENIOR_CONTINUED_EMPLOYMENT':
        case 'SENIOR_EMPLOYMENT_SUPPORT':
          return age >= 60;
        default:
          return false;
      }
    });
  }

  private calculateAgeFromResident(front6: string, digit7: string): number {
    if (front6.length < 6) return 0;
    
    const birthYear2 = parseInt(front6.substring(0, 2), 10);
    const century = ['1', '2', '5', '6'].includes(digit7) ? 1900 : 2000;
    const birthYear = century + birthYear2;
    const currentYear = new Date().getFullYear();
    
    return currentYear - birthYear;
  }

  private buildYouthJobLeapRows(employees: TemplateEmployee[]): (string | number)[][] {
    return employees.map((emp, idx) => [
      idx + 1,
      emp.name,
      emp.residentNumber6,
      emp.residentNumber7,
      emp.hireDate,
      emp.monthlySalary,
      emp.weeklyWorkHours ?? '',
      this.mapWorkTypeKorean(emp.workType),
      emp.hireDate,
      '',
      '',
    ]);
  }

  private buildEmploymentPromotionRows(employees: TemplateEmployee[]): (string | number)[][] {
    return employees.map((emp, idx) => [
      idx + 1,
      emp.name,
      emp.residentNumber6,
      emp.residentNumber7,
      emp.hireDate,
      emp.monthlySalary,
      emp.weeklyWorkHours ?? '',
      '',
      emp.hireDate,
      '',
      '',
    ]);
  }

  private buildSeniorRows(employees: TemplateEmployee[]): (string | number)[][] {
    return employees.map((emp, idx) => [
      idx + 1,
      emp.name,
      emp.residentNumber6,
      emp.residentNumber7,
      emp.hireDate,
      emp.monthlySalary,
      emp.weeklyWorkHours ?? '',
      '',
      '',
      emp.hireDate,
      '',
    ]);
  }

  private mapWorkTypeKorean(workType: string | null): string {
    if (!workType) return '';
    switch (workType.toUpperCase()) {
      case 'FULL_TIME': return '정규직';
      case 'CONTRACT': return '계약직';
      case 'PART_TIME': return '단시간';
      default: return '';
    }
  }

  private createInstructionSheet(program: Work24Program): XLSX.WorkSheet {
    const instructions: string[][] = [
      ['고용24 일괄등록 템플릿 작성 안내'],
      [''],
      ['1. 본 템플릿은 고용24 사이트 일괄등록용 양식입니다.'],
      ['2. 주민등록번호는 보안상 앞 6자리와 7번째 자리만 포함되어 있습니다.'],
      ['3. 빈 칸은 직접 입력하거나 해당 없으면 비워두세요.'],
      ['4. 작성 완료 후 고용24(work24.go.kr)에서 업로드하세요.'],
      [''],
      ['※ 주의사항'],
      ['- 실제 신청 전 고용24 공식 양식을 반드시 확인하세요.'],
      ['- 본 템플릿은 데이터 입력 보조용이며, 공식 양식과 다를 수 있습니다.'],
      ['- 담당자 확인 후 제출하시기 바랍니다.'],
    ];
    
    return XLSX.utils.aoa_to_sheet(instructions);
  }
}

export const work24TemplateService = new Work24TemplateService();
