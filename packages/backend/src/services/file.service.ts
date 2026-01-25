import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { DocumentType, FileFormat, FILE_EXTENSION_TO_FORMAT } from '../config/constants';
import { UploadedDocument, Session } from '../types/document.types';
import { saveJsonFile, readJsonFile, deleteFile } from '../utils/fileSystem';

export class FileService {
  private getSessionPath(sessionId: string): string {
    return path.join(config.sessionsDir, `${sessionId}.json`);
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

    const document: UploadedDocument = {
      id: uuidv4(),
      fileName: file.filename,
      originalName: file.originalname,
      fileSize: file.size,
      fileFormat,
      documentType,
      uploadedAt: new Date().toISOString(),
      path: file.path,
      sessionId,
    };

    await saveJsonFile(this.getDocumentMetadataPath(document.id), document);

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

    const session = await this.getSession(document.sessionId);
    if (session) {
      session.documents = session.documents.filter(id => id !== documentId);
      await saveJsonFile(this.getSessionPath(document.sessionId), session);
    }

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
