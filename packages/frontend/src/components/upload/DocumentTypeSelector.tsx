import { DocumentType, DOCUMENT_TYPE_LABELS } from '../../types/document.types';
import clsx from 'clsx';

interface DocumentTypeSelectorProps {
  value: DocumentType | null;
  onChange: (type: DocumentType) => void;
  disabled?: boolean;
}

const documentTypeOptions = [
  { type: DocumentType.BUSINESS_REGISTRATION, icon: '📋' },
  { type: DocumentType.WAGE_LEDGER, icon: '💰' },
  { type: DocumentType.EMPLOYMENT_CONTRACT, icon: '📝' },
  { type: DocumentType.INSURANCE_LIST, icon: '🏥' },
];

export default function DocumentTypeSelector({
  value,
  onChange,
  disabled = false,
}: DocumentTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {documentTypeOptions.map(({ type, icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          disabled={disabled}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
            value === type
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span>{icon}</span>
          <span className="truncate">{DOCUMENT_TYPE_LABELS[type]}</span>
        </button>
      ))}
    </div>
  );
}
