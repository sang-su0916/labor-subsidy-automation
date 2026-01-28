import { Router } from 'express';
import { extractionController } from '../controllers/extraction.controller';

const router = Router();

// POST /api/extraction/start/:documentId - Start extraction
router.post('/start/:documentId', (req, res, next) =>
  extractionController.startExtraction(req, res, next)
);

// GET /api/extraction/status/:jobId - Get extraction status
router.get('/status/:jobId', (req, res, next) =>
  extractionController.getExtractionStatus(req, res, next)
);

// GET /api/extraction/by-document/:documentId - Get extraction by document ID
router.get('/by-document/:documentId', (req, res, next) =>
  extractionController.getExtractionByDocumentId(req, res, next)
);

// GET /api/extraction/result/:jobId - Get extraction result
router.get('/result/:jobId', (req, res, next) =>
  extractionController.getExtractionResult(req, res, next)
);

// PUT /api/extraction/update/:jobId - Update extracted data
router.put('/update/:jobId', (req, res, next) =>
  extractionController.updateExtractedData(req, res, next)
);

export default router;
