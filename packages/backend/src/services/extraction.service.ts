import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { DocumentType } from '../config/constants';
import { ExtractedDocumentData, UploadedDocument } from '../types/document.types';
import { ExtractionJob, ExtractionResult, ExtractionStatus } from '../types/extraction.types';
import { ocrService } from './ocr.service';
import { extractBusinessRegistration } from './extraction/businessRegistration.extractor';
import { extractWageLedger, extractWageLedgerFromExcel } from './extraction/wageLedger.extractor';
import { extractEmploymentContract } from './extraction/employmentContract.extractor';
import { extractInsuranceList } from './extraction/insurance.extractor';
import {
  extractBusinessRegistrationWithAI,
  extractWageLedgerWithAI,
  extractEmploymentContractWithAI,
  extractInsuranceListWithAI,
  extractWageLedgerWithVision,
  extractEmploymentContractWithVision,
  extractBusinessRegistrationWithVision,
  sanitizeEmploymentContract,
} from './ai-extraction.service';
import { saveJsonFile, readJsonFile } from '../utils/fileSystem';
import { fileService } from './file.service';

// AI 추출 사용 여부 (환경변수로 제어 가능)
const USE_AI_EXTRACTION = process.env.USE_AI_EXTRACTION !== 'false';

// documentId -> jobId 매핑 파일 경로
const DOCUMENT_JOB_MAPPING_FILE = path.join(config.extractedDir, '_document_job_mapping.json');

interface DocumentJobMapping {
  [documentId: string]: string; // documentId -> jobId
}


export class ExtractionService {
  private getJobPath(jobId: string): string {
    return path.join(config.extractedDir, `${jobId}.json`);
  }

  private async loadDocumentJobMapping(): Promise<DocumentJobMapping> {
    try {
      if (fs.existsSync(DOCUMENT_JOB_MAPPING_FILE)) {
        const data = await readJsonFile<DocumentJobMapping>(DOCUMENT_JOB_MAPPING_FILE);
        return data || {};
      }
    } catch (error) {
      console.error('[Extraction] Failed to load document-job mapping:', error);
    }
    return {};
  }

  private async saveDocumentJobMapping(mapping: DocumentJobMapping): Promise<void> {
    await saveJsonFile(DOCUMENT_JOB_MAPPING_FILE, mapping);
  }

  /**
   * documentId로 기존 완료된 extraction 결과 조회
   * 완료된 결과가 있으면 { job, result } 반환, 없으면 null
   */
  async getExtractionByDocumentId(documentId: string): Promise<{ job: ExtractionJob; result: ExtractionResult | null } | null> {
    const mapping = await this.loadDocumentJobMapping();
    const jobId = mapping[documentId];

    if (!jobId) {
      console.log(`[Extraction] No existing job found for document ${documentId}`);
      return null;
    }

    try {
      const data = await readJsonFile<{ job: ExtractionJob; result: ExtractionResult | null }>(
        this.getJobPath(jobId)
      );

      if (data?.job) {
        console.log(`[Extraction] Found existing job ${jobId} for document ${documentId}, status: ${data.job.status}`);
        return data;
      }
    } catch (error) {
      console.error(`[Extraction] Failed to read job ${jobId}:`, error);
    }

    return null;
  }

  async startExtraction(documentId: string): Promise<ExtractionJob> {
    // 먼저 기존 완료된 extraction이 있는지 확인
    const existing = await this.getExtractionByDocumentId(documentId);
    if (existing?.job.status === ExtractionStatus.COMPLETED) {
      console.log(`[Extraction] Returning existing completed job ${existing.job.id} for document ${documentId}`);
      return existing.job;
    }
    const document = await fileService.getDocumentMetadata(documentId);
    if (!document) {
      throw new Error('문서를 찾을 수 없습니다');
    }

    const documentType = document.documentType as DocumentType;
    if (!documentType) {
      throw new Error('문서 유형이 지정되지 않았습니다');
    }

    const job: ExtractionJob = {
      id: uuidv4(),
      documentId,
      documentType,
      status: ExtractionStatus.PROCESSING,
      startedAt: new Date().toISOString(),
    };

    // documentId -> jobId 매핑 저장
    const mapping = await this.loadDocumentJobMapping();
    mapping[documentId] = job.id;
    await this.saveDocumentJobMapping(mapping);

    await saveJsonFile(this.getJobPath(job.id), job);

    // Process extraction asynchronously
    this.processExtraction(job, document).catch(console.error);

    return job;
  }

