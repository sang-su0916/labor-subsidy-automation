export enum DocumentType {
  BUSINESS_REGISTRATION = 'BUSINESS_REGISTRATION', // 사업자등록증
  WAGE_LEDGER = 'WAGE_LEDGER', // 임금대장
  EMPLOYMENT_CONTRACT = 'EMPLOYMENT_CONTRACT', // 근로계약서
  INSURANCE_LIST = 'INSURANCE_LIST', // 4대보험 가입자명부
}

export enum FileFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL',
  WORD = 'WORD',
  IMAGE = 'IMAGE',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.BUSINESS_REGISTRATION]: '사업자등록증',
  [DocumentType.WAGE_LEDGER]: '임금대장/급여명세서',
  [DocumentType.EMPLOYMENT_CONTRACT]: '근로계약서',
  [DocumentType.INSURANCE_LIST]: '4대보험 가입자명부',
};

export const FILE_EXTENSION_TO_FORMAT: Record<string, FileFormat> = {
  pdf: FileFormat.PDF,
  xlsx: FileFormat.EXCEL,
  xls: FileFormat.EXCEL,
  doc: FileFormat.WORD,
  docx: FileFormat.WORD,
  // 이미지 형식
  png: FileFormat.IMAGE,
  jpg: FileFormat.IMAGE,
  jpeg: FileFormat.IMAGE,
  gif: FileFormat.IMAGE,
  bmp: FileFormat.IMAGE,
  webp: FileFormat.IMAGE,
  tiff: FileFormat.IMAGE,
  tif: FileFormat.IMAGE,
};
