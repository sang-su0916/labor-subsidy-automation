import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, Button, LoadingSpinner } from '../components/common';
import { ExtractionProgress, ExtractedDataReview } from '../components/extraction';
import { ExtractionStatus, ExtractionJob, ExtractionResult } from '../types/extraction.types';
import { UploadedDocument } from '../types/document.types';
import { getSessionDocuments } from '../services/uploadService';
import { startExtraction, getExtractionStatus, getExtractionResult, getExtractionByDocumentId } from '../services/extractionService';

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

  // 추출 시작 여부를 추적하는 ref (무한 루프 방지)
  const extractionStartedRef = useRef(false);
  // 현재 extractions 상태를 추적하는 ref (폴링에서 사용)
  const extractionsRef = useRef<ExtractionState[]>([]);

  // extractions 상태가 변경될 때마다 ref 업데이트
  useEffect(() => {
    extractionsRef.current = extractions;
  }, [extractions]);

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

      // 각 문서에 대해 기존 extraction 결과가 있는지 확인
      const extractionStates: ExtractionState[] = await Promise.all(
        documents.map(async (doc) => {
          try {
            const existing = await getExtractionByDocumentId(doc.id);
            if (existing) {
              console.log(`[ExtractionPage] Found existing extraction for ${doc.originalName}:`, existing.job.status);
              return {
                document: doc,
                job: existing.job,
                result: existing.result || undefined,
              };
            }
          } catch (err) {
            console.log(`[ExtractionPage] No existing extraction for ${doc.originalName}`);
          }
          return { document: doc };
        })
      );

      setExtractions(extractionStates);
    } catch (err) {
      setError(err instanceof Error ? err.message : '문서를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // 추출 시작 (한 번만 실행)
  useEffect(() => {
    if (extractionStartedRef.current) return;
    if (extractions.length === 0) return;

    const needsExtraction = extractions.some(
      (e) => e.document.documentType && !e.job
    );

    if (!needsExtraction) return;

    extractionStartedRef.current = true;

    const startAllExtractions = async () => {
      const updated = [...extractions];

      for (let i = 0; i < updated.length; i++) {
        const state = updated[i];
        if (!state.document.documentType) continue;

        // 이미 완료된 extraction은 건너뜀
        if (state.job?.status === ExtractionStatus.COMPLETED && state.result) {
          console.log(`[ExtractionPage] Skipping already completed extraction for ${state.document.originalName}`);
          continue;
        }

        // 이미 job이 있으면 건너뜀
        if (state.job) continue;

        try {
          console.log(`[ExtractionPage] Starting extraction for ${state.document.originalName}`);
          const job = await startExtraction(state.document.id);
          updated[i] = { ...state, job };
        } catch (err) {
          console.error('Failed to start extraction:', err);
        }
      }

      setExtractions(updated);
    };

    startAllExtractions();
  }, [extractions]);

  // 폴링 (extractions를 의존성에서 제거하여 무한 루프 방지)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const currentExtractions = extractionsRef.current;

      const pendingJobs = currentExtractions.filter(
        (e) => e.job && (e.job.status === ExtractionStatus.PENDING || e.job.status === ExtractionStatus.PROCESSING)
      );

      if (pendingJobs.length === 0) return;

      const updated = [...currentExtractions];
      let hasChanges = false;

      for (let i = 0; i < updated.length; i++) {
        const state = updated[i];
        if (!state.job) continue;
        if (state.job.status !== ExtractionStatus.PENDING && state.job.status !== ExtractionStatus.PROCESSING) continue;

        try {
          const job = await getExtractionStatus(state.job.id);
          if (job.status !== state.job.status) {
            console.log(`[ExtractionPage] Status changed for ${state.document.originalName}: ${state.job.status} -> ${job.status}`);
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
  }, []); // 빈 의존성 배열 - 컴포넌트 마운트 시 한 번만 실행

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
