import { Router } from 'express';
import { uploadMiddleware } from '../middleware/upload.middleware';
import { uploadController } from '../controllers/upload.controller';

const router = Router();

// POST /api/upload - Upload single document
router.post('/', uploadMiddleware.single('file'), (req, res, next) => 
  uploadController.uploadDocument(req, res, next)
);

// POST /api/upload/batch - Upload multiple documents
router.post('/batch', uploadMiddleware.array('files', 150), (req, res, next) =>
  uploadController.batchUpload(req, res, next)
);

// GET /api/upload/:sessionId - Get all documents for session
router.get('/:sessionId', (req, res, next) => 
  uploadController.getSessionDocuments(req, res, next)
);

// PATCH /api/upload/document/:documentId/type - Update document type
router.patch('/document/:documentId/type', (req, res, next) => 
  uploadController.updateDocumentType(req, res, next)
);

// DELETE /api/upload/document/:documentId - Delete document
router.delete('/document/:documentId', (req, res, next) => 
  uploadController.deleteDocument(req, res, next)
);

export default router;
