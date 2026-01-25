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

export async function startExtraction(documentId: string): Promise<ExtractionJob> {
  const response = await api.post<StartExtractionResponse>(`/extraction/start/${documentId}`);
  return response.data.data.job;
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