  private async processExtraction(job: ExtractionJob, document: UploadedDocument): Promise<void> {
    const startTime = Date.now();

    try {
      const documentType = document.documentType as DocumentType;
      if (!documentType) {
        throw new Error('문서 유형이 지정되지 않았습니다');
      }

      // 엑셀 파일인 경우 직접 파싱 (급여대장)
      const ext = document.path.toLowerCase().split('.').pop();
      const isExcel = ['xls', 'xlsx'].includes(ext || '');

      if (isExcel && documentType === DocumentType.WAGE_LEDGER) {
        console.log(`[Extraction] Using Excel parser for ${document.originalName}`);
        const excelResult = extractWageLedgerFromExcel(document.path);

        const result: ExtractionResult = {
          jobId: job.id,
          documentId: document.id,
          documentType,
          status: ExtractionStatus.COMPLETED,
          extractedData: excelResult.data,
          rawText: excelResult.context.rawText,
          confidence: excelResult.context.confidence,
          errors: excelResult.context.errors,
          processingTime: Date.now() - startTime,
        };

        job.status = ExtractionStatus.COMPLETED;
        job.completedAt = new Date().toISOString();
        await saveJsonFile(this.getJobPath(job.id), { job, result });
        return;
      }

      const isPdf = ext === 'pdf';

      if (isPdf && documentType === DocumentType.BUSINESS_REGISTRATION) {
        console.log(`[Extraction] Using Gemini Vision for PDF business registration: ${document.originalName}`);

        try {
          const visionResult = await extractBusinessRegistrationWithVision(document.path);

          if (visionResult.data && visionResult.confidence > 50) {
            const result: ExtractionResult = {
              jobId: job.id,
              documentId: document.id,
              documentType,
              status: ExtractionStatus.COMPLETED,
              extractedData: visionResult.data,
              rawText: '[Gemini Vision - PDF Direct]',
              confidence: visionResult.confidence,
              errors: visionResult.errors,
              processingTime: Date.now() - startTime,
            };

            job.status = ExtractionStatus.COMPLETED;
            job.completedAt = new Date().toISOString();
            await saveJsonFile(this.getJobPath(job.id), { job, result });
            console.log(`[Extraction] Vision extraction success for ${document.originalName}`);
            return;
          }

          console.log(`[Extraction] Vision confidence too low (${visionResult.confidence}%), falling back to OCR+AI`);
        } catch (visionError) {
          console.error('[Extraction] Vision extraction failed, falling back to OCR+AI:', visionError);
        }
      }

      if (isPdf && documentType === DocumentType.WAGE_LEDGER) {
        console.log(`[Extraction] Using Gemini Vision for PDF wage ledger: ${document.originalName}`);

        try {
          const visionResult = await extractWageLedgerWithVision(document.path);

          if (visionResult.data && visionResult.confidence > 50) {
            const result: ExtractionResult = {
              jobId: job.id,
              documentId: document.id,
              documentType,
              status: ExtractionStatus.COMPLETED,
              extractedData: visionResult.data,
              rawText: '[Gemini Vision - PDF Direct]',
              confidence: visionResult.confidence,
              errors: visionResult.errors,
              processingTime: Date.now() - startTime,
            };

            job.status = ExtractionStatus.COMPLETED;
            job.completedAt = new Date().toISOString();
            await saveJsonFile(this.getJobPath(job.id), { job, result });
            console.log(`[Extraction] Vision extraction success for ${document.originalName}`);
            return;
          }

          console.log(`[Extraction] Vision confidence too low (${visionResult.confidence}%), falling back to OCR+AI`);
        } catch (visionError) {
          console.error('[Extraction] Vision extraction failed, falling back to OCR+AI:', visionError);
        }
      }

      if (isPdf && documentType === DocumentType.EMPLOYMENT_CONTRACT) {
        console.log(
          `[Extraction] Using Gemini Vision for PDF employment contract: ${document.originalName}`
        );

        try {
          const visionResult = await extractEmploymentContractWithVision(document.path);

          if (visionResult.data && visionResult.confidence > 50) {
            const result: ExtractionResult = {
              jobId: job.id,
              documentId: document.id,
              documentType,
              status: ExtractionStatus.COMPLETED,
              extractedData: visionResult.data,
              rawText: '[Gemini Vision - PDF Direct]',
              confidence: visionResult.confidence,
              errors: visionResult.errors,
              processingTime: Date.now() - startTime,
            };

            job.status = ExtractionStatus.COMPLETED;
            job.completedAt = new Date().toISOString();
            await saveJsonFile(this.getJobPath(job.id), { job, result });
            console.log(`[Extraction] Vision extraction success for ${document.originalName}`);
            return;
          }

          console.log(
            `[Extraction] Vision confidence too low (${visionResult.confidence}%), falling back to OCR+AI`
          );
        } catch (visionError) {
          console.error('[Extraction] Vision extraction failed, falling back to OCR+AI:', visionError);
        }
      }

      // Extract text from document
      const ocrResult = await ocrService.extractText(document.path, document.fileFormat);
      console.log(`[Extraction] OCR completed. Text length: ${ocrResult.text.length}`);

      // Extract structured data based on document type
      let extractedData: ExtractedDocumentData | null = null;
      let errors: string[] = [];
      let confidence = ocrResult.confidence;

      // AI 추출 시도 (활성화된 경우)
      if (USE_AI_EXTRACTION) {
        console.log(`[Extraction] Using AI extraction for ${documentType}`);
        try {
          switch (documentType) {
            case DocumentType.BUSINESS_REGISTRATION: {
              const aiResult = await extractBusinessRegistrationWithAI(ocrResult.text);
              if (aiResult.data && aiResult.confidence > 50) {
                extractedData = aiResult.data;
                errors = aiResult.errors;
                confidence = aiResult.confidence;
                console.log(`[Extraction] AI extraction success. Confidence: ${confidence}%`);
              } else {
                console.log(`[Extraction] AI extraction low confidence, falling back to regex`);
              }
              break;
            }
            case DocumentType.WAGE_LEDGER: {
              const aiResult = await extractWageLedgerWithAI(ocrResult.text);
              if (aiResult.data && aiResult.confidence > 50) {
                extractedData = aiResult.data;
                errors = aiResult.errors;
                confidence = aiResult.confidence;
                console.log(`[Extraction] AI extraction success. Confidence: ${confidence}%`);
              } else {
                console.log(`[Extraction] AI extraction low confidence, falling back to regex`);
              }
              break;
            }
            case DocumentType.EMPLOYMENT_CONTRACT: {
              const aiResult = await extractEmploymentContractWithAI(ocrResult.text);
              if (aiResult.data && aiResult.confidence > 50) {
                extractedData = aiResult.data;
                errors = aiResult.errors;
                confidence = aiResult.confidence;
                console.log(`[Extraction] AI extraction success. Confidence: ${confidence}%`);
              } else {
                console.log(`[Extraction] AI extraction low confidence, falling back to regex`);
              }
              break;
            }
            case DocumentType.INSURANCE_LIST: {
              const aiResult = await extractInsuranceListWithAI(ocrResult.text);
              if (aiResult.data && aiResult.confidence > 50) {
                extractedData = aiResult.data;
                errors = aiResult.errors;
                confidence = aiResult.confidence;
                console.log(`[Extraction] AI extraction success. Confidence: ${confidence}%`);
              } else {
                console.log(`[Extraction] AI extraction low confidence, falling back to regex`);
              }
              break;
            }
          }
        } catch (aiError) {
          console.error(`[Extraction] AI extraction failed, falling back to regex:`, aiError);
        }
      }

      // AI 추출 실패 또는 비활성화시 기존 정규식 추출 사용
      if (!extractedData) {
        console.log(`[Extraction] Using regex extraction for ${documentType}`);
        switch (documentType) {
          case DocumentType.BUSINESS_REGISTRATION: {
            const result = extractBusinessRegistration(ocrResult.text);
            extractedData = result.data;
            errors = result.context.errors;
            confidence = Math.min(confidence, result.context.confidence);
            break;
          }
          case DocumentType.WAGE_LEDGER: {
            const result = extractWageLedger(ocrResult.text);
            extractedData = result.data;
            errors = result.context.errors;
            confidence = Math.min(confidence, result.context.confidence);
            break;
          }
          case DocumentType.EMPLOYMENT_CONTRACT: {
            const result = extractEmploymentContract(ocrResult.text);
            // Regex 추출 결과에도 sanitize 적용 (AI 추출과 동일한 정제 로직)
            extractedData = result.data ? sanitizeEmploymentContract(result.data, ocrResult.text) : null;
            errors = result.context.errors;
            confidence = Math.min(confidence, result.context.confidence);
            break;
          }
          case DocumentType.INSURANCE_LIST: {
            const result = extractInsuranceList(ocrResult.text);
            extractedData = result.data;
            errors = result.context.errors;
            confidence = Math.min(confidence, result.context.confidence);
            break;
          }
        }
      }

      const result: ExtractionResult = {
        jobId: job.id,
        documentId: document.id,
        documentType,
        status: ExtractionStatus.COMPLETED,
        extractedData,
        rawText: ocrResult.text,
        confidence,
        errors,
        processingTime: Date.now() - startTime,
      };

      job.status = ExtractionStatus.COMPLETED;
      job.completedAt = new Date().toISOString();

      await saveJsonFile(this.getJobPath(job.id), { job, result });
    } catch (error) {
      job.status = ExtractionStatus.FAILED;
      job.error = error instanceof Error ? error.message : '추출 실패';
      job.completedAt = new Date().toISOString();

      await saveJsonFile(this.getJobPath(job.id), { job, result: null });
    }
  }

  async getExtractionStatus(jobId: string): Promise<ExtractionJob | null> {
    const data = await readJsonFile<{ job: ExtractionJob; result: ExtractionResult | null }>(
      this.getJobPath(jobId)
    );
    return data?.job || null;
  }

  async getExtractionResult(jobId: string): Promise<ExtractionResult | null> {
    const data = await readJsonFile<{ job: ExtractionJob; result: ExtractionResult | null }>(
      this.getJobPath(jobId)
    );
    return data?.result || null;
  }

  async updateExtractedData(
    jobId: string,
    updates: Partial<ExtractedDocumentData>
  ): Promise<ExtractionResult | null> {
    const data = await readJsonFile<{ job: ExtractionJob; result: ExtractionResult | null }>(
      this.getJobPath(jobId)
    );

    if (!data?.result?.extractedData) return null;

    data.result.extractedData = {
      ...data.result.extractedData,
      ...updates,
    } as ExtractedDocumentData;

    await saveJsonFile(this.getJobPath(jobId), data);
    return data.result;
  }
}

export const extractionService = new ExtractionService();
