import { Router } from 'express';
import { subsidyController } from '../controllers/subsidy.controller';

const router = Router();

router.get('/programs', (req, res, next) =>
  subsidyController.getPrograms(req, res, next)
);

router.post('/calculate', (req, res, next) =>
  subsidyController.calculateEligibility(req, res, next)
);

router.post('/report', (req, res, next) =>
  subsidyController.generateReport(req, res, next)
);

router.post('/report/full', (req, res, next) =>
  subsidyController.generateFullReport(req, res, next)
);

router.get('/report/:reportId/pdf', (req, res, next) =>
  subsidyController.downloadReportPDF(req, res, next)
);

router.get('/report/:reportId/checklist', (req, res, next) =>
  subsidyController.downloadChecklist(req, res, next)
);

router.get('/report/:reportId/detailed-pdf', (req, res, next) =>
  subsidyController.downloadDetailedReport(req, res, next)
);

router.get('/report/:reportId/application-helper', (req, res, next) =>
  subsidyController.downloadApplicationHelper(req, res, next)
);

export default router;
