import { UploadedDocument, DocumentType, DOCUMENT_TYPE_LABELS } from '../../types/document.types';
import { Badge, Button } from '../common';
import DocumentTypeSelector from './DocumentTypeSelector';

interface FileListProps {
  files: UploadedDocument[];
  onUpdateType: (documentId: string, type: DocumentType) => void;
  onDelete: (documentId: string) => void;
  isLoading?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(format: string): string {
  switch (format) {
    case 'PDF':
      return '📄';
    case 'EXCEL':
      return '📊';
    case 'WORD':
      return '📝';
    default:
      return '📁';
  }
}

export default function FileList({ files, onUpdateType, onDelete, isLoading }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>업로드된 파일이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {files.map((file) => (
        <div
          key={file.id}
          className="bg-white border border-slate-200 rounded-lg p-4"
        >
          <div className="flex items-start gap-4">
            <div className="text-2xl">{getFileIcon(file.fileFormat)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-slate-900 truncate">{file.originalName}</p>
                <Badge variant="default" size="sm">
                  {file.fileFormat}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 mb-3">{formatFileSize(file.fileSize)}</p>
              
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">문서 유형 선택</p>
                <DocumentTypeSelector
                  value={file.documentType}
                  onChange={(type) => onUpdateType(file.id, type)}
                  disabled={isLoading}
                />
              </div>

              {file.documentType && (
                <div className="mt-3">
                  <Badge variant="success" size="md">
                    ✓ {DOCUMENT_TYPE_LABELS[file.documentType]}
                  </Badge>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(file.id)}
              disabled={isLoading}
              className="text-slate-400 hover:text-red-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
