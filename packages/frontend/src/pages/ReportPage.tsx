import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, Button, LoadingSpinner, Badge } from '../components/common';
import { SUBSIDY_PROGRAM_LABELS, SubsidyProgram } from '../types/subsidy.types';
import { 
  generateFullReport, 
  downloadReportPDF, 
  downloadChecklist, 
  downloadDetailedReport,
  downloadApplicationFormHelper,
  FullReportResponse 
} from '../services/subsidyService';
import { downloadMcKinseyReport, McReportData } from '../services/mcKinseyReportService';
import { downloadLaborAttorneyReport } from '../services/laborAttorneyReportService';
import { 
  LaborAttorneyReportData,
  PROGRAM_DOCUMENT_CHECKLISTS,
} from '../types/laborAttorney.types';
import { generateSampleLaborAttorneyReport } from '../data/sampleLaborAttorneyData';

export default function ReportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [report, setReport] = useState<FullReportResponse['report'] | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<FullReportResponse['downloadUrls'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<'pdf' | 'checklist' | 'detailed' | 'helper' | 'mckinsey' | 'laborAttorney' | 'laborAttorneySample' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/upload');
      return;
    }

    const loadReport = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await generateFullReport(sessionId);
        setReport(response.report);
        setDownloadUrls(response.downloadUrls);
      } catch (err) {
        setError(err instanceof Error ? err.message : '보고서 생성에 실패했습니다');
      } finally {
        setIsLoading(false);
      }
    };

    loadReport();
  }, [sessionId, navigate]);

  const handleDownloadPDF = async () => {
    if (!report?.id) return;

    setIsDownloading('pdf');
    try {
      await downloadReportPDF(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadChecklist = async () => {
    if (!report?.id) return;

    setIsDownloading('checklist');
    try {
      await downloadChecklist(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '체크리스트 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadDetailedReport = async () => {
    if (!report?.id) return;

    setIsDownloading('detailed');
    try {
      await downloadDetailedReport(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '상세 보고서 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadApplicationHelper = async () => {
    if (!report?.id) return;

    setIsDownloading('helper');
    try {
      await downloadApplicationFormHelper(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '신청서 작성 보조 자료 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-slate-600">보고서를 생성하는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          ← 돌아가기
        </Button>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">지원금 분석 보고서</h1>
        <p className="text-slate-600">
          분석 결과를 확인하고 필요한 서류를 다운로드하세요
        </p>
      </div>

      <div className="space-y-6">
        <Card padding="lg">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">사업장 정보</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">상호명</p>
                <p className="font-medium text-slate-900">{report.businessInfo.name || '정보 없음'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">사업자등록번호</p>
                <p className="font-medium text-slate-900">{report.businessInfo.registrationNumber || '정보 없음'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card padding="lg" className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent>
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">총 예상 지원금</p>
              <p className="text-4xl font-bold text-blue-600">
                {new Intl.NumberFormat('ko-KR').format(report.totalEligibleAmount)}원
              </p>
              <p className="text-sm text-slate-500 mt-2">
                {report.eligibleCalculations.length}개 프로그램 지원 가능
              </p>
            </div>
          </CardContent>
        </Card>

        {report.eligibleCalculations.length > 0 && (
          <Card padding="lg">
            <CardContent>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                지원 가능 프로그램
              </h2>
              <div className="space-y-4">
                {report.eligibleCalculations.map((calc) => (
                  <div
                    key={calc.program}
                    className="p-4 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="success">지원 가능</Badge>
                        <h3 className="font-semibold text-slate-900">
                          {SUBSIDY_PROGRAM_LABELS[calc.program]}
                        </h3>
                      </div>
                      <p className="font-bold text-green-600">
                        {new Intl.NumberFormat('ko-KR').format(calc.totalAmount)}원
                      </p>
                    </div>
                    <div className="text-sm text-slate-600">
                      <p>
                        {calc.quarterlyAmount
                          ? `분기 ${new Intl.NumberFormat('ko-KR').format(calc.quarterlyAmount)}원`
                          : `월 ${new Intl.NumberFormat('ko-KR').format(calc.monthlyAmount)}원`}
                        {calc.totalMonths > 0 && ` × ${calc.totalMonths}개월`}
                        {calc.incentiveAmount && calc.incentiveAmount > 0 && (
                          <span className="ml-2 text-indigo-600">
                            + 인센티브 {new Intl.NumberFormat('ko-KR').format(calc.incentiveAmount)}원
                          </span>
                        )}
                      </p>
                    </div>
                    {calc.notes.length > 0 && (
                      <ul className="mt-2 text-sm text-slate-500 list-disc list-inside">
                        {calc.notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {report.excludedSubsidies && report.excludedSubsidies.length > 0 && (
          <Card padding="lg">
            <CardContent>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                중복 수급 제외 프로그램
              </h2>
              <div className="space-y-3">
                {report.excludedSubsidies.map((excluded) => (
                  <div
                    key={excluded.program}
                    className="p-4 bg-amber-50 border border-amber-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="warning">제외</Badge>
                      <h3 className="font-medium text-slate-900">
                        {SUBSIDY_PROGRAM_LABELS[excluded.program]}
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600">{excluded.reason}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      우선 적용: {SUBSIDY_PROGRAM_LABELS[excluded.excludedBy]}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {report.applicationChecklist && report.applicationChecklist.length > 0 && (
          <Card padding="lg">
            <CardContent>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                신청 체크리스트
              </h2>
              <div className="space-y-6">
                {report.applicationChecklist.map((item) => (
                  <div key={item.program} className="border-b border-slate-200 pb-4 last:border-0">
                    <h3 className="font-semibold text-slate-900 mb-3">
                      {item.programName}
                    </h3>
                    <div className="grid gap-3 text-sm">
                      <div>
                        <p className="text-slate-500 font-medium">필요 서류</p>
                        <ul className="mt-1 list-disc list-inside text-slate-700">
                          {item.requiredDocuments.map((doc, idx) => (
                            <li key={idx}>{doc}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-slate-500 font-medium">신청처</p>
                          <p className="text-slate-700">{item.applicationSite}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 font-medium">신청 기한</p>
                          <p className="text-slate-700">{item.applicationPeriod}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">문의처</p>
                        <p className="text-slate-700">{item.contactInfo}</p>
                      </div>
                      {item.notes.length > 0 && (
                        <div>
                          <p className="text-slate-500 font-medium">참고사항</p>
                          <ul className="mt-1 list-disc list-inside text-slate-700">
                            {item.notes.map((note, idx) => (
                              <li key={idx}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card padding="lg" className="bg-slate-50">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              기본 보고서 다운로드
            </h2>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                onClick={handleDownloadPDF}
                disabled={isDownloading !== null}
                isLoading={isDownloading === 'pdf'}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              >
                PDF 보고서 다운로드
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleDownloadChecklist}
                disabled={isDownloading !== null}
                isLoading={isDownloading === 'checklist'}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
              >
                신청 체크리스트 다운로드
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card padding="lg" className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              상세 분석 보고서
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              직원별 지원금 분석, 상세 계산 내역, 지급 일정이 포함된 상세 보고서입니다.
            </p>
            <Button
              size="lg"
              onClick={handleDownloadDetailedReport}
              disabled={isDownloading !== null}
              isLoading={isDownloading === 'detailed'}
              className="bg-indigo-600 hover:bg-indigo-700"
              leftIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              상세 분석 보고서 다운로드 (PDF)
            </Button>
          </CardContent>
        </Card>

        <Card padding="lg" className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              노무사/인사담당자용 신청서 보조 자료
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              추출된 데이터를 바탕으로 지원금 신청서 작성에 필요한 정보를 정리한 자료입니다.
              직원 명부, 프로그램별 대상자, 필요 서류 목록이 포함됩니다.
            </p>
            <Button
              size="lg"
              onClick={handleDownloadApplicationHelper}
              disabled={isDownloading !== null}
              isLoading={isDownloading === 'helper'}
              className="bg-emerald-600 hover:bg-emerald-700"
              leftIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              신청서 작성 보조 자료 다운로드 (PDF)
            </Button>
          </CardContent>
        </Card>

        <Card padding="lg" className="bg-gradient-to-r from-slate-50 to-gray-100 border-slate-300">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              맥킨지 스타일 경영진 보고서
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              경영진 보고용으로 제작된 전문 컨설팅 스타일의 A4 보고서입니다.
              Executive Summary, 핵심 지표, 프로그램별 분석이 포함됩니다.
            </p>
            <Button
              size="lg"
              onClick={async () => {
                if (!report) return;
                setIsDownloading('mckinsey');
                try {
                  const mcReportData: McReportData = {
                    businessInfo: {
                      name: report.businessInfo.name,
                      registrationNumber: report.businessInfo.registrationNumber,
                    },
                    eligibleCalculations: report.eligibleCalculations.map(calc => ({
                      program: calc.program,
                      programName: SUBSIDY_PROGRAM_LABELS[calc.program] || calc.program,
                      eligible: true,
                      eligibility: calc.eligibility,
                      monthlyAmount: calc.monthlyAmount,
                      totalMonths: calc.totalMonths,
                      totalAmount: calc.totalAmount,
                      incentiveAmount: calc.incentiveAmount,
                      quarterlyAmount: calc.quarterlyAmount,
                      notes: calc.notes,
                    })),
                    excludedSubsidies: report.excludedSubsidies,
                    totalEligibleAmount: report.totalEligibleAmount,
                    applicationChecklist: report.applicationChecklist,
                    generatedAt: report.generatedAt,
                  };
                  await downloadMcKinseyReport(mcReportData, `${report.businessInfo.name || '고용지원금'}_맥킨지보고서.pdf`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : '맥킨지 보고서 생성에 실패했습니다');
                } finally {
                  setIsDownloading(null);
                }
              }}
              disabled={isDownloading !== null}
              isLoading={isDownloading === 'mckinsey'}
              className="bg-slate-700 hover:bg-slate-800"
              leftIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              맥킨지 스타일 보고서 다운로드 (PDF)
            </Button>
          </CardContent>
        </Card>

        <Card padding="lg" className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
          <CardContent>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              노무사용 신청서 양식 (출력용)
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              노무사나 인사담당자가 고용지원금을 직접 신청할 때 사용하는 출력용 양식입니다.
              사업장 정보, 직원 명부, 계좌 정보, 프로그램별 서류 체크리스트가 포함됩니다.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={async () => {
                  if (!report) return;
                  setIsDownloading('laborAttorney');
                  try {
                    const laborData: LaborAttorneyReportData = {
                      reportTitle: '고용지원금 신청서 작성 보조 자료',
                      reportDate: new Date().toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }),
                      reportId: report.id,
                      businessInfo: {
                        name: report.businessInfo.name || '',
                        registrationNumber: report.businessInfo.registrationNumber || '',
                        representativeName: '',
                        address: '',
                        region: 'CAPITAL',
                        isSmallBusiness: true,
                      },
                      employees: [],
                      employeeSummary: {
                        total: 0,
                        youth: 0,
                        senior: 0,
                        fullTime: 0,
                        partTime: 0,
                        contract: 0,
                      },
                      programDetails: report.eligibleCalculations.map(calc => ({
                        program: calc.program as SubsidyProgram,
                        programName: SUBSIDY_PROGRAM_LABELS[calc.program] || calc.program,
                        applicationSite: '고용24 (www.work24.go.kr)',
                        applicationPeriod: '채용 후 6개월 경과 시점부터 신청 가능',
                        contactInfo: '고용노동부 고객상담센터 1350',
                        eligibleEmployees: [],
                        estimatedTotalAmount: calc.totalAmount,
                        monthlyAmount: calc.monthlyAmount,
                        quarterlyAmount: calc.quarterlyAmount,
                        supportDurationMonths: calc.totalMonths,
                        requiredDocuments: PROGRAM_DOCUMENT_CHECKLISTS[calc.program as SubsidyProgram] || [],
                        notes: calc.notes,
                      })),
                      totalEstimatedAmount: report.totalEligibleAmount,
                      eligibleProgramCount: report.eligibleCalculations.length,
                      masterChecklist: [],
                      disclaimers: [
                        '본 자료는 고용지원금 신청을 돕기 위한 참고 자료입니다.',
                        '실제 지원 가능 여부는 고용노동부 심사를 통해 최종 결정됩니다.',
                        '신청 전 고용24 (www.work24.go.kr)에서 최신 요건을 반드시 확인하세요.',
                        '문의: 고용노동부 고객상담센터 1350',
                      ],
                    };
                    await downloadLaborAttorneyReport(laborData, `${report.businessInfo.name || '고용지원금'}_노무사용양식.pdf`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '노무사용 양식 생성에 실패했습니다');
                  } finally {
                    setIsDownloading(null);
                  }
                }}
                disabled={isDownloading !== null}
                isLoading={isDownloading === 'laborAttorney'}
                className="bg-orange-600 hover:bg-orange-700"
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                }
              >
                노무사용 양식 다운로드 (PDF)
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={async () => {
                  setIsDownloading('laborAttorneySample');
                  try {
                    const sampleData = generateSampleLaborAttorneyReport();
                    await downloadLaborAttorneyReport(sampleData, '고용지원금_노무사용양식_샘플.pdf');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '샘플 양식 생성에 실패했습니다');
                  } finally {
                    setIsDownloading(null);
                  }
                }}
                disabled={isDownloading !== null}
                isLoading={isDownloading === 'laborAttorneySample'}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              >
                샘플 데이터로 미리보기
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" onClick={() => navigate(`/subsidy?sessionId=${sessionId}`)}>
            ← 지원금 확인으로 돌아가기
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            처음으로
          </Button>
        </div>
      </div>
    </div>
  );
}
