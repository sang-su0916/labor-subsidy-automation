import api from './api';
import { 
  SubsidyProgram, 
  SubsidyCalculation,
  SubsidyReport,
} from '../types/subsidy.types';

interface ExcludedSubsidy {
  program: SubsidyProgram;
  reason: string;
  excludedBy: SubsidyProgram;
}

interface ApplicationChecklistItem {
  program: SubsidyProgram;
  programName: string;
  requiredDocuments: string[];
  applicationSite: string;
  applicationPeriod: string;
  contactInfo: string;
  notes: string[];
}

interface SubsidyReportWithExclusions extends SubsidyReport {
  eligibleCalculations: SubsidyCalculation[];
  excludedSubsidies: ExcludedSubsidy[];
  totalEligibleAmount: number;
  applicationChecklist: ApplicationChecklistItem[];
}

export interface FullReportResponse {
  report: SubsidyReportWithExclusions;
  downloadUrls: {
    pdf: string;
    checklist: string;
  };
}

interface ProgramInfo {
  id: SubsidyProgram;
  name: string;
  description: string;
  maxAmount: string;
  requirements: string[];
}

interface CalculateResponse {
  success: boolean;
  data: {
    calculations: SubsidyCalculation[];
  };
}

export async function getPrograms(): Promise<ProgramInfo[]> {
  const response = await api.get('/subsidy/programs');
  return response.data.data.programs;
}

export async function calculateEligibility(
  sessionId: string,
  programs: SubsidyProgram[]
): Promise<SubsidyCalculation[]> {
  const response = await api.post<CalculateResponse>('/subsidy/calculate', {
    sessionId,
    programs,
  });
  return response.data.data.calculations;
}

export async function generateFullReport(
  sessionId: string,
  programs?: SubsidyProgram[]
): Promise<FullReportResponse> {
  const response = await api.post<{ success: boolean; data: FullReportResponse }>(
    '/subsidy/report/full',
    { sessionId, programs }
  );
  return response.data.data;
}

export async function downloadReportPDF(reportId: string): Promise<void> {
  const response = await api.get(`/subsidy/report/${reportId}/pdf`, {
    responseType: 'blob',
  });
  
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `subsidy_report_${reportId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function downloadChecklist(reportId: string): Promise<void> {
  const response = await api.get(`/subsidy/report/${reportId}/checklist`, {
    responseType: 'blob',
  });
  
  const blob = new Blob([response.data], { type: 'text/plain; charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `application_checklist_${reportId}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function downloadDetailedReport(reportId: string): Promise<void> {
  const response = await api.get(`/subsidy/report/${reportId}/detailed-pdf`, {
    responseType: 'blob',
  });
  
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `detailed_subsidy_report_${reportId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function downloadApplicationFormHelper(reportId: string): Promise<void> {
  const response = await api.get(`/subsidy/report/${reportId}/application-helper`, {
    responseType: 'blob',
  });
  
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `application_form_helper_${reportId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
