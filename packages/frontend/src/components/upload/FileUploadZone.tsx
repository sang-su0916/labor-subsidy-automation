import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
  maxSize?: number;
}

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export default function FileUploadZone({
  onFilesSelected,
  isUploading = false,
  maxSize = 50 * 1024 * 1024,
}: FileUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize,
    disabled: isUploading,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer',
        isDragActive && !isDragReject && 'border-blue-500 bg-blue-50',
        isDragReject && 'border-red-500 bg-red-50',
        !isDragActive && !isDragReject && 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50',
        isUploading && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />
      <svg
        className={clsx(
          'w-12 h-12 mx-auto mb-4 transition-colors',
          isDragActive ? 'text-blue-500' : 'text-slate-400'
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
        <p className="text-red-600 mb-2">지원하지 않는 파일 형식입니다</p>
      ) : isDragActive ? (
        <p className="text-blue-600 mb-2">파일을 여기에 놓으세요</p>
      ) : (
        <p className="text-slate-600 mb-2">파일을 드래그하거나 클릭하여 업로드</p>
      )}

      <p className="text-sm text-slate-400">PDF, Excel, Word 파일 지원 (최대 50MB)</p>
    </div>
  );
}
