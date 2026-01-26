import { SubsidyProgram, SUBSIDY_PROGRAM_LABELS } from '../../types/subsidy.types';
import { Card, CardContent } from '../common';
import clsx from 'clsx';

interface SubsidyProgramCardProps {
  program: SubsidyProgram;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const programInfo: Record<SubsidyProgram, { description: string; amount: string; icon: string }> = {
  [SubsidyProgram.YOUTH_JOB_LEAP]: {
    description: '청년을 정규직으로 신규 채용한 기업 지원',
    amount: '월 60만원 × 12개월 + 인센티브',
    icon: '👥',
  },
  [SubsidyProgram.EMPLOYMENT_PROMOTION]: {
    description: '취업취약계층 고용 기업 지원',
    amount: '월 30~60만원 × 1~2년',
    icon: '🤝',
  },
  [SubsidyProgram.REGULAR_CONVERSION]: {
    description: '30인 미만 기업의 비정규직 정규직 전환 지원',
    amount: '월 40~60만원 × 12개월',
    icon: '📋',
  },
  [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: {
    description: '정년 연장/폐지/재고용 기업 지원',
    amount: '월 30~40만원 × 3년',
    icon: '👴',
  },
  [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: {
    description: '60세 이상 고령자 신규 채용 기업 지원',
    amount: '분기 30만원 × 2년',
    icon: '🧓',
  },
  [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: {
    description: '육아휴직/근로시간 단축 허용 기업 지원',
    amount: '월 30~140만원',
    icon: '👶',
  },
};

export default function SubsidyProgramCard({
  program,
  isSelected,
  onToggle,
  disabled = false,
}: SubsidyProgramCardProps) {
  const info = programInfo[program];

  return (
    <Card
      variant="hover"
      padding="md"
      onClick={disabled ? undefined : onToggle}
      className={clsx(
        'relative cursor-pointer transition-all',
        isSelected && 'ring-2 ring-blue-500',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="text-2xl">{info.icon}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {SUBSIDY_PROGRAM_LABELS[program]}
              </h3>
              <div
                className={clsx(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                  isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                )}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-1">{info.description}</p>
            <p className="text-sm font-medium text-blue-600 mt-2">{info.amount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
