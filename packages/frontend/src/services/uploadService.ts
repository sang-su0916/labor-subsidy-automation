import api from './api';
import { DocumentType, UploadedDocument } from '../types/document.types';

interface UploadResponse {
  success: boolean;
  data: {
    document: UploadedDocument;
    sessionId: string;
  };
}

interface SessionDocumentsResponse {
  success: boolean;
  data: {
    documents: UploadedDocument[];
  };
}

export async function uploadDocument(
  file: File,
  sessionId?: string,
  documentType?: DocumentType,
  onProgress?: (progress: number) => void
): Promise<{ document: UploadedDocument; sessionId: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) formData.append('sessionId', sessionId);
  if (documentType) formData.append('documentType', documentType);

  const response = await api.post<UploadResponse>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        onProgress(progress);
      }
    },
  });

  return response.data.data;
}

export async function getSessionDocuments(sessionId: string): Promise<UploadedDocument[]> {
  const response = await api.get<SessionDocumentsResponse>(`/upload/${sessionId}`);
  return response.data.data.documents;
}

export async function updateDocumentType(
  documentId: string,
  documentType: DocumentType
): Promise<UploadedDocument> {
  const response = await api.patch(`/upload/document/${documentId}/type`, { documentType });
  return response.data.data.document;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/upload/document/${documentId}`);
}
