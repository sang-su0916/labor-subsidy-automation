import { ExtractionStatus } from '../../types/extraction.types';
import { LoadingSpinner } from '../common';
import clsx from 'clsx';

interface ExtractionProgressProps {
  jobs: Array<{
    documentName: string;
    status: ExtractionStatus;
    progress?: number;
  }>;
}

const statusLabels: Record<ExtractionStatus, string> = {
  [ExtractionStatus.PENDING]: '대기 중',
  [ExtractionStatus.PROCESSING]: '추출 중...',
  [ExtractionStatus.COMPLETED]: '완료',
  [ExtractionStatus.FAILED]: '실패',
};

export default function ExtractionProgress({ jobs }: ExtractionProgressProps) {
  const completedCount = jobs.filter((j) => j.status === ExtractionStatus.COMPLETED).length;
  const totalCount = jobs.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">전체 진행률</span>
          <span className="text-sm text-slate-600">{completedCount}/{totalCount} 완료</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job, index) => (
          <div
            key={index}
            className={clsx(
              'flex items-center gap-3 p-3 rounded-lg border',
              job.status === ExtractionStatus.COMPLETED && 'bg-green-50 border-green-200',
              job.status === ExtractionStatus.PROCESSING && 'bg-blue-50 border-blue-200',
              job.status === ExtractionStatus.FAILED && 'bg-red-50 border-red-200',
              job.status === ExtractionStatus.PENDING && 'bg-slate-50 border-slate-200'
            )}
          >
            {job.status === ExtractionStatus.PROCESSING ? (
              <LoadingSpinner size="sm" />
            ) : job.status === ExtractionStatus.COMPLETED ? (
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : job.status === ExtractionStatus.FAILED ? (
              <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{job.documentName}</p>
              <p className={clsx(
                'text-xs',
                job.status === ExtractionStatus.COMPLETED && 'text-green-600',
                job.status === ExtractionStatus.PROCESSING && 'text-blue-600',
                job.status === ExtractionStatus.FAILED && 'text-red-600',
                job.status === ExtractionStatus.PENDING && 'text-slate-500'
              )}>
                {statusLabels[job.status]}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
