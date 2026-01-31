import { SubsidyCalculation, SUBSIDY_PROGRAM_LABELS } from '../../types/subsidy.types';
import { Card, CardContent, Badge } from '../common';
import clsx from 'clsx';

interface SubsidyResultCardProps {
  calculation: SubsidyCalculation;
}

export default function SubsidyResultCard({ calculation }: SubsidyResultCardProps) {
  const isEligible = calculation.eligibility === 'ELIGIBLE';
  const needsReview = calculation.eligibility === 'NEEDS_REVIEW';

  return (
    <Card padding="lg" className={clsx(
      'border-l-4',
      isEligible && 'border-l-green-500',
      needsReview && 'border-l-amber-500',
      !isEligible && !needsReview && 'border-l-red-500'
    )}>
      <CardContent>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {SUBSIDY_PROGRAM_LABELS[calculation.program]}
            </h3>
            <Badge
              variant={isEligible ? 'success' : needsReview ? 'warning' : 'error'}
              size="md"
              className="mt-1"
            >
              {isEligible ? '지원 가능' : needsReview ? '검토 필요' : '지원 불가'}
            </Badge>
          </div>
          {(isEligible || needsReview) && (
            <div className="text-right">
              <p className="text-sm text-slate-500">{needsReview ? '예상 지원금 (검토 필요)' : '예상 지원금'}</p>
              <p className={`text-2xl font-bold ${needsReview ? 'text-amber-600' : 'text-blue-600'}`}>
                {new Intl.NumberFormat('ko-KR').format(calculation.totalAmount)}원
              </p>
              {calculation.totalAmount > 0 && (
                <p className="text-sm text-slate-500">
                  월 {new Intl.NumberFormat('ko-KR').format(calculation.monthlyAmount)}원 × {calculation.totalMonths}개월
                </p>
              )}
              {calculation.totalAmount === 0 && needsReview && (
                <p className="text-sm text-amber-500">수동 확인 필요</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {calculation.requirementsMet.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-green-700 mb-2">충족된 요건</h4>
              <ul className="space-y-1">
                {calculation.requirementsMet.map((req) => (
                  <li key={req.id} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>{req.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {calculation.requirementsNotMet.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red-700 mb-2">미충족 요건</h4>
              <ul className="space-y-1">
                {calculation.requirementsNotMet.map((req) => (
                  <li key={req.id} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span>{req.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {calculation.notes.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-sm font-medium text-slate-700 mb-2">참고사항</h4>
              <ul className="space-y-1">
                {calculation.notes.map((note, idx) => (
                  <li key={idx} className="text-sm text-slate-500">• {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
