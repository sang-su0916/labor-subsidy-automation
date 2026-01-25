import path from 'path';
import fs from 'fs/promises';
import * as XLSX from 'xlsx';
import { config } from '../config';
import { DocumentType } from '../config/constants';
import { readJsonFile } from '../utils/fileSystem';
import {
  BusinessRegistrationData,
  EmploymentContractData,
  InsuranceListData,
  WageLedgerData,
} from '../types/document.types';
import { SubsidyProgram, SubsidyCalculation, ApplicationChecklistItem } from '../types/subsidy.types';
import { subsidyService } from './subsidy.service';
import { employeeAnalysisService } from './employeeAnalysis.service';
import { detectRegionType } from '../utils/korean.utils';

interface OfficialFormEmployee {
  성명: string;
  주민등록번호_앞자리: string;
  주민등록번호_7자리: string;
  입사일: string;
  월급여: number;
  주당근무시간: number | null;
  고용형태: '정규직' | '계약직' | '파트타임' | null;
  고용보험가입여부: boolean;
}

export interface OfficialFormData {
  사업장명: string;
  사업자등록번호: string;
  대표자명: string;
  사업장주소: string;
  신청프로그램: string;
  대상근로자수: number;
  예상지원금액: number;
  근로자목록: OfficialFormEmployee[];
}

interface ExtractedDataBundle {
  businessRegistration?: BusinessRegistrationData;
  wageLedger?: WageLedgerData;
  employmentContract?: EmploymentContractData;
  insuranceList?: InsuranceListData;
}

interface ProgramSummaryRow {
  program: SubsidyProgram;
  programName: string;
  officialFormName: string;
  eligibleEmployees: number;
  estimatedAmount: number;
}

