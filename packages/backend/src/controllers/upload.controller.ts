import { Request, Response, NextFunction } from 'express';
import { fileService } from '../services/file.service';
import { DocumentType } from '../config/constants';
import { createError } from '../middleware/errorHandler';

export class UploadController {
  async uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw createError('파일이 업로드되지 않았습니다', 400);
      }

      let { sessionId, documentType } = req.body;

      if (!sessionId) {
        const session = await fileService.createSession();
        sessionId = session.id;
      }

      const docType = documentType as DocumentType | undefined;
      const document = await fileService.saveDocumentMetadata(req.file, sessionId, docType || null);

      res.status(201).json({
        success: true,
        data: {
          document,
          sessionId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async batchUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw createError('파일이 업로드되지 않았습니다', 400);
      }

      let { sessionId } = req.body;

      if (!sessionId) {
        const session = await fileService.createSession();
        sessionId = session.id;
      }

      const documents = [];
      for (const file of files) {
        const document = await fileService.saveDocumentMetadata(file, sessionId, null);
        documents.push(document);
      }

      res.status(201).json({
        success: true,
        data: {
          documents,
          sessionId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getSessionDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      const documents = await fileService.getSessionDocuments(sessionId);

      res.json({
        success: true,
        data: { documents },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateDocumentType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;
      const { documentType } = req.body;

      if (!documentType || !Object.values(DocumentType).includes(documentType)) {
        throw createError('유효한 문서 유형이 필요합니다', 400);
      }

      const document = await fileService.updateDocumentType(documentId, documentType);
      if (!document) {
        throw createError('문서를 찾을 수 없습니다', 404);
      }

      res.json({
        success: true,
        data: { document },
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;
      const deleted = await fileService.deleteDocument(documentId);

      if (!deleted) {
        throw createError('문서를 찾을 수 없습니다', 404);
      }

      res.json({
        success: true,
        message: '문서가 삭제되었습니다',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
