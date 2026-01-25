import { Request, Response, NextFunction } from 'express';
import { laborAttorneyExportService } from '../services/laborAttorneyExport.service';
import { work24TemplateService } from '../services/work24Template.service';
import { createError } from '../middleware/errorHandler';

export class LaborAttorneyExportController {
  async getJsonExport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      const entries = await laborAttorneyExportService.exportJson(sessionId);
      res.json({
        success: true,
        data: { entries },
      });
    } catch (error) {
      next(error);
    }
  }

  async downloadExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      const buffer = await laborAttorneyExportService.exportExcel(sessionId);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="labor_attorney_export_${sessionId}.xlsx"`
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  async downloadText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        throw createError('세션 ID가 필요합니다', 400);
      }

      const text = await laborAttorneyExportService.exportText(sessionId);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="labor_attorney_export_${sessionId}.txt"`
      );
      res.send(text);
    } catch (error) {
      next(error);
    }
  }

  async downloadWork24Template(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { program } = req.params;
      const validPrograms = [
        'YOUTH_JOB_LEAP',
        'EMPLOYMENT_PROMOTION',
        'SENIOR_CONTINUED_EMPLOYMENT',
        'SENIOR_EMPLOYMENT_SUPPORT',
      ];
      
      if (!program || !validPrograms.includes(program)) {
        throw createError(
          `유효하지 않은 프로그램입니다. 가능한 값: ${validPrograms.join(', ')}`,
          400
        );
      }

      const buffer = work24TemplateService.generateTemplate(
        program as 'YOUTH_JOB_LEAP' | 'EMPLOYMENT_PROMOTION' | 'SENIOR_CONTINUED_EMPLOYMENT' | 'SENIOR_EMPLOYMENT_SUPPORT'
      );

      const programNames: Record<string, string> = {
        YOUTH_JOB_LEAP: '청년일자리도약장려금',
        EMPLOYMENT_PROMOTION: '고용촉진장려금',
        SENIOR_CONTINUED_EMPLOYMENT: '고령자계속고용장려금',
        SENIOR_EMPLOYMENT_SUPPORT: '고령자고용지원금',
      };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="work24_${programNames[program]}_template.xlsx"`
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
}

export const laborAttorneyExportController = new LaborAttorneyExportController();
