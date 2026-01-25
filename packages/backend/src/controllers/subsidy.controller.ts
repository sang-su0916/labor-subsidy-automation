import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { subsidyService } from '../services/subsidy.service';
import { reportService } from '../services/report.service';
import { employeeAnalysisService } from '../services/employeeAnalysis.service';
import { SubsidyProgram, SubsidyReportWithExclusions, DetailedSubsidyReport, ProgramSummary, DataQualityWarning } from '../types/subsidy.types';
import { WageLedgerData, InsuranceListData, EmploymentContractData } from '../types/document.types';
import { DocumentType } from '../config/constants';
import { config } from '../config';
import { readJsonFile, saveJsonFile } from '../utils/fileSystem';
import { createError } from '../middleware/errorHandler';

const PROGRAM_INFO = [
  {
    id: SubsidyProgram.YOUTH_JOB_LEAP,
    name: '청년일자리도약장려금',
    description: '청년(15~34세)을 정규직으로 신규 채용한 기업에 인건비를 지원합니다. [유형I] 취업애로청년 대상 (수도권 포함), [유형II] 빈일자리업종 청년 대상 (청년에게 480만원 추가 지급).',
    maxAmount: '월 60만원 × 12개월 (720만원) + 비수도권 장기근속 인센티브 최대 720만원',
    requirements: ['15~34세 청년 정규직 채용', '4대보험 가입', '6개월 이상 고용유지 후 신청', '수도권: 취업애로청년만 (유형I)'],
    paymentSchedule: '6개월 고용유지 후 신청, 심사 후 14일 이내 지급',
    cautions: ['15개월간 감원방지의무 위반 시 지원금 반환', 'PC에서만 신청 가능 (모바일 불가)'],
  },
  {
    id: SubsidyProgram.EMPLOYMENT_PROMOTION,
    name: '고용촉진장려금',
    description: '취업취약계층(장애인, 고령자, 경력단절여성, 장기실업자 등)을 고용한 사업주에게 인건비를 지원합니다.',
    maxAmount: '월 30~60만원 × 최대 2년 (최대 1,440만원)',
    requirements: ['취업취약계층 채용', '취업지원프로그램 이수자', '6개월 이상 고용유지'],
    paymentSchedule: '6개월 단위 신청, 심사 후 14일 이내 지급',
    cautions: ['월평균 보수 121만원 미만 근로자 제외', '기간제/일용직/초단시간 근로자 제외'],
  },
  {
    id: SubsidyProgram.EMPLOYMENT_RETENTION,
    name: '고용유지지원금',
    description: '경영 악화로 고용조정이 불가피한 사업주가 휴업·휴직으로 고용을 유지하는 경우 지원합니다.',
    maxAmount: '휴업수당의 1/2~2/3 (1일 최대 66,000원, 연 180일 한도)',
    requirements: ['경영악화 증빙 필수 (매출 15%+ 감소)', '휴업·휴직 계획서 사전제출', '근로자대표 동의'],
    paymentSchedule: '1개월 단위 신청, 조치 종료 다음달 15일까지 신청, 사후 환급',
    cautions: ['계획서 미제출 시 지원 불가', '무급휴업 시 노동위원회 승인 필요'],
  },
  {
    id: SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
    name: '고령자계속고용장려금',
    description: '정년 연장·폐지 또는 재고용 제도를 도입한 기업이 60세 이상 근로자를 계속 고용하는 경우 지원합니다.',
    maxAmount: '분기 90만원 × 최대 3년 (최대 1,080만원)',
    requirements: ['정년제도 변경 (연장 1년+/폐지/재고용)', '60세 이상 계속 고용', '60세 이상 피보험자 비율 30% 이하'],
    paymentSchedule: '분기 단위 신청, 심사 후 14일 이내 지급',
    cautions: ['정년 운영 1년 이상 필요', '재고용 시 모든 희망자 일률 재고용 원칙'],
  },
  {
    id: SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
    name: '고령자고용지원금',
    description: '피보험기간 1년 초과 60세 이상 근로자 수가 증가한 사업주에게 지원합니다.',
    maxAmount: '분기 30만원 × 최대 2년 (8분기, 최대 240만원)',
    requirements: ['60세 이상 근로자 수 증가', '피보험기간 1년 초과', '고용보험 가입 1년 이상 사업장'],
    paymentSchedule: '분기 단위 신청 (분기 마지막달 15일 전후 공고), 심사 후 14일 이내 지급',
    cautions: ['신청 기간 미엄수 시 해당 분기 지원 불가', '단순 채용이 아닌 고령자 "증가" 요건'],
  },
  {
    id: SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY,
    name: '출산육아기 고용안정장려금',
    description: '근로자의 육아휴직, 육아기 근로시간 단축을 허용한 중소기업 사업주를 지원합니다.',
    maxAmount: '육아휴직 월 30만원 (특례: 만12개월 이내 첫3개월 월 100만원) + 대체인력 월 120만원 + 업무분담 월 20~60만원 + 남성인센티브 월 10만원',
    requirements: ['30일 이상 육아휴직/단축 허용', '우선지원대상기업(중소기업)', '종료 후 6개월 이상 계속 고용'],
    paymentSchedule: '3개월 단위 50% 신청, 종료 후 6개월 계속고용 시 잔여 50% 신청',
    cautions: ['2026년부터 특례 금액 변경 (200만원→100만원)', '6개월 계속고용 미충족 시 잔여 50% 미지급'],
  },
];

