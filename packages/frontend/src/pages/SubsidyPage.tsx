import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, Button, LoadingSpinner } from '../components/common';
import { SubsidyProgramCard, SubsidyResultCard } from '../components/subsidy';
import { SubsidyProgram, SubsidyCalculation } from '../types/subsidy.types';
import { calculateEligibility } from '../services/subsidyService';

const ALL_PROGRAMS = [
  SubsidyProgram.YOUTH_JOB_LEAP,
  SubsidyProgram.EMPLOYMENT_PROMOTION,
  SubsidyProgram.EMPLOYMENT_RETENTION,
  SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
  SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
  SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY,
];

export default function SubsidyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [selectedPrograms, setSelectedPrograms] = useState<Set<SubsidyProgram>>(new Set(ALL_PROGRAMS));
  const [calculations, setCalculations] = useState<SubsidyCalculation[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
