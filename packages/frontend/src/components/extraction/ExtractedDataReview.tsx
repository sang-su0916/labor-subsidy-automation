import { DocumentType, DOCUMENT_TYPE_LABELS } from '../../types/document.types';
import { ExtractionResult } from '../../types/extraction.types';
import { Card, CardContent, Badge } from '../common';

interface ExtractedDataReviewProps {
  result: ExtractionResult;
  documentName: string;
  onFieldChange?: (field: string, value: string) => void;
}

const fieldLabels: Record<string, string> = {
  businessNumber: '사업자등록번호',
  businessName: '상호',
  representativeName: '대표자명',
  businessAddress: '사업장 소재지',
  businessType: '업태',
  businessItem: '종목',
  registrationDate: '개업년월일',
  period: '급여 기간',
  totalWage: '총 급여액',
  employeeName: '근로자명',
  employerName: '사용자명',
  contractStartDate: '계약 시작일',
  contractEndDate: '계약 종료일',
  workType: '근무 형태',
  monthlySalary: '월 급여',
  weeklyWorkHours: '주 근로시간',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    if (key.includes('Wage') || key.includes('Salary')) {
      return new Intl.NumberFormat('ko-KR').format(value) + '원';
    }
    if (key.includes('Hours')) {
      return value + '시간';
    }
    return String(value);
  }
  if (key === 'workType') {
    const types: Record<string, string> = {
      FULL_TIME: '정규직',
      PART_TIME: '시간제',
      CONTRACT: '계약직',
    };
    return types[String(value)] || String(value);
  }
  return String(value);
}

export default function ExtractedDataReview({
  result,
  documentName,
}: ExtractedDataReviewProps) {
  const data = result.extractedData as Record<string, unknown> | null;

  return (
    <Card padding="lg">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">{documentName}</h3>
            <p className="text-sm text-slate-500">
              {DOCUMENT_TYPE_LABELS[result.documentType]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={result.confidence >= 80 ? 'success' : result.confidence >= 50 ? 'warning' : 'error'}>
              신뢰도 {result.confidence}%
            </Badge>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800 mb-1">추출 경고</p>
            <ul className="text-sm text-amber-700 list-disc list-inside">
              {result.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {data ? (
          <div className="grid gap-4">
            {Object.entries(data).map(([key, value]) => {
              if (key === 'employees') return null;
              const label = fieldLabels[key] || key;
              return (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-600">{label}</span>
                  <span className="text-sm font-medium text-slate-900">
                    {formatValue(key, value)}
                  </span>
                </div>
              );
            })}

            {'employees' in data && Array.isArray(data.employees) && (data.employees as unknown[]).length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-2">
                  직원 정보 ({(data.employees as unknown[]).length}명)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left text-slate-600">성명</th>
                        <th className="px-3 py-2 text-left text-slate-600">입사일</th>
                        <th className="px-3 py-2 text-right text-slate-600">급여</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.employees as Array<Record<string, unknown>>).map((emp, idx) => (
                        <tr key={idx} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-900">{String(emp.name || '-')}</td>
                          <td className="px-3 py-2 text-slate-600">{String(emp.hireDate || '-')}</td>
                          <td className="px-3 py-2 text-right text-slate-900">
                            {emp.monthlyWage
                              ? new Intl.NumberFormat('ko-KR').format(Number(emp.monthlyWage)) + '원'
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">추출된 데이터가 없습니다</p>
        )}
      </CardContent>
    </Card>
  );
}
