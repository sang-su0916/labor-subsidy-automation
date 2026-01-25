import { DocumentType } from './document.types';

export enum ExtractionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface ExtractionJob {
  id: string;
  documentId: string;
  documentType: DocumentType;
  status: ExtractionStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ExtractionResult {
  jobId: string;
  documentId: string;
  documentType: DocumentType;
  status: ExtractionStatus;
  extractedData: Record<string, unknown> | null;
  rawText: string;
  confidence: number;
  errors: string[];
  processingTime: number;
}
