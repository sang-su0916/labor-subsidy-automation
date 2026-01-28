import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';
import { DocumentType, DOCUMENT_TYPE_LABELS } from '../../types/document.types';

interface FileUploadZoneProps {
  onFilesSelected: (files: File[], documentType?: DocumentType) => void;
  isUploading?: boolean;
  maxSize?: number;
}

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

const DOCUMENT_TYPE_ICONS: Record<DocumentType, string> = {
  [DocumentType.BUSINESS_REGISTRATION]: '🏢',
  [DocumentType.WAGE_LEDGER]: '💰',
  [DocumentType.EMPLOYMENT_CONTRACT]: '📋',
  [DocumentType.INSURANCE_LIST]: '🛡️',
};

export default function FileUploadZone({
  onFilesSelected,
  isUploading = false,
  maxSize = 100 * 1024 * 1024,
}: FileUploadZoneProps) {
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles, selectedType || undefined);
      }
    },
    [onFilesSelected, selectedType]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize,
    disabled: isUploading,
    multiple: true,
    noClick: true,
  });

  const handleZoneClick = useCallback(() => {
    if (!isUploading) {
      open();
    }
  }, [isUploading, open]);

  return (
    <div className="space-y-4">
      {/* 문서 유형 선택 버튼 */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">
          1. 업로드할 문서 유형을 먼저 선택하세요
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(DocumentType).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              disabled={isUploading}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-left',
                selectedType === type
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600',
                isUploading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span className="text-xl">{DOCUMENT_TYPE_ICONS[type]}</span>
              <span className="font-medium text-sm">{DOCUMENT_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 파일 업로드 영역 */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">
          2. 파일을 드래그하거나 클릭하여 업로드
          {selectedType && (
            <span className="ml-2 text-blue-600">
              → {DOCUMENT_TYPE_ICONS[selectedType]} {DOCUMENT_TYPE_LABELS[selectedType]}로 자동 등록
            </span>
          )}
        </p>
        <div
          {...getRootProps()}
          onClick={handleZoneClick}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer',
            isDragActive && !isDragReject && 'border-blue-500 bg-blue-50',
            isDragReject && 'border-red-500 bg-red-50',
            selectedType && !isDragActive && 'border-blue-300 bg-blue-50/30',
            !isDragActive && !isDragReject && !selectedType && 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50',
            isUploading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input {...getInputProps()} />
          <svg
            className={clsx(
              'w-10 h-10 mx-auto mb-3 transition-colors',
              isDragActive ? 'text-blue-500' : selectedType ? 'text-blue-400' : 'text-slate-400'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {isDragReject ? (
            <p className="text-red-600 mb-1">지원하지 않는 파일 형식입니다</p>
          ) : isDragActive ? (
            <p className="text-blue-600 mb-1">
              {selectedType
                ? `${DOCUMENT_TYPE_LABELS[selectedType]}로 등록됩니다`
                : '파일을 여기에 놓으세요'}
            </p>
          ) : (
            <p className="text-slate-600 mb-1">
              {selectedType
                ? `${DOCUMENT_TYPE_LABELS[selectedType]} 파일을 여기에 드래그하세요`
                : '문서 유형 선택 후 파일을 드래그하세요'}
            </p>
          )}

          <p className="text-xs text-slate-400">PDF, Excel, Word, 이미지(PNG, JPG) 파일 지원 (최대 100MB)</p>
        </div>
      </div>
    </div>
  );
}
