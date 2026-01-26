import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Button, LoadingSpinner } from '../components/common';
import { FileUploadZone, FileList } from '../components/upload';
import { DocumentType, UploadedDocument } from '../types/document.types';
import { uploadDocument, updateDocumentType, deleteDocument } from '../services/uploadService';

export default function UploadPage() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelected = useCallback(async (files: File[], documentType?: DocumentType) => {
    setIsUploading(true);
    setError(null);

    try {
      for (const file of files) {
        const { document, sessionId: newSessionId } = await uploadDocument(
          file,
          sessionId || undefined,
          documentType,
          (progress) => setUploadProgress((prev) => ({ ...prev, [file.name]: progress }))
        );

        if (!sessionId) {
          setSessionId(newSessionId);
        }

        setDocuments((prev) => [...prev, document]);
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 업로드에 실패했습니다');
    } finally {
      setIsUploading(false);
    }
  }, [sessionId]);

  const handleUpdateType = useCallback(async (documentId: string, type: DocumentType) => {
    try {
      const updated = await updateDocumentType(documentId, type);
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === documentId ? updated : doc))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '문서 유형 변경에 실패했습니다');
    }
  }, []);

  const handleDelete = useCallback(async (documentId: string) => {
    try {
      await deleteDocument(documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 삭제에 실패했습니다');
    }
  }, []);

  const allDocumentsTyped = documents.length > 0 && documents.every((doc) => doc.documentType);

  const handleNext = () => {
    if (sessionId) {
      navigate(`/extraction?sessionId=${sessionId}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">서류 업로드</h1>
        <p className="text-slate-600">분석에 필요한 서류를 업로드해 주세요</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="space-y-6">
        <Card padding="lg">
          <CardContent>
            <FileUploadZone onFilesSelected={handleFilesSelected} isUploading={isUploading} />

            {Object.entries(uploadProgress).length > 0 && (
              <div className="mt-4 space-y-2">
                {Object.entries(uploadProgress).map(([name, progress]) => (
                  <div key={name} className="flex items-center gap-3">
                    <LoadingSpinner size="sm" />
                    <span className="text-sm text-slate-600 truncate flex-1">{name}</span>
                    <span className="text-sm text-slate-500">{progress}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {documents.length > 0 && (
          <Card padding="lg">
            <CardContent>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                업로드된 파일 ({documents.length})
              </h2>
              <FileList
                files={documents}
                onUpdateType={handleUpdateType}
                onDelete={handleDelete}
                isLoading={isUploading}
              />
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between items-center">
          <p className="text-sm text-slate-500">
            {documents.length === 0
              ? '파일을 업로드해 주세요'
              : !allDocumentsTyped
              ? '모든 문서의 유형을 선택해 주세요'
              : '다음 단계로 진행할 수 있습니다'}
          </p>
          <Button
            size="lg"
            disabled={!allDocumentsTyped}
            onClick={handleNext}
            rightIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            }
          >
            데이터 추출하기
          </Button>
        </div>
      </div>
    </div>
  );
}
