import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { DocumentType, FileFormat, FILE_EXTENSION_TO_FORMAT } from '../config/constants';
import { UploadedDocument, Session } from '../types/document.types';
import { saveJsonFile, readJsonFile, deleteFile } from '../utils/fileSystem';

// 세션별 락을 관리하기 위한 Map (race condition 방지)
const sessionLocks = new Map<string, Promise<void>>();

export class FileService {
  private getSessionPath(sessionId: string): string {
    return path.join(config.sessionsDir, `${sessionId}.json`);
  }

  // 세션 락을 획득하고 작업 수행
  private async withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previousLock = sessionLocks.get(sessionId);

    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    sessionLocks.set(sessionId, currentLock);

    try {
      if (previousLock) {
        await previousLock;
      }
      return await operation();
    } finally {
      releaseLock!();
      if (sessionLocks.get(sessionId) === currentLock) {
        sessionLocks.delete(sessionId);
      }
    }
  }

  private getDocumentMetadataPath(documentId: string): string {
    return path.join(config.dataDir, 'metadata', `${documentId}.json`);
  }

  async createSession(): Promise<Session> {
    const session: Session = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      documents: [],
    };
    await saveJsonFile(this.getSessionPath(session.id), session);
    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return readJsonFile<Session>(this.getSessionPath(sessionId));
  }

  async saveDocumentMetadata(
    file: Express.Multer.File,
    sessionId: string,
    documentType: DocumentType | null = null
  ): Promise<UploadedDocument> {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const fileFormat = FILE_EXTENSION_TO_FORMAT[ext] || FileFormat.PDF;

    // multer가 non-ASCII 파일명을 Latin-1로 인코딩하므로 UTF-8로 디코딩
    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const document: UploadedDocument = {
      id: uuidv4(),
      fileName: file.filename,
      originalName: decodedOriginalName,
      fileSize: file.size,
      fileFormat,
      documentType,
      uploadedAt: new Date().toISOString(),
      path: file.path,
      sessionId,
    };

    await saveJsonFile(this.getDocumentMetadataPath(document.id), document);

    // 락을 사용하여 세션 업데이트 (race condition 방지)
    await this.withSessionLock(sessionId, async () => {
      let session = await this.getSession(sessionId);
      if (!session) {
        // Create session if it doesn't exist (for externally provided sessionIds)
        session = {
          id: sessionId,
          createdAt: new Date().toISOString(),
          documents: [],
        };
      }
      session.documents.push(document.id);
      await saveJsonFile(this.getSessionPath(sessionId), session);
    });

    return document;
  }

  async getDocumentMetadata(documentId: string): Promise<UploadedDocument | null> {
    return readJsonFile<UploadedDocument>(this.getDocumentMetadataPath(documentId));
  }

  async updateDocumentType(documentId: string, documentType: DocumentType): Promise<UploadedDocument | null> {
    const document = await this.getDocumentMetadata(documentId);
    if (!document) return null;

    document.documentType = documentType;
    await saveJsonFile(this.getDocumentMetadataPath(documentId), document);
    return document;
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const document = await this.getDocumentMetadata(documentId);
    if (!document) return false;

    await deleteFile(document.path);
    await deleteFile(this.getDocumentMetadataPath(documentId));

    // 락을 사용하여 세션 업데이트 (race condition 방지)
    await this.withSessionLock(document.sessionId, async () => {
      const session = await this.getSession(document.sessionId);
      if (session) {
        session.documents = session.documents.filter(id => id !== documentId);
        await saveJsonFile(this.getSessionPath(document.sessionId), session);
      }
    });

    return true;
  }

  async getSessionDocuments(sessionId: string): Promise<UploadedDocument[]> {
    const session = await this.getSession(sessionId);
    if (!session) return [];

    const documents: UploadedDocument[] = [];
    for (const docId of session.documents) {
      const doc = await this.getDocumentMetadata(docId);
      if (doc) documents.push(doc);
    }
    return documents;
  }
}

export const fileService = new FileService();
