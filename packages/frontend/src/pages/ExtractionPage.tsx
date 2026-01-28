import { useState, useEffect, useRef, useCallback } from 'react';
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

  // 초기화 완료 여부
  const initializedRef = useRef(false);
  // 폴링 인터벌 ID
  const pollIntervalRef = useRef<number | null>(null);

  // 폴링 함수 - extractions를 인자로 받음
  const pollExtractions = useCallback(async (currentExtractions: ExtractionState[]) => {
    const pendingJobs = currentExtractions.filter(
      (e) => e.job && (e.job.status === ExtractionStatus.PENDING || e.job.status === ExtractionStatus.PROCESSING)
    );

    if (pendingJobs.length === 0) {
      console.log('[ExtractionPage] No pending jobs, stopping poll');
      return currentExtractions;
    }

    console.log(`[ExtractionPage] Polling ${pendingJobs.length} pending jobs...`);
    const updated = [...currentExtractions];
    let hasChanges = false;

    for (let i = 0; i < updated.length; i++) {
      const state = updated[i];
      if (!state.job) continue;
      if (state.job.status !== ExtractionStatus.PENDING && state.job.status !== ExtractionStatus.PROCESSING) continue;

      try {
        const job = await getExtractionStatus(state.job.id);
        console.log(`[ExtractionPage] Job ${state.job.id} status: ${job.status}`);

        if (job.status !== state.job.status) {
          console.log(`[ExtractionPage] Status changed: ${state.job.status} -> ${job.status}`);
          updated[i] = { ...state, job };
          hasChanges = true;

          if (job.status === ExtractionStatus.COMPLETED) {
            try {
              const result = await getExtractionResult(job.id);
              updated[i] = { ...updated[i], result };
              console.log(`[ExtractionPage] Got result for ${state.document.originalName}`);
            } catch (err) {
              console.error('Failed to get result:', err);
            }
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    }

    return hasChanges ? updated : currentExtractions;
  }, []);

  // 초기화: 문서 로드 + 추출 시작 (한 번만 실행)
  useEffect(() => {
    if (initializedRef.current) return;
    if (!sessionId) {
      navigate('/upload');
      return;
    }

    initializedRef.current = true;

    const initialize = async () => {
      try {
        console.log('[ExtractionPage] Loading documents for session:', sessionId);
        const documents = await getSessionDocuments(sessionId);

        if (documents.length === 0) {
          navigate('/upload');
          return;
        }

        console.log(`[ExtractionPage] Found ${documents.length} documents`);

        // 각 문서에 대해 기존 extraction 확인 또는 새로 시작
        const extractionStates: ExtractionState[] = [];

        for (const doc of documents) {
          let state: ExtractionState = { document: doc };

          // 문서 유형이 없으면 스킵
          if (!doc.documentType) {
            console.log(`[ExtractionPage] Skipping ${doc.originalName} - no document type`);
            extractionStates.push(state);
            continue;
          }

          // 기존 extraction 결과 확인
          try {
            const existing = await getExtractionByDocumentId(doc.id);
            if (existing) {
              console.log(`[ExtractionPage] Found existing extraction for ${doc.originalName}: ${existing.job.status}`);
              state = {
                document: doc,
                job: existing.job,
                result: existing.result || undefined,
              };
              extractionStates.push(state);
              continue;
            }
          } catch (err) {
            // 404는 정상
            console.log(`[ExtractionPage] No existing extraction for ${doc.originalName}`);
          }

          // 새로 추출 시작
          try {
            console.log(`[ExtractionPage] Starting extraction for ${doc.originalName}`);
            const job = await startExtraction(doc.id);
            console.log(`[ExtractionPage] Started job ${job.id} with status ${job.status}`);
            state = { document: doc, job };
          } catch (err) {
            console.error(`[ExtractionPage] Failed to start extraction for ${doc.originalName}:`, err);
          }

          extractionStates.push(state);
        }

        setExtractions(extractionStates);
        setIsLoading(false);

        // 폴링 시작
        console.log('[ExtractionPage] Starting polling...');
        let currentStates = extractionStates;

        pollIntervalRef.current = window.setInterval(async () => {
          const updated = await pollExtractions(currentStates);
          if (updated !== currentStates) {
            currentStates = updated;
            setExtractions(updated);
          }

          // 모든 작업 완료 시 폴링 중지
          const allDone = updated.every(
            (e) => !e.job || e.job.status === ExtractionStatus.COMPLETED || e.job.status === ExtractionStatus.FAILED
          );
          if (allDone && pollIntervalRef.current) {
            console.log('[ExtractionPage] All jobs done, stopping polling');
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }, 2000);

      } catch (err) {
        console.error('[ExtractionPage] Initialization error:', err);
        setError(err instanceof Error ? err.message : '문서를 불러오는데 실패했습니다');
        setIsLoading(false);
      }
    };

    initialize();

    // Cleanup
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [sessionId, navigate, pollExtractions]);

  const allCompleted = extractions.every(
    (e) => e.job?.status === ExtractionStatus.COMPLETED || e.job?.status === ExtractionStatus.FAILED || !e.document.documentType
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
