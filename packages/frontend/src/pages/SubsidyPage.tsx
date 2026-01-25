import { useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, Button } from '../components/common';
import { SubsidyProgramCard, SubsidyResultCard } from '../components/subsidy';
import { SubsidyProgram, SubsidyCalculation, SUBSIDY_PROGRAM_LABELS } from '../types/subsidy.types';
import {
  calculateEligibility,
  generateFullReport,
  downloadReportPDF,
  downloadApplicationFormHelper
} from '../services/subsidyService';

const ALL_PROGRAMS = [
  SubsidyProgram.YOUTH_JOB_LEAP,
  SubsidyProgram.EMPLOYMENT_PROMOTION,
  SubsidyProgram.EMPLOYMENT_RETENTION,
  SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
  SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
  SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY,
];

const REQUIRED_DOCUMENTS: Record<SubsidyProgram, { required: string[]; optional: string[]; site: string }> = {
  [SubsidyProgram.YOUTH_JOB_LEAP]: {
    required: [
      '사업자등록증 사본',
      '근로계약서 사본',
      '월별 임금대장 (6개월분)',
      '4대보험 가입내역 확인서',
      '청년 본인 신분증 사본',
      '고용보험 피보험자격 이력내역서',
    ],
    optional: ['취업지원프로그램 이수확인서 (유형I)'],
    site: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  [SubsidyProgram.EMPLOYMENT_PROMOTION]: {
    required: [
      '사업자등록증 사본',
      '근로계약서 사본',
      '월별 임금대장',
      '취업지원프로그램 이수확인서',
      '취약계층 증빙서류',
      '4대보험 가입내역 확인서',
    ],
    optional: [],
    site: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  [SubsidyProgram.EMPLOYMENT_RETENTION]: {
    required: [
      '사업자등록증 사본',
      '매출액 감소 증빙자료',
      '휴업·휴직 계획서',
      '근로자대표 동의서',
      '휴업·휴직 실시 대상자 명단',
      '휴업수당 지급대장',
      '통장 사본',
    ],
    optional: [],
    site: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: {
    required: [
      '사업자등록증 사본',
      '취업규칙 또는 단체협약 (정년제도 변경 내용)',
      '계속고용 근로자 명부',
      '근로계약서 사본',
      '임금대장',
      '4대보험 가입내역 확인서',
    ],
    optional: [],
    site: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: {
    required: [
      '사업자등록증 사본',
      '60세 이상 근로자 명부',
      '근로계약서 사본',
      '월별 임금대장',
      '고용보험 피보험자격 이력내역서',
    ],
    optional: [],
    site: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: {
    required: [
      '사업자등록증 사본',
      '육아휴직 신청서 및 확인서',
      '육아휴직 대상 근로자의 가족관계증명서',
      '근로계약서 사본',
      '임금대장',
    ],
    optional: [
      '대체인력 근로계약서 (대체인력 지원 시)',
      '업무분담 계획서 (업무분담 지원 시)',
    ],
    site: '고용보험 기업서비스 (www.ei.go.kr)',
  },
};

export default function SubsidyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [selectedPrograms, setSelectedPrograms] = useState<Set<SubsidyProgram>>(new Set(ALL_PROGRAMS));
  const [calculations, setCalculations] = useState<SubsidyCalculation[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<'amount' | 'application' | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const documentsRef = useRef<HTMLDivElement>(null);

  const toggleProgram = useCallback((program: SubsidyProgram) => {
    setSelectedPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(program)) {
        next.delete(program);
      } else {
        next.add(program);
      }
      return next;
    });
  }, []);

  const handleCalculate = async () => {
    if (!sessionId) {
      navigate('/upload');
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const results = await calculateEligibility(sessionId, Array.from(selectedPrograms));
      setCalculations(results);
      setHasCalculated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '지원금 계산에 실패했습니다');
    } finally {
      setIsCalculating(false);
    }
  };

  const eligibleCount = calculations.filter((c) => c.eligibility === 'ELIGIBLE').length;
  const totalAmount = calculations
    .filter((c) => c.eligibility === 'ELIGIBLE')
    .reduce((sum, c) => sum + c.totalAmount, 0);

  const handleDownloadAmountReport = async () => {
    if (!sessionId) return;

    setIsDownloading('amount');
    setError(null);

    try {
      let currentReportId = reportId;
      if (!currentReportId) {
        const response = await generateFullReport(sessionId, Array.from(selectedPrograms));
        currentReportId = response.report.id;
        setReportId(currentReportId);
      }
      await downloadReportPDF(currentReportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '보고서 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadApplicationInfo = async () => {
    if (!sessionId) return;

    setIsDownloading('application');
    setError(null);

    try {
      let currentReportId = reportId;
      if (!currentReportId) {
        const response = await generateFullReport(sessionId, Array.from(selectedPrograms));
        currentReportId = response.report.id;
        setReportId(currentReportId);
      }
      await downloadApplicationFormHelper(currentReportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '신청정보 보고서 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(null);
    }
  };

  const handlePrintDocuments = () => {
    const selectedProgramsList = Array.from(selectedPrograms);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>고용지원금 필요서류 목록</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
            body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 30px; font-size: 24px; }
            .program { margin-bottom: 30px; page-break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
            .program-title { font-size: 16px; font-weight: bold; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #3b82f6; color: #1e40af; }
            .section-title { font-size: 13px; font-weight: bold; color: #374151; margin: 12px 0 8px 0; }
            .doc-list { margin: 0; padding-left: 20px; }
            .doc-item { padding: 4px 0; font-size: 14px; }
            .required { color: #dc2626; }
            .optional { color: #6b7280; }
            .site { margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #4b5563; }
            .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #9ca3af; }
            @media print { body { padding: 0; } .program { border: 1px solid #000; } }
          </style>
        </head>
        <body>
          <h1>고용지원금 신청 필요서류 안내</h1>
          <p style="text-align: center; color: #6b7280; margin-bottom: 30px;">2026년 기준 | 선택된 ${selectedProgramsList.length}개 프로그램</p>
          ${selectedProgramsList.map(program => {
            const docs = REQUIRED_DOCUMENTS[program];
            return `
              <div class="program">
                <div class="program-title">${SUBSIDY_PROGRAM_LABELS[program]}</div>
                <div class="section-title">필수 서류</div>
                <ul class="doc-list">
                  ${docs.required.map(doc => `<li class="doc-item required">• ${doc}</li>`).join('')}
                </ul>
                ${docs.optional.length > 0 ? `
                  <div class="section-title">선택 서류</div>
                  <ul class="doc-list">
                    ${docs.optional.map(doc => `<li class="doc-item optional">• ${doc}</li>`).join('')}
                  </ul>
                ` : ''}
                <div class="site"><strong>신청처:</strong> ${docs.site}</div>
              </div>
            `;
          }).join('')}
          <div class="footer">고용지원금 자동화 시스템에서 생성됨</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">지원금 확인</h1>
        <p className="text-slate-600">
          신청 가능한 고용지원금을 확인하세요
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <Card padding="lg">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              확인할 지원금 프로그램 선택
            </h2>
            <div className="grid gap-4">
              {ALL_PROGRAMS.map((program) => (
                <SubsidyProgramCard
                  key={program}
                  program={program}
                  isSelected={selectedPrograms.has(program)}
                  onToggle={() => toggleProgram(program)}
                  disabled={isCalculating}
                />
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Button
                size="lg"
                onClick={handleCalculate}
                disabled={selectedPrograms.size === 0 || isCalculating}
                isLoading={isCalculating}
              >
                {isCalculating ? '분석 중...' : '지원금 분석하기'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 필요 서류 안내 섹션 */}
        <Card padding="lg" className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  지원금 신청 필요서류 안내
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  선택된 {selectedPrograms.size}개 프로그램의 필요 서류를 확인하세요
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={showDocuments ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setShowDocuments(!showDocuments)}
                >
                  {showDocuments ? '접기' : '펼치기'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintDocuments}
                  disabled={selectedPrograms.size === 0}
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  }
                >
                  출력
                </Button>
              </div>
            </div>

            {showDocuments && (
              <div ref={documentsRef} className="space-y-4 mt-4">
                {Array.from(selectedPrograms).map((program) => {
                  const docs = REQUIRED_DOCUMENTS[program];
                  return (
                    <div key={program} className="p-4 bg-white rounded-lg border border-amber-200">
                      <h3 className="font-semibold text-slate-900 mb-3 pb-2 border-b border-amber-100">
                        {SUBSIDY_PROGRAM_LABELS[program]}
                      </h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-red-600 mb-2">필수 서류</p>
                          <ul className="space-y-1">
                            {docs.required.map((doc, idx) => (
                              <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                                <span className="text-red-500 mt-0.5">•</span>
                                {doc}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {docs.optional.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-500 mb-2">선택 서류</p>
                            <ul className="space-y-1">
                              {docs.optional.map((doc, idx) => (
                                <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                                  <span className="text-slate-400 mt-0.5">•</span>
                                  {doc}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
                        신청처: {docs.site}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {hasCalculated && (
          <>
            <Card padding="lg" className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
              <CardContent>
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">총 예상 지원금</p>
                  <p className="text-4xl font-bold text-blue-600">
                    {new Intl.NumberFormat('ko-KR').format(totalAmount)}원
                  </p>
                  <p className="text-sm text-slate-500 mt-2">
                    {eligibleCount}개 프로그램 지원 가능
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">분석 결과</h2>
              {calculations.map((calc) => (
                <SubsidyResultCard key={calc.program} calculation={calc} />
              ))}
            </div>

            {eligibleCount > 0 && (
              <Card padding="lg" className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                <CardContent>
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    보고서 출력
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-white rounded-lg border border-green-200">
                      <h3 className="font-medium text-slate-900 mb-2">신청가능금액 보고서</h3>
                      <p className="text-sm text-slate-600 mb-4">
                        법인별 지원 가능한 고용지원금과 예상 금액을 정리한 보고서입니다.
                      </p>
                      <Button
                        onClick={handleDownloadAmountReport}
                        disabled={isDownloading !== null}
                        isLoading={isDownloading === 'amount'}
                        className="w-full"
                        leftIcon={
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        }
                      >
                        금액 보고서 출력 (PDF)
                      </Button>
                    </div>
                    <div className="p-4 bg-white rounded-lg border border-green-200">
                      <h3 className="font-medium text-slate-900 mb-2">신청정보 보고서</h3>
                      <p className="text-sm text-slate-600 mb-4">
                        지원금 사이트 신청에 필요한 정보를 정리한 보고서입니다.
                      </p>
                      <Button
                        onClick={handleDownloadApplicationInfo}
                        disabled={isDownloading !== null}
                        isLoading={isDownloading === 'application'}
                        className="w-full"
                        leftIcon={
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        }
                      >
                        신청정보 보고서 출력 (PDF)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" onClick={() => navigate(`/extraction?sessionId=${sessionId}`)}>
            ← 이전 단계
          </Button>
          {hasCalculated && eligibleCount > 0 && (
            <Button
              size="lg"
              onClick={() => navigate(`/report?sessionId=${sessionId}`)}
              rightIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              보고서 생성
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