export class LaborAttorneyExportService {
  private readonly OFFICIAL_FORM_LABELS: Record<SubsidyProgram, string> = {
    [SubsidyProgram.YOUTH_JOB_LEAP]: '사업참여신청서',
    [SubsidyProgram.EMPLOYMENT_PROMOTION]: '지급신청서',
    [SubsidyProgram.EMPLOYMENT_RETENTION]: '지급신청서',
    [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: '지급신청서',
    [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: '지급신청서',
    [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: '지급신청서',
  };

  async exportJson(sessionId: string): Promise<OfficialFormData[]> {
    const exportData = await this.buildExportData(sessionId);
    return exportData.officialForms;
  }

  async exportExcel(sessionId: string): Promise<Buffer> {
    const exportData = await this.buildExportData(sessionId);
    const workbook = XLSX.utils.book_new();

    const businessSheet = XLSX.utils.aoa_to_sheet([
      ['항목', '값'],
      ['사업장명', exportData.businessInfo.name],
      ['사업자등록번호', exportData.businessInfo.registrationNumber],
      ['대표자명', exportData.businessInfo.representativeName],
      ['사업장주소', exportData.businessInfo.address],
      ['추출기준 세션', sessionId],
    ]);
    XLSX.utils.book_append_sheet(workbook, businessSheet, '사업장 정보');

    const summaryRows = [
      ['신청프로그램', '공식서식', '대상근로자수', '예상지원금액'],
      ...exportData.programSummaries.map((summary) => [
        summary.programName,
        summary.officialFormName,
        summary.eligibleEmployees,
        summary.estimatedAmount,
      ]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '지원금 요약');

    const employeeRows = [
      ['성명', '주민등록번호_앞자리', '주민번호_7자리', '입사일', '월급여', '주당근무시간', '고용형태', '고용보험가입여부'],
      ...exportData.employees.map((employee) => [
        employee.성명,
        employee.주민등록번호_앞자리,
        employee.주민등록번호_7자리 || '-',
        employee.입사일,
        employee.월급여,
        employee.주당근무시간 ?? '-',
        employee.고용형태 || '-',
        employee.고용보험가입여부 ? 'Y' : 'N',
      ]),
    ];
    const employeeSheet = XLSX.utils.aoa_to_sheet(employeeRows);
    XLSX.utils.book_append_sheet(workbook, employeeSheet, '근로자 명부');

    const checklistRows = [
      ['프로그램', '공식서식', '필요서류', '신청사이트', '신청기한', '문의처', '참고사항'],
      ...exportData.checklist.map((item) => [
        item.programName,
        this.OFFICIAL_FORM_LABELS[item.program],
        item.requiredDocuments.join('\n'),
        item.applicationSite,
        item.applicationPeriod,
        item.contactInfo,
        item.notes.join('\n'),
      ]),
    ];
    const checklistSheet = XLSX.utils.aoa_to_sheet(checklistRows);
    XLSX.utils.book_append_sheet(workbook, checklistSheet, '신청 체크리스트');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async exportText(sessionId: string): Promise<string> {
    const exportData = await this.buildExportData(sessionId);
    const lines: string[] = [];

    lines.push('고용24 신청 입력용 데이터 (노무사용)');
    lines.push(`세션 ID: ${sessionId}`);
    lines.push(`생성일: ${new Date().toISOString()}`);
    lines.push('');

    lines.push('[사업장 정보]');
    lines.push(`사업장명: ${exportData.businessInfo.name}`);
    lines.push(`사업자등록번호: ${exportData.businessInfo.registrationNumber}`);
    lines.push(`대표자명: ${exportData.businessInfo.representativeName}`);
    lines.push(`사업장주소: ${exportData.businessInfo.address}`);
    lines.push('');

    lines.push('[지원금 요약]');
    if (exportData.programSummaries.length === 0) {
      lines.push('대상 프로그램이 없습니다. (추출 데이터 확인 필요)');
    } else {
      for (const summary of exportData.programSummaries) {
        lines.push(`- ${summary.programName} (${summary.officialFormName})`);
        lines.push(`  대상근로자수: ${summary.eligibleEmployees}명`);
        lines.push(`  예상지원금액: ${this.formatNumber(summary.estimatedAmount)}원`);
      }
    }
    lines.push('');

    lines.push('[근로자 명부]');
    if (exportData.employees.length === 0) {
      lines.push('근로자 정보가 없습니다. 임금대장 또는 근로계약서를 확인해주세요.');
    } else {
      lines.push('성명 | 주민번호(앞6+7자리) | 입사일 | 월급여 | 주당시간 | 고용형태 | 고용보험');
      for (const employee of exportData.employees) {
        const residentDisplay = employee.주민등록번호_앞자리 
          ? `${employee.주민등록번호_앞자리}-${employee.주민등록번호_7자리 || '*'}` 
          : '-';
        lines.push(
          `${employee.성명} | ${residentDisplay} | ${employee.입사일 || '-'} | ${this.formatNumber(employee.월급여)} | ${employee.주당근무시간 ?? '-'}h | ${employee.고용형태 || '-'} | ${employee.고용보험가입여부 ? 'Y' : 'N'}`
        );
      }
    }
    lines.push('');

    lines.push('[신청 체크리스트]');
    if (exportData.checklist.length === 0) {
      lines.push('신청 체크리스트 항목이 없습니다.');
    } else {
      for (const item of exportData.checklist) {
        lines.push(`■ ${item.programName} (${this.OFFICIAL_FORM_LABELS[item.program]})`);
        lines.push(`- 신청 사이트: ${item.applicationSite}`);
        lines.push(`- 신청 기한: ${item.applicationPeriod}`);
        lines.push(`- 문의처: ${item.contactInfo}`);
        lines.push('- 필요 서류:');
        for (const doc of item.requiredDocuments) {
          lines.push(`  □ ${doc}`);
        }
        if (item.notes.length > 0) {
          lines.push('- 참고사항:');
          for (const note of item.notes) {
            lines.push(`  • ${note}`);
          }
        }
        lines.push('');
      }
    }

    lines.push('※ 본 출력은 고용24 신청 입력 보조용입니다. 최신 공고와 요건을 확인하세요.');

    return lines.join('\n');
  }

  private async buildExportData(sessionId: string): Promise<{
    businessInfo: {
      name: string;
      registrationNumber: string;
      representativeName: string;
      address: string;
    };
    employees: OfficialFormEmployee[];
    programSummaries: ProgramSummaryRow[];
    calculations: SubsidyCalculation[];
    checklist: ApplicationChecklistItem[];
    officialForms: OfficialFormData[];
  }> {
    const extractedData = await this.getExtractedDataForSession(sessionId);
    const regionType = detectRegionType(extractedData.businessRegistration?.businessAddress);
    const calculations = subsidyService.calculateAll(
      extractedData,
      Object.values(SubsidyProgram),
      regionType
    );

    const { eligible } = subsidyService.applyDuplicateExclusion(calculations);
    const checklist = subsidyService.generateApplicationChecklist(eligible);

    const employees = this.buildEmployeeList(extractedData);
    const programSummaries = this.buildProgramSummaries(
      extractedData,
      calculations,
      regionType
    );
    const businessInfo = this.buildBusinessInfo(extractedData);
    const officialForms = programSummaries.map((summary) => ({
      사업장명: businessInfo.name,
      사업자등록번호: businessInfo.registrationNumber,
      대표자명: businessInfo.representativeName,
      사업장주소: businessInfo.address,
      신청프로그램: summary.programName,
      대상근로자수: summary.eligibleEmployees,
      예상지원금액: summary.estimatedAmount,
      근로자목록: employees,
    }));

    return {
      businessInfo,
      employees,
      programSummaries,
      calculations,
      checklist,
      officialForms,
    };
  }

  private buildBusinessInfo(extractedData: ExtractedDataBundle): {
    name: string;
    registrationNumber: string;
    representativeName: string;
    address: string;
  } {
    return {
      name: extractedData.businessRegistration?.businessName || '미확인',
      registrationNumber: extractedData.businessRegistration?.businessNumber || '미확인',
      representativeName: extractedData.businessRegistration?.representativeName || '미확인',
      address: extractedData.businessRegistration?.businessAddress || '미확인',
    };
  }

  private buildEmployeeList(extractedData: ExtractedDataBundle): OfficialFormEmployee[] {
    const mergedEmployees = employeeAnalysisService.mergeEmployeeData(
      extractedData.wageLedger,
      extractedData.insuranceList,
      extractedData.employmentContract ? [extractedData.employmentContract] : undefined
    );

    return mergedEmployees.map((emp) => ({
      성명: emp.name,
      주민등록번호_앞자리: this.extractResidentFront(emp.residentRegistrationNumber),
      주민등록번호_7자리: this.extractResident7thDigit(emp.residentRegistrationNumber),
      입사일: emp.hireDate || '',
      월급여: emp.monthlySalary || 0,
      주당근무시간: emp.weeklyWorkHours ?? null,
      고용형태: this.mapWorkType(emp.workType),
      고용보험가입여부: emp.hasEmploymentInsurance,
    }));
  }

  private buildProgramSummaries(
    extractedData: ExtractedDataBundle,
    calculations: SubsidyCalculation[],
    regionType: 'CAPITAL' | 'NON_CAPITAL'
  ): ProgramSummaryRow[] {
    const employeeCalculations = employeeAnalysisService.analyzeAllEmployees(
      extractedData.wageLedger,
      extractedData.insuranceList,
      extractedData.employmentContract ? [extractedData.employmentContract] : undefined,
      regionType
    );
    const summary = employeeAnalysisService.getEmployeeSummary(employeeCalculations);
    const summaryRows: ProgramSummaryRow[] = [];

    for (const program of Object.values(SubsidyProgram)) {
      const programInfo = summary.byProgram.get(program);
      if (programInfo && programInfo.count > 0) {
        summaryRows.push({
          program,
          programName: subsidyService.getProgramName(program),
          officialFormName: this.OFFICIAL_FORM_LABELS[program],
          eligibleEmployees: programInfo.count,
          estimatedAmount: programInfo.total,
        });
      }
    }

    if (summaryRows.length > 0) {
      return summaryRows;
    }

    const fallbackRows: ProgramSummaryRow[] = [];
    for (const calc of calculations) {
      if (calc.eligibility === 'NOT_ELIGIBLE') continue;
      fallbackRows.push({
        program: calc.program,
        programName: subsidyService.getProgramName(calc.program),
        officialFormName: this.OFFICIAL_FORM_LABELS[calc.program],
        eligibleEmployees: extractedData.wageLedger?.employees.length || 0,
        estimatedAmount: calc.totalAmount,
      });
    }

    return fallbackRows;
  }

  private extractResidentFront(residentNumber?: string): string {
    if (!residentNumber) return '';
    const normalized = residentNumber.replace(/\s/g, '').replace(/-/g, '');
    return normalized.substring(0, 6);
  }

  private extractResident7thDigit(residentNumber?: string): string {
    if (!residentNumber) return '';
    const normalized = residentNumber.replace(/\s/g, '').replace(/-/g, '');
    return normalized.length >= 7 ? normalized.substring(6, 7) : '';
  }

  private mapWorkType(workType?: string): '정규직' | '계약직' | '파트타임' | null {
    if (!workType) return null;
    switch (workType.toUpperCase()) {
      case 'FULL_TIME':
        return '정규직';
      case 'CONTRACT':
        return '계약직';
      case 'PART_TIME':
        return '파트타임';
      default:
        return null;
    }
  }

  private formatNumber(value: number): string {
    return value.toLocaleString('en-US');
  }

  private async getExtractedDataForSession(sessionId: string): Promise<ExtractedDataBundle> {
    const sessionPath = path.join(config.sessionsDir, `${sessionId}.json`);
    const session = await readJsonFile<{ documents: string[] }>(sessionPath);
    if (!session) {
      throw new Error('세션을 찾을 수 없습니다');
    }

    const extractedFiles = await fs.readdir(config.extractedDir).catch(() => []);
    const extractedByDocument = new Map<string, unknown>();

    for (const file of extractedFiles) {
      if (!file.endsWith('.json')) continue;
      const extractedPath = path.join(config.extractedDir, file);
      const extracted = await readJsonFile<{
        result?: { documentId: string; extractedData: unknown };
      }>(extractedPath);

      if (extracted?.result?.documentId) {
        extractedByDocument.set(extracted.result.documentId, extracted.result.extractedData);
      }
    }

    const extractedData: ExtractedDataBundle = {};

    for (const docId of session.documents) {
      const metadataPath = path.join(config.dataDir, 'metadata', `${docId}.json`);
      const metadata = await readJsonFile<{ documentType: DocumentType }>(metadataPath);
      if (!metadata?.documentType) continue;

      const extracted = extractedByDocument.get(docId);
      if (!extracted) continue;

      switch (metadata.documentType) {
        case DocumentType.BUSINESS_REGISTRATION:
          extractedData.businessRegistration = extracted as BusinessRegistrationData;
          break;
        case DocumentType.WAGE_LEDGER:
          extractedData.wageLedger = extracted as WageLedgerData;
          break;
        case DocumentType.EMPLOYMENT_CONTRACT:
          extractedData.employmentContract = extracted as EmploymentContractData;
          break;
        case DocumentType.INSURANCE_LIST:
          extractedData.insuranceList = extracted as InsuranceListData;
          break;
      }
    }

    return extractedData;
  }
}

export const laborAttorneyExportService = new LaborAttorneyExportService();
