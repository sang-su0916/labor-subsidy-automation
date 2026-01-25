import { Router } from 'express';
import { laborAttorneyExportController } from '../controllers/laborAttorneyExport.controller';

const router = Router();

router.get('/:sessionId/json', (req, res, next) =>
  laborAttorneyExportController.getJsonExport(req, res, next)
);

router.get('/:sessionId/excel', (req, res, next) =>
  laborAttorneyExportController.downloadExcel(req, res, next)
);

router.get('/:sessionId/text', (req, res, next) =>
  laborAttorneyExportController.downloadText(req, res, next)
);

router.get('/work24-template/:program', (req, res, next) =>
  laborAttorneyExportController.downloadWork24Template(req, res, next)
);

export default router;
