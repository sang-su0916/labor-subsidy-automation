import { Router } from 'express';
import uploadRoutes from './upload.routes';
import extractionRoutes from './extraction.routes';
import subsidyRoutes from './subsidy.routes';

const router = Router();

router.use('/upload', uploadRoutes);
router.use('/extraction', extractionRoutes);
router.use('/subsidy', subsidyRoutes);

router.get('/health', (req, res) => {
  res.setHeader('x-request-path', req.path);
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
