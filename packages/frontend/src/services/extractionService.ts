import api from './api';
import { ExtractionJob, ExtractionResult } from '../types/extraction.types';

interface StartExtractionResponse {
  success: boolean;
  data: { job: ExtractionJob };
}

interface GetStatusResponse {
  success: boolean;
  data: { job: ExtractionJob };
}

interface GetResultResponse {
  success: boolean;
  data: { result: ExtractionResult };
}

interface GetByDocumentResponse {
  success: boolean;
  data: {
    job: ExtractionJob;
    result: ExtractionResult | null;
  };
}

export async function startExtraction(documentId: string): Promise<ExtractionJob> {
  const response = await api.post<StartExtractionResponse>(`/extraction/start/${documentId}`);
  return response.data.data.job;
}

/**
 * documentId로 기존 extraction 결과 조회
 * 기존 완료된 결과가 있으면 반환, 없으면 null
 */
export async function getExtractionByDocumentId(
  documentId: string
): Promise<{ job: ExtractionJob; result: ExtractionResult | null } | null> {
  try {
    const response = await api.get<GetByDocumentResponse>(`/extraction/by-document/${documentId}`);
    return response.data.data;
  } catch {
    // 404는 정상적인 경우 (아직 extraction이 없음)
    return null;
  }
}

export async function getExtractionStatus(jobId: string): Promise<ExtractionJob> {
  const response = await api.get<GetStatusResponse>(`/extraction/status/${jobId}`);
  return response.data.data.job;
}

export async function getExtractionResult(jobId: string): Promise<ExtractionResult> {
  const response = await api.get<GetResultResponse>(`/extraction/result/${jobId}`);
  return response.data.data.result;
}

export async function updateExtractedData(
  jobId: string,
  updates: Record<string, unknown>
): Promise<ExtractionResult> {
  const response = await api.put(`/extraction/update/${jobId}`, { updates });
  return response.data.data.result;
}