export class SubsidyController {
  async getPrograms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        data: { programs: PROGRAM_INFO },
      });
    } catch (error) {
      next(error);
    }
  }

  async calculateEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, programs } = req.body;

      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      if (!programs || !Array.isArray(programs) || programs.length === 0) {
        throw createError('확인할 프로그램을 선택해주세요', 400);
      }

      const sessionPath = path.join(config.sessionsDir, `${sessionId}.json`);
      const session = await readJsonFile<{ documents: string[] }>(sessionPath);

      if (!session) {
        throw createError('세션을 찾을 수 없습니다', 404);
      }

      const extractedData: Record<string, unknown> = {};

      for (const docId of session.documents) {
        const metadataPath = path.join(config.dataDir, 'metadata', `${docId}.json`);
        const metadata = await readJsonFile<{ documentType: DocumentType }>(metadataPath);

        if (!metadata?.documentType) continue;

        const extractedFiles = await import('fs/promises').then(fs =>
          fs.readdir(config.extractedDir).catch(() => [])
        );

        for (const file of extractedFiles) {
          const extractedPath = path.join(config.extractedDir, file);
          const extracted = await readJsonFile<{
            result?: { documentId: string; extractedData: unknown };
          }>(extractedPath);

          if (extracted?.result?.documentId === docId) {
            switch (metadata.documentType) {
              case DocumentType.BUSINESS_REGISTRATION:
                extractedData.businessRegistration = extracted.result.extractedData;
                break;
              case DocumentType.WAGE_LEDGER:
                extractedData.wageLedger = extracted.result.extractedData;
                break;
              case DocumentType.EMPLOYMENT_CONTRACT:
                extractedData.employmentContract = extracted.result.extractedData;
                break;
              case DocumentType.INSURANCE_LIST:
                extractedData.insuranceList = extracted.result.extractedData;
                break;
            }
          }
        }
      }

      const calculations = subsidyService.calculateAll(extractedData as any, programs);

      res.json({
        success: true,
        data: { calculations },
      });
    } catch (error) {
      next(error);
    }
  }

  async generateReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, calculations } = req.body;

      if (!sessionId || !calculations) {
        throw createError('세션 ID와 계산 결과가 필요합니다', 400);
      }

      const extractedData = await this.getExtractedDataForSession(sessionId);
      const reportWithExclusions = subsidyService.generateReportWithExclusions(extractedData, calculations);

      const reportPath = path.join(config.reportsDir, `${reportWithExclusions.id}.json`);
      await saveJsonFile(reportPath, reportWithExclusions);

      res.json({
        success: true,
        data: { report: reportWithExclusions },
      });
    } catch (error) {
      next(error);
    }
  }

  async downloadReportPDF(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reportId } = req.params;

      if (!reportId) {
        throw createError('보고서 ID가 필요합니다', 400);
      }

      const reportPath = path.join(config.reportsDir, `${reportId}.json`);
      const report = await readJsonFile<SubsidyReportWithExclusions>(reportPath);

      if (!report) {
        throw createError('보고서를 찾을 수 없습니다', 404);
      }

      const pdfBuffer = await reportService.generatePDFReport(report);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="subsidy_report_${reportId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  async downloadChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reportId } = req.params;

      if (!reportId) {
        throw createError('보고서 ID가 필요합니다', 400);
      }

      const reportPath = path.join(config.reportsDir, `${reportId}.json`);
      const report = await readJsonFile<SubsidyReportWithExclusions>(reportPath);

      if (!report) {
        throw createError('보고서를 찾을 수 없습니다', 404);
      }

      const checklistText = await reportService.generateChecklistText(report.applicationChecklist);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="application_checklist_${reportId}.txt"`);
      res.send(checklistText);
    } catch (error) {
      next(error);
    }
  }

  async generateFullReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, programs } = req.body;

      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      const programList = programs && programs.length > 0 
        ? programs 
        : Object.values(SubsidyProgram);

      const extractedData = await this.getExtractedDataForSession(sessionId);
      const calculations = subsidyService.calculateAll(extractedData, programList);
      const reportWithExclusions = subsidyService.generateReportWithExclusions(extractedData, calculations);

      const reportPath = path.join(config.reportsDir, `${reportWithExclusions.id}.json`);
      await saveJsonFile(reportPath, reportWithExclusions);

      const perEmployeeCalculations = employeeAnalysisService.analyzeAllEmployees(
        extractedData.wageLedger as WageLedgerData | undefined,
        extractedData.insuranceList as InsuranceListData | undefined,
        extractedData.employmentContract ? [extractedData.employmentContract as EmploymentContractData] : undefined
      );

      const summary = employeeAnalysisService.getEmployeeSummary(perEmployeeCalculations);
      
      const summaryByProgram: ProgramSummary[] = [];
      for (const program of Object.values(SubsidyProgram)) {
        const programData = summary.byProgram.get(program);
        if (programData && programData.count > 0) {
          const firstEligible = perEmployeeCalculations
            .flatMap(e => e.eligiblePrograms)
            .find(p => p.program === program);
          
          summaryByProgram.push({
            program,
            programName: subsidyService.getProgramName(program),
            eligibleEmployeeCount: programData.count,
            totalAmount: programData.total,
            breakdown: firstEligible?.breakdown || {
              programName: subsidyService.getProgramName(program),
              eligibleEmployees: programData.count,
              calculationFormula: '',
              steps: [],
              baseAmount: programData.total,
              incentiveAmount: 0,
              totalAmount: programData.total,
              paymentSchedule: [],
            },
          });
        }
      }

      const dataQualityWarnings: DataQualityWarning[] = [];
      
      if (!extractedData.wageLedger) {
        dataQualityWarnings.push({
          field: '임금대장',
          documentType: 'WAGE_LEDGER',
          severity: 'HIGH',
          message: '임금대장이 업로드되지 않아 직원 정보를 확인할 수 없습니다.',
          suggestedAction: '임금대장을 업로드하여 정확한 지원금 계산을 받으세요.',
        });
      }

      if (!extractedData.insuranceList) {
        dataQualityWarnings.push({
          field: '4대보험 가입자명부',
          documentType: 'INSURANCE_LIST',
          severity: 'MEDIUM',
          message: '4대보험 가입자명부가 업로드되지 않아 보험 가입 현황을 확인할 수 없습니다.',
          suggestedAction: '4대보험 가입자명부를 업로드하세요.',
        });
      }

      const employeesWithoutAge = perEmployeeCalculations.filter(e => !e.age);
      if (employeesWithoutAge.length > 0) {
        dataQualityWarnings.push({
          field: '주민등록번호/생년월일',
          documentType: 'WAGE_LEDGER',
          severity: 'MEDIUM',
          message: `${employeesWithoutAge.length}명의 연령을 확인할 수 없습니다. 청년/고령자 분류가 정확하지 않을 수 있습니다.`,
          suggestedAction: '임금대장에 주민등록번호가 포함되어 있는지 확인하세요.',
        });
      }

      const detailedReport: DetailedSubsidyReport = {
        ...reportWithExclusions,
        perEmployeeCalculations,
        summaryByProgram,
        dataQualityWarnings,
        calculationTimestamp: new Date().toISOString(),
      };

      const detailedReportPath = path.join(config.reportsDir, `${reportWithExclusions.id}_detailed.json`);
      await saveJsonFile(detailedReportPath, detailedReport);

      res.json({
        success: true,
        data: { 
          report: reportWithExclusions,
          downloadUrls: {
            pdf: `/api/subsidy/report/${reportWithExclusions.id}/pdf`,
            checklist: `/api/subsidy/report/${reportWithExclusions.id}/checklist`,
            detailedPdf: `/api/subsidy/report/${reportWithExclusions.id}/detailed-pdf`,
            applicationHelper: `/api/subsidy/report/${reportWithExclusions.id}/application-helper`,
          }
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async downloadDetailedReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reportId } = req.params;

      if (!reportId) {
        throw createError('보고서 ID가 필요합니다', 400);
      }

      const reportPath = path.join(config.reportsDir, `${reportId}.json`);
      const baseReport = await readJsonFile<SubsidyReportWithExclusions>(reportPath);

      if (!baseReport) {
        throw createError('보고서를 찾을 수 없습니다', 404);
      }

      const detailedReportPath = path.join(config.reportsDir, `${reportId}_detailed.json`);
      let detailedReport = await readJsonFile<DetailedSubsidyReport>(detailedReportPath);

      if (!detailedReport) {
        throw createError('상세 보고서 데이터를 찾을 수 없습니다. 보고서를 다시 생성해주세요.', 404);
      }

      const pdfBuffer = await reportService.generateDetailedPDFReport(detailedReport);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="detailed_subsidy_report_${reportId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  async downloadApplicationHelper(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reportId } = req.params;

      if (!reportId) {
        throw createError('보고서 ID가 필요합니다', 400);
      }

      const detailedReportPath = path.join(config.reportsDir, `${reportId}_detailed.json`);
      const detailedReport = await readJsonFile<DetailedSubsidyReport>(detailedReportPath);

      if (!detailedReport) {
        throw createError('상세 보고서 데이터를 찾을 수 없습니다. 보고서를 다시 생성해주세요.', 404);
      }

      const pdfBuffer = await reportService.generateApplicationFormHelper(detailedReport);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="application_form_helper_${reportId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  private async getExtractedDataForSession(sessionId: string): Promise<Record<string, unknown>> {
    const sessionPath = path.join(config.sessionsDir, `${sessionId}.json`);
    const session = await readJsonFile<{ documents: string[] }>(sessionPath);

    if (!session) {
      throw createError('세션을 찾을 수 없습니다', 404);
    }

    const extractedData: Record<string, unknown> = {};

    for (const docId of session.documents) {
      const metadataPath = path.join(config.dataDir, 'metadata', `${docId}.json`);
      const metadata = await readJsonFile<{ documentType: DocumentType }>(metadataPath);

      if (!metadata?.documentType) continue;

      const extractedFiles = await import('fs/promises').then(fs =>
        fs.readdir(config.extractedDir).catch(() => [])
      );

      for (const file of extractedFiles) {
        const extractedPath = path.join(config.extractedDir, file);
        const extracted = await readJsonFile<{
          result?: { documentId: string; extractedData: unknown };
        }>(extractedPath);

        if (extracted?.result?.documentId === docId) {
          switch (metadata.documentType) {
            case DocumentType.BUSINESS_REGISTRATION:
              extractedData.businessRegistration = extracted.result.extractedData;
              break;
            case DocumentType.WAGE_LEDGER:
              extractedData.wageLedger = extracted.result.extractedData;
              break;
            case DocumentType.EMPLOYMENT_CONTRACT:
              extractedData.employmentContract = extracted.result.extractedData;
              break;
            case DocumentType.INSURANCE_LIST:
              extractedData.insuranceList = extracted.result.extractedData;
              break;
          }
        }
      }
    }

    return extractedData;
  }

  async analyzeSeniorSubsidyTiming(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      const extractedData = await this.getExtractedDataForSession(sessionId);
      const timingRecommendation = subsidyService.analyzeOptimalSeniorSubsidyTiming(extractedData as any);

      if (!timingRecommendation) {
        throw createError('직원 데이터가 없어 분석할 수 없습니다. 임금대장을 업로드해주세요.', 400);
      }

      res.json({
        success: true,
        data: { timingRecommendation },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const subsidyController = new SubsidyController();
