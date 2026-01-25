import { DocumentType } from '../config/constants';
import { ExtractedDocumentData } from './document.types';

export enum ExtractionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface ExtractionJob {
  id: string;
  documentId: string;
  documentType: DocumentType | null;
  status: ExtractionStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ExtractionResult {
  jobId: string;
  documentId: string;
  documentType: DocumentType | null;
  status: ExtractionStatus;
  extractedData: ExtractedDocumentData | null;
  rawText: string;
  confidence: number;
  errors: string[];
  processingTime: number;
}

export type ExtractionMethod = 'regex' | 'keyword' | 'position' | 'heuristic' | 'table';

export interface FieldExtraction<T = string | number | boolean | null> {
  value: T;
  confidence: number;
  source: string;
  method: ExtractionMethod;
  alternativeValues?: T[];
}

export interface ExtractionError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface EnhancedExtractionResult<TData> {
  data: TData | null;
  fields: Record<string, FieldExtraction<unknown>>;
  overallConfidence: number;
  errors: ExtractionError[];
  warnings: string[];
  rawText: string;
  processingTime: number;
}
