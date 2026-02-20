import { Router } from 'express';
import uploadRoutes from './upload.routes';
import extractionRoutes from './extraction.routes';
import subsidyRoutes from './subsidy.routes';
import laborAttorneyExportRoutes from './laborAttorneyExport.routes';
import { uploadLimiter, extractionLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use('/upload', uploadLimiter, uploadRoutes);
router.use('/extraction', extractionLimiter, extractionRoutes);
router.use('/subsidy', subsidyRoutes);
router.use('/export', laborAttorneyExportRoutes);

router.get('/health', (req, res) => {
  res.setHeader('x-request-path', req.path);
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/version', (req, res) => {
  res.json({
    version: '1.1.0',
    build: '6bbd726',
    features: ['weeklyWorkHours-auto-calc', 'factcheck-2026'],
    deployedAt: new Date().toISOString(),
  });
});

export default router;
