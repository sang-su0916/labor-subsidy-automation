import { Request, Response, NextFunction } from 'express';
import { extractionService } from '../services/extraction.service';
import { createError } from '../middleware/errorHandler';

export class ExtractionController {
  async startExtraction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;

      if (!documentId) {
        throw createError('문서 ID가 필요합니다', 400);
      }

      const job = await extractionService.startExtraction(documentId);

      res.status(201).json({
        success: true,
        data: { job },
      });
    } catch (error) {
      next(error);
    }
  }

  async getExtractionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = await extractionService.getExtractionStatus(jobId);

      if (!job) {
        throw createError('추출 작업을 찾을 수 없습니다', 404);
      }

      res.json({
        success: true,
        data: { job },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * documentId로 기존 extraction 결과 조회
   * 기존 완료된 결과가 있으면 반환, 없으면 404
   */
  async getExtractionByDocumentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;

      if (!documentId) {
        throw createError('문서 ID가 필요합니다', 400);
      }

      const data = await extractionService.getExtractionByDocumentId(documentId);

      if (!data) {
        throw createError('해당 문서의 추출 결과를 찾을 수 없습니다', 404);
      }

      res.json({
        success: true,
        data: {
          job: data.job,
          result: data.result,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getExtractionResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const result = await extractionService.getExtractionResult(jobId);

      if (!result) {
        throw createError('추출 결과를 찾을 수 없습니다', 404);
      }

      res.json({
        success: true,
        data: { result },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateExtractedData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const { updates } = req.body;

      if (!updates || typeof updates !== 'object') {
        throw createError('업데이트할 데이터가 필요합니다', 400);
      }

      const result = await extractionService.updateExtractedData(jobId, updates);

      if (!result) {
        throw createError('추출 결과를 찾을 수 없습니다', 404);
      }

      res.json({
        success: true,
        data: { result },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const extractionController = new ExtractionController();
