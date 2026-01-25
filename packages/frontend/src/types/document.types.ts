export enum DocumentType {
  BUSINESS_REGISTRATION = 'BUSINESS_REGISTRATION',
  WAGE_LEDGER = 'WAGE_LEDGER',
  EMPLOYMENT_CONTRACT = 'EMPLOYMENT_CONTRACT',
  INSURANCE_LIST = 'INSURANCE_LIST',
}

export enum FileFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL',
  WORD = 'WORD',
}

export interface UploadedDocument {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  fileFormat: FileFormat;
  documentType: DocumentType | null;
  uploadedAt: string;
  path: string;
  sessionId: string;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.BUSINESS_REGISTRATION]: '사업자등록증',
  [DocumentType.WAGE_LEDGER]: '임금대장/급여명세서',
  [DocumentType.EMPLOYMENT_CONTRACT]: '근로계약서',
  [DocumentType.INSURANCE_LIST]: '4대보험 가입자명부',
};
