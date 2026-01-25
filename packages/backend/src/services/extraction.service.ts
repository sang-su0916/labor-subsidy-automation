import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { DocumentType } from '../config/constants';
import { ExtractedDocumentData, UploadedDocument } from '../types/document.types';
import { ExtractionJob, ExtractionResult, ExtractionStatus } from '../types/extraction.types';
import { ocrService } from './ocr.service';
import { extractBusinessRegistration } from './extraction/businessRegistration.extractor';
import { extractWageLedger } from './extraction/wageLedger.extractor';
import { extractEmploymentContract } from './extraction/employmentContract.extractor';
import { extractInsuranceList } from './extraction/insurance.extractor';
import { saveJsonFile, readJsonFile } from '../utils/fileSystem';
import { fileService } from './file.service';


export class ExtractionService {
  private getJobPath(jobId: string): string {
    return path.join(config.extractedDir, `${jobId}.json`);
  }

  async startExtraction(documentId: string): Promise<ExtractionJob> {
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

      // Extract text from document
      const ocrResult = await ocrService.extractText(document.path, document.fileFormat);

      // Extract structured data based on document type
      let extractedData: ExtractedDocumentData | null = null;
      let errors: string[] = [];
      let confidence = ocrResult.confidence;

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
          extractedData = result.data;
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
