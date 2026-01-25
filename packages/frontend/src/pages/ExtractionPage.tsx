import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, Button, LoadingSpinner } from '../components/common';
import { ExtractionProgress, ExtractedDataReview } from '../components/extraction';
import { ExtractionStatus, ExtractionJob, ExtractionResult } from '../types/extraction.types';
import { UploadedDocument } from '../types/document.types';
import { getSessionDocuments } from '../services/uploadService';
import { startExtraction, getExtractionStatus, getExtractionResult } from '../services/extractionService';

interface ExtractionState {
  document: UploadedDocument;
  job?: ExtractionJob;
  result?: ExtractionResult;
}

export default function ExtractionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [extractions, setExtractions] = useState<ExtractionState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!sessionId) {
      navigate('/upload');
      return;
    }

    try {
      const documents = await getSessionDocuments(sessionId);
      if (documents.length === 0) {
        navigate('/upload');
        return;
      }
      setExtractions(documents.map((doc) => ({ document: doc })));
    } catch (err) {
      setError(err instanceof Error ? err.message : '문서를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const startAllExtractions = useCallback(async () => {
    const updated = [...extractions];

    for (let i = 0; i < updated.length; i++) {
      const state = updated[i];
      if (!state.document.documentType) continue;

      try {
        const job = await startExtraction(state.document.id);
        updated[i] = { ...state, job };
        setExtractions([...updated]);
      } catch (err) {
        console.error('Failed to start extraction:', err);
      }
    }
  }, [extractions]);

  useEffect(() => {
    if (extractions.length > 0 && !extractions.some((e) => e.job)) {
      startAllExtractions();
    }
  }, [extractions.length]);

  useEffect(() => {
    const pendingJobs = extractions.filter(
      (e) => e.job && (e.job.status === ExtractionStatus.PENDING || e.job.status === ExtractionStatus.PROCESSING)
    );

    if (pendingJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      const updated = [...extractions];
      let hasChanges = false;

      for (let i = 0; i < updated.length; i++) {
        const state = updated[i];
        if (!state.job) continue;
        if (state.job.status !== ExtractionStatus.PENDING && state.job.status !== ExtractionStatus.PROCESSING) continue;

        try {
          const job = await getExtractionStatus(state.job.id);
          if (job.status !== state.job.status) {
            updated[i] = { ...state, job };
            hasChanges = true;

            if (job.status === ExtractionStatus.COMPLETED) {
              const result = await getExtractionResult(job.id);
              updated[i] = { ...updated[i], result };
            }
          }
        } catch (err) {
          console.error('Failed to get extraction status:', err);
        }
      }

      if (hasChanges) {
        setExtractions(updated);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [extractions]);

  const allCompleted = extractions.every(
    (e) => e.job?.status === ExtractionStatus.COMPLETED || e.job?.status === ExtractionStatus.FAILED
  );

  const hasResults = extractions.some((e) => e.result);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="문서 불러오는 중..." centered />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">데이터 추출</h1>
        <p className="text-slate-600">
          업로드된 문서에서 필요한 정보를 자동으로 추출합니다
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
            <h2 className="text-lg font-semibold text-slate-900 mb-4">추출 진행 상황</h2>
            <ExtractionProgress
              jobs={extractions.map((e) => ({
                documentName: e.document.originalName,
                status: e.job?.status || ExtractionStatus.PENDING,
              }))}
            />
          </CardContent>
        </Card>

        {hasResults && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">추출 결과</h2>
            {extractions
              .filter((e) => e.result)
              .map((e) => (
                <ExtractedDataReview
                  key={e.document.id}
                  result={e.result!}
                  documentName={e.document.originalName}
                />
              ))}
          </div>
        )}

        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" onClick={() => navigate('/upload')}>
            ← 이전 단계
          </Button>
          <Button
            size="lg"
            disabled={!allCompleted || !hasResults}
            onClick={() => navigate(`/subsidy?sessionId=${sessionId}`)}
            rightIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            }
          >
            지원금 확인하기
          </Button>
        </div>
      </div>
    </div>
  );
}
