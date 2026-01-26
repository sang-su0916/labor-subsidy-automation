import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { subsidyService } from '../services/subsidy.service';
import { reportService } from '../services/report.service';
import { employeeAnalysisService } from '../services/employeeAnalysis.service';
import { crossValidationService } from '../services/crossValidation.service';
import { documentMatcherService, DocumentMatchResult } from '../services/document-matcher.service';
import { validateResidentNumber, validateBusinessNumber } from '../utils/korean.utils';
import { validateMonthlyWage } from '../utils/validation.utils';
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

      const { data: extractedData } = await this.getExtractedDataForSession(sessionId);
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

      const { data: extractedData, confidences } = await this.getExtractedDataForSession(sessionId);

      // 근로계약서-급여대장 문서 매칭 수행
      let matchResult: DocumentMatchResult | null = null;
      if (extractedData.wageLedger && extractedData.employmentContracts) {
        const contracts = extractedData.employmentContracts as EmploymentContractData[];
        const wageLedger = extractedData.wageLedger as WageLedgerData;

        const { matchResult: mr, mergedWageLedger } = documentMatcherService.matchAndMerge(
          wageLedger,
          contracts
        );
        matchResult = mr;

        // 매칭된 급여대장으로 대체
        extractedData.wageLedger = mergedWageLedger;

        console.log(`[DocumentMatcher] 매칭 완료: ${mr.matchedCount}/${mr.totalWageLedgerEmployees}명 (${mr.matchRate}%)`);
        console.log(`[DocumentMatcher] 청년: ${mr.youthCount}명, 고령자: ${mr.seniorCount}명`);
      }

      const calculations = subsidyService.calculateAll(extractedData, programList);
      const reportWithExclusions = subsidyService.generateReportWithExclusions(extractedData, calculations);

      const reportPath = path.join(config.reportsDir, `${reportWithExclusions.id}.json`);
      await saveJsonFile(reportPath, reportWithExclusions);

      // 근로계약서 배열 처리
      const contracts = extractedData.employmentContracts as EmploymentContractData[] | undefined
        || (extractedData.employmentContract ? [extractedData.employmentContract as EmploymentContractData] : undefined);

      const perEmployeeCalculations = employeeAnalysisService.analyzeAllEmployees(
        extractedData.wageLedger as WageLedgerData | undefined,
        extractedData.insuranceList as InsuranceListData | undefined,
        contracts
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

      // 1. 누락 문서 경고 (임금대장)
      if (!extractedData.wageLedger) {
        dataQualityWarnings.push({
          field: '임금대장',
          documentType: 'WAGE_LEDGER',
          severity: 'HIGH',
          message: '임금대장이 업로드되지 않아 직원 정보를 확인할 수 없습니다.',
          suggestedAction: '임금대장을 업로드하여 정확한 지원금 계산을 받으세요.',
        });
      }

      // 2. 누락 문서 경고 (보험명부)
      if (!extractedData.insuranceList) {
        dataQualityWarnings.push({
          field: '4대보험 가입자명부',
          documentType: 'INSURANCE_LIST',
          severity: 'MEDIUM',
          message: '4대보험 가입자명부가 업로드되지 않아 보험 가입 현황을 확인할 수 없습니다.',
          suggestedAction: '4대보험 가입자명부를 업로드하세요.',
        });
      }

      // 3. 나이 정보 누락 경고
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

      // 4. 주민번호 체크섬 실패 경고
      if (extractedData.wageLedger) {
        const wageLedger = extractedData.wageLedger as WageLedgerData;
        const employeesWithInvalidRRN = wageLedger.employees?.filter(e => {
          if (!e.residentRegistrationNumber) return false;
          const result = validateResidentNumber(e.residentRegistrationNumber);
          return !result.isValid;
        }) || [];

        if (employeesWithInvalidRRN.length > 0) {
          dataQualityWarnings.push({
            field: '주민등록번호',
            documentType: 'WAGE_LEDGER',
            severity: 'HIGH',
            message: `${employeesWithInvalidRRN.length}명의 주민등록번호 체크섬이 일치하지 않습니다. OCR 오류일 가능성이 있습니다.`,
            suggestedAction: '주민등록번호를 다시 확인하세요.',
          });
        }
      }

      // 5. 사업자등록번호 체크섬 실패 경고
      if (extractedData.businessRegistration) {
        const bizReg = extractedData.businessRegistration as { businessNumber?: string };
        if (bizReg.businessNumber) {
          const result = validateBusinessNumber(bizReg.businessNumber);
          if (!result.isValid) {
            dataQualityWarnings.push({
              field: '사업자등록번호',
              documentType: 'BUSINESS_REGISTRATION',
              severity: 'HIGH',
              message: `사업자등록번호 체크섬이 일치하지 않습니다: ${result.error}`,
              suggestedAction: '사업자등록번호를 다시 확인하세요.',
            });
          }
        }
      }

      // 6. 문서 간 불일치 경고 (교차 검증)
      if (extractedData.wageLedger || extractedData.insuranceList) {
        const crossValidation = crossValidationService.performFullCrossValidation(
          extractedData.wageLedger as WageLedgerData | undefined,
          extractedData.insuranceList as InsuranceListData | undefined,
          contracts
        );

        for (const warning of crossValidation.warnings) {
          // 중복 방지 (이미 추가된 경고 제외)
          const isDuplicate = dataQualityWarnings.some(
            w => w.field === warning.field && w.message === warning.message
          );
          if (!isDuplicate && (warning.severity === 'HIGH' || warning.severity === 'MEDIUM')) {
            dataQualityWarnings.push({
              field: warning.field,
              documentType: warning.documentType || 'CROSS_VALIDATION',
              severity: warning.severity,
              message: warning.message,
              suggestedAction: warning.suggestedAction,
            });
          }
        }
      }

      // 7. 보험 상태 불확실 경고
      if (extractedData.insuranceList) {
        const insuranceList = extractedData.insuranceList as InsuranceListData;
        const employeesWithUnknownInsurance = insuranceList.employees?.filter(
          e => e.dataSource === 'unknown'
        ) || [];

        if (employeesWithUnknownInsurance.length > 0) {
          dataQualityWarnings.push({
            field: '보험 가입 상태',
            documentType: 'INSURANCE_LIST',
            severity: 'MEDIUM',
            message: `${employeesWithUnknownInsurance.length}명의 4대보험 가입 상태를 확인할 수 없습니다.`,
            suggestedAction: '4대보험 가입자명부 원본을 확인하세요.',
          });
        }
      }

      // 8. 입사일 누락 경고
      const employeesWithoutHireDate = perEmployeeCalculations.filter(e => !e.hireDate);
      if (employeesWithoutHireDate.length > 0) {
        dataQualityWarnings.push({
          field: '입사일',
          documentType: 'EMPLOYMENT_CONTRACT',
          severity: 'MEDIUM',
          message: `${employeesWithoutHireDate.length}명의 입사일을 확인할 수 없습니다. 고용유지기간 계산이 정확하지 않을 수 있습니다.`,
          suggestedAction: '근로계약서 또는 임금대장에서 입사일을 확인하세요.',
        });
      }

      // 9. 시간제 근로자 감지 경고
      const partTimeEmployees = perEmployeeCalculations.filter(e => (e.weeklyWorkHours ?? 40) < 35);
      if (partTimeEmployees.length > 0) {
        dataQualityWarnings.push({
          field: '근로시간',
          documentType: 'EMPLOYMENT_CONTRACT',
          severity: 'LOW',
          message: `${partTimeEmployees.length}명이 시간제 근로자(주 35시간 미만)로 감지되었습니다. 일부 지원금 대상에서 제외될 수 있습니다.`,
          suggestedAction: '시간제 근로자의 근로시간을 확인하세요.',
        });
      }

      // 10. 급여 범위 검증 경고
      if (extractedData.wageLedger) {
        const wageLedger = extractedData.wageLedger as WageLedgerData;
        const employeesWithInvalidWage = wageLedger.employees?.filter(e => {
          if (!e.monthlyWage) return false;
          const result = validateMonthlyWage(e.monthlyWage);
          return !result.isValid;
        }) || [];

        if (employeesWithInvalidWage.length > 0) {
          dataQualityWarnings.push({
            field: '급여',
            documentType: 'WAGE_LEDGER',
            severity: 'MEDIUM',
            message: `${employeesWithInvalidWage.length}명의 급여가 유효 범위(100만원~1억원)를 벗어납니다.`,
            suggestedAction: '급여 데이터가 정확히 추출되었는지 확인하세요.',
          });
        }
      }

      // 11. 미래 날짜 감지 경고
      const today = new Date();
      const employeesWithFutureDate = perEmployeeCalculations.filter(e => {
        if (!e.hireDate) return false;
        const hireDate = new Date(e.hireDate);
        return hireDate > today;
      });
      if (employeesWithFutureDate.length > 0) {
        dataQualityWarnings.push({
          field: '입사일',
          documentType: 'EMPLOYMENT_CONTRACT',
          severity: 'HIGH',
          message: `${employeesWithFutureDate.length}명의 입사일이 미래 날짜로 설정되어 있습니다.`,
          suggestedAction: '입사일을 다시 확인하세요.',
        });
      }

      // 12. 낮은 추출 신뢰도 경고 (60% 미만)
      const DOCUMENT_TYPE_NAMES: Record<string, string> = {
        BUSINESS_REGISTRATION: '사업자등록증',
        WAGE_LEDGER: '임금대장',
        EMPLOYMENT_CONTRACT: '근로계약서',
        INSURANCE_LIST: '4대보험 가입자명부',
      };

      for (const { documentType, confidence } of confidences) {
        if (confidence < 60) {
          const docName = DOCUMENT_TYPE_NAMES[documentType] || documentType;
          dataQualityWarnings.push({
            field: '추출 신뢰도',
            documentType: documentType,
            severity: confidence < 40 ? 'HIGH' : 'MEDIUM',
            message: `${docName}의 데이터 추출 신뢰도가 ${confidence.toFixed(0)}%로 낮습니다. 추출된 정보가 정확하지 않을 수 있습니다.`,
            suggestedAction: '문서가 선명한지 확인하고, 필요시 원본 문서를 다시 업로드하세요.',
          });
        }
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

      // Calculate employee summary from perEmployeeCalculations
      const employeeSummary = {
        total: perEmployeeCalculations.length,
        youth: perEmployeeCalculations.filter(e => e.isYouth).length,
        senior: perEmployeeCalculations.filter(e => e.isSenior).length,
        fullTime: perEmployeeCalculations.filter(e => (e.weeklyWorkHours ?? 40) >= 35).length,
        partTime: perEmployeeCalculations.filter(e => (e.weeklyWorkHours ?? 40) < 35).length,
        contract: 0, // TODO: Add contract type detection if needed
      };

      res.json({
        success: true,
        data: {
          report: reportWithExclusions,
          perEmployeeCalculations,
          employeeSummary,
          documentMatchResult: matchResult,
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

  private async getExtractedDataForSession(sessionId: string): Promise<{
    data: Record<string, unknown>;
    confidences: { documentType: string; confidence: number; documentId: string }[];
  }> {
    const sessionPath = path.join(config.sessionsDir, `${sessionId}.json`);
    const session = await readJsonFile<{ documents: string[] }>(sessionPath);

    if (!session) {
      throw createError('세션을 찾을 수 없습니다', 404);
    }

    const extractedData: Record<string, unknown> = {};
    const confidences: { documentType: string; confidence: number; documentId: string }[] = [];
    // 근로계약서는 여러 개일 수 있으므로 배열로 저장
    const employmentContracts: unknown[] = [];

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
          result?: { documentId: string; extractedData: unknown; confidence?: number };
        }>(extractedPath);

        if (extracted?.result?.documentId === docId) {
          // 신뢰도 정보 저장
          if (typeof extracted.result.confidence === 'number') {
            confidences.push({
              documentType: metadata.documentType,
              confidence: extracted.result.confidence,
              documentId: docId,
            });
          }

          switch (metadata.documentType) {
            case DocumentType.BUSINESS_REGISTRATION:
              extractedData.businessRegistration = extracted.result.extractedData;
              break;
            case DocumentType.WAGE_LEDGER:
              extractedData.wageLedger = extracted.result.extractedData;
              break;
            case DocumentType.EMPLOYMENT_CONTRACT:
              // 근로계약서를 배열에 추가
              employmentContracts.push(extracted.result.extractedData);
              break;
            case DocumentType.INSURANCE_LIST:
              extractedData.insuranceList = extracted.result.extractedData;
              break;
          }
        }
      }
    }

    // 근로계약서 배열 저장
    if (employmentContracts.length > 0) {
      extractedData.employmentContracts = employmentContracts;
      // 기존 단일 값 호환성을 위해 첫 번째 계약서도 저장
      extractedData.employmentContract = employmentContracts[0];
    }

    return { data: extractedData, confidences };
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
