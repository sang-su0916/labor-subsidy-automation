import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import {
  SubsidyReportWithExclusions,
  SubsidyCalculation,
  ApplicationChecklistItem,
  SubsidyProgram,
  DetailedSubsidyReport,
  PerEmployeeCalculation,
  CalculationBreakdown,
  DataQualityWarning,
} from '../types/subsidy.types';
import { config } from '../config';

const PROGRAM_NAMES: Record<SubsidyProgram, string> = {
  [SubsidyProgram.YOUTH_JOB_LEAP]: '청년일자리도약장려금',
  [SubsidyProgram.EMPLOYMENT_PROMOTION]: '고용촉진장려금',
  [SubsidyProgram.REGULAR_CONVERSION]: '정규직전환지원금',
  [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: '고령자계속고용장려금',
  [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: '고령자고용지원금',
  [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: '출산육아기 고용안정장려금',
};

const ELIGIBILITY_LABELS: Record<string, string> = {
  ELIGIBLE: '지원 가능',
  NEEDS_REVIEW: '검토 필요',
  NOT_ELIGIBLE: '지원 불가',
};

export class ReportService {
  private fontPath: string;

  constructor() {
    this.fontPath = path.join(__dirname, '../assets/fonts/NotoSansKR-Regular.otf');
  }

  private formatCurrency(amount: number): string {
    if (amount >= 100000000) {
      const billions = Math.floor(amount / 100000000);
      const millions = Math.floor((amount % 100000000) / 10000);
      return millions > 0 ? `${billions}억 ${millions.toLocaleString()}만원` : `${billions}억원`;
    }
    if (amount >= 10000) {
      return `${(amount / 10000).toLocaleString()}만원`;
    }
    return `${amount.toLocaleString()}원`;
  }

  async generatePDFReport(report: SubsidyReportWithExclusions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        info: {
          Title: '고용지원금 분석 보고서',
          Author: '고용지원금 자동화 시스템',
        }
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('Korean', this.fontPath);
      doc.font('Korean');

      this.renderHeader(doc, report);
      this.renderBusinessInfo(doc, report);
      this.renderSummary(doc, report);
      this.renderEligibleSubsidies(doc, report);
      
      if (report.excludedSubsidies.length > 0) {
        this.renderExcludedSubsidies(doc, report);
      }

      this.renderFooter(doc, report);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    doc.fontSize(24).text('고용지원금 분석 보고서', { align: 'center' });
    doc.moveDown(0.5);
    
    const generatedDate = new Date(report.generatedAt).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    doc.fontSize(10).fillColor('#666666').text(`생성일: ${generatedDate}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(2);
  }

  private renderBusinessInfo(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    doc.fontSize(14).text('사업장 정보', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11);
    doc.text(`상호(법인명): ${report.businessInfo.name}`);
    doc.text(`사업자등록번호: ${report.businessInfo.registrationNumber}`);
    if (report.businessInfo.representativeName) {
      doc.text(`대표자명: ${report.businessInfo.representativeName}`);
    }
    if (report.businessInfo.businessAddress) {
      doc.text(`사업장 소재지: ${report.businessInfo.businessAddress}`);
    }
    if (report.businessInfo.businessType || report.businessInfo.businessItem) {
      const bizTypeStr = [report.businessInfo.businessType, report.businessInfo.businessItem].filter(Boolean).join(' / ');
      doc.text(`업태/종목: ${bizTypeStr}`);
    }
    if (report.businessInfo.industryName) {
      doc.text(`업종명: ${report.businessInfo.industryName}`);
    }
    if (report.businessInfo.establishmentDate) {
      doc.text(`설립일(개업일): ${report.businessInfo.establishmentDate}`);
    }
    if (report.businessInfo.employmentInsuranceNumber) {
      doc.text(`고용보험 관리번호: ${report.businessInfo.employmentInsuranceNumber}`);
    }
    if (report.businessInfo.regionType) {
      doc.text(`지역 구분: ${report.businessInfo.regionType}`);
    }
    if (report.businessInfo.companySize) {
      doc.text(`기업 규모: ${report.businessInfo.companySize}`);
    }
    doc.moveDown(1.5);
  }

  private renderSummary(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    doc.fontSize(14).text('지원금 요약', { underline: true });
    doc.moveDown(0.5);

    const eligibleCount = report.eligibleCalculations.length;
    const excludedCount = report.excludedSubsidies.length;

    doc.fontSize(11);
    doc.text(`지원 가능 프로그램: ${eligibleCount}개`);
    if (excludedCount > 0) {
      doc.text(`중복 제외 프로그램: ${excludedCount}개`);
    }
    doc.moveDown(0.5);

    doc.fontSize(16).fillColor('#0066cc');
    doc.text(`총 예상 지원금액: ${this.formatCurrency(report.totalEligibleAmount)}`);
    doc.fillColor('#000000');

    if (report.confirmedAmount > 0 || report.pendingReviewAmount > 0) {
      doc.fontSize(10).fillColor('#333333');
      if (report.confirmedAmount > 0) {
        doc.text(`  확정 금액: ${this.formatCurrency(report.confirmedAmount)}`);
      }
      if (report.pendingReviewAmount > 0) {
        doc.text(`  검토 필요 금액: ${this.formatCurrency(report.pendingReviewAmount)} (추가 서류 확인 필요)`);
      }
      doc.fillColor('#000000');
    }
    doc.moveDown(1.5);
  }

  private renderEligibleSubsidies(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    doc.fontSize(14).text('지원 가능 프로그램 상세', { underline: true });
    doc.moveDown(0.5);

    for (const calc of report.eligibleCalculations) {
      this.renderSubsidyCard(doc, calc);
    }
  }

  private renderSubsidyCard(doc: PDFKit.PDFDocument, calc: SubsidyCalculation): void {
    const programName = PROGRAM_NAMES[calc.program];
    const eligibilityLabel = ELIGIBILITY_LABELS[calc.eligibility];

    // 카드 높이를 notes 개수에 따라 동적으로 계산
    const notesCount = calc.notes.length;
    const baseHeight = 80;
    const additionalNotesHeight = notesCount > 1 ? (notesCount - 1) * 14 : 0;
    const cardHeight = baseHeight + additionalNotesHeight;

    const pageHeight = doc.page.height - doc.page.margins.bottom;
    if (doc.y > pageHeight - cardHeight - 20) {
      doc.addPage();
    }

    doc.rect(doc.x, doc.y, 495, cardHeight).stroke('#cccccc');
    const startY = doc.y + 10;
    const startX = doc.x + 10;

    doc.fontSize(12).text(programName, startX, startY);
    
    const statusColor = calc.eligibility === 'ELIGIBLE' ? '#28a745' : 
                       calc.eligibility === 'NEEDS_REVIEW' ? '#ffc107' : '#dc3545';
    doc.fontSize(9).fillColor(statusColor).text(`[${eligibilityLabel}]`, startX + 200, startY);
    doc.fillColor('#000000');

    doc.fontSize(10);
    const empCount = calc.eligibleEmployeeCount ?? '-';
    const perPerson = calc.perPersonQuarterlyAmount
      ? `분기 ${this.formatCurrency(calc.perPersonQuarterlyAmount)}/인`
      : calc.perPersonMonthlyAmount
        ? `월 ${this.formatCurrency(calc.perPersonMonthlyAmount)}/인`
        : '';
    doc.text(`대상: ${empCount}명`, startX, startY + 20);
    doc.text(perPerson ? `인당: ${perPerson}` : `월 지원금: ${this.formatCurrency(calc.monthlyAmount)}`, startX + 120, startY + 20);
    doc.text(`기간: ${calc.totalMonths}개월`, startX + 280, startY + 20);
    doc.text(`총 예상금액: ${this.formatCurrency(calc.totalAmount)}`, startX + 370, startY + 20);

    if (calc.incentiveAmount && calc.incentiveAmount > 0) {
      doc.text(`+ 인센티브: ${this.formatCurrency(calc.incentiveAmount)}`, startX, startY + 35);
    }

    // 전체 notes 표시 (기존: notes[0]만 표시 → 수정: 모든 notes 표시)
    if (calc.notes.length > 0) {
      doc.fontSize(9).fillColor('#666666');
      let noteY = startY + 50;
      for (const note of calc.notes) {
        doc.text(`• ${note}`, startX, noteY, { width: 475 });
        noteY += 14;
      }
      doc.fillColor('#000000');
    }

    doc.y = startY + cardHeight;
    doc.moveDown(0.5);
  }

  private renderExcludedSubsidies(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    doc.addPage();
    doc.fontSize(14).text('중복 수급 제외 프로그램', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor('#666666');
    doc.text('아래 프로그램은 중복 수급 금지 규정에 따라 지원금 산정에서 제외되었습니다.');
    doc.fillColor('#000000');
    doc.moveDown(1);

    for (const excluded of report.excludedSubsidies) {
      const programName = PROGRAM_NAMES[excluded.program];
      const excludedByName = PROGRAM_NAMES[excluded.excludedBy];

      doc.fontSize(11).text(`• ${programName}`);
      doc.fontSize(9).fillColor('#dc3545');
      doc.text(`  제외 사유: ${excluded.reason}`, { indent: 10 });
      doc.text(`  우선 적용: ${excludedByName}`, { indent: 10 });
      doc.fillColor('#000000');
      doc.moveDown(0.5);
    }
  }

  private renderFooter(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    doc.addPage();

    this.renderProgramNotes(doc, report);

    doc.fontSize(14).text('유의사항', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor('#dc3545');
    doc.text('※ 본 금액은 모든 사후 요건 충족 시 최대 예상 금액입니다. 요건 미충족 또는 조건 변동 시 실제 지원금액은 감소할 수 있습니다.', { width: 495 });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    const notices = [
      '본 보고서는 제출된 서류를 기반으로 자동 분석한 결과입니다.',
      '실제 지원 가능 여부는 고용노동부 심사를 통해 최종 결정됩니다.',
      '지원금 신청 전 고용24(www.work24.go.kr)에서 최신 요건을 확인하시기 바랍니다.',
      '문의: 고용노동부 고객상담센터 1350',
    ];

    doc.fontSize(10);
    for (const notice of notices) {
      doc.text(`• ${notice}`);
      doc.moveDown(0.3);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999999');
    doc.text('본 문서는 고용지원금 자동화 시스템에서 자동 생성되었습니다.', { align: 'center' });
    doc.text(`문서 ID: ${report.id}`, { align: 'center' });
  }

  private renderProgramNotes(doc: PDFKit.PDFDocument, report: SubsidyReportWithExclusions): void {
    const programsWithNotes = report.eligibleCalculations.filter(
      (calc) => calc.notes.length > 0
    );

    if (programsWithNotes.length === 0) return;

    doc.fontSize(14).text('프로그램별 예외사항 및 안내', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#666666');
    doc.text('아래 사항은 각 프로그램의 지원 조건, 금액 차등, 제외 대상 등에 관한 안내입니다.');
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    for (const calc of programsWithNotes) {
      const programName = PROGRAM_NAMES[calc.program];

      const pageHeight = doc.page.height - doc.page.margins.bottom;
      if (doc.y > pageHeight - 80) {
        doc.addPage();
      }

      doc.fontSize(11).fillColor('#0066cc').text(`■ ${programName}`);
      doc.fillColor('#000000');
      doc.moveDown(0.2);

      doc.fontSize(9);
      for (const note of calc.notes) {
        doc.text(`  • ${note}`, { width: 480 });
        doc.moveDown(0.15);
      }
      doc.moveDown(0.6);
    }

    doc.moveDown(1);
  }

  async generateChecklistText(checklist: ApplicationChecklistItem[]): Promise<string> {
    const lines: string[] = [
      '=' .repeat(60),
      '고용지원금 신청 체크리스트',
      '=' .repeat(60),
      '',
    ];

    for (const item of checklist) {
      lines.push(`■ ${item.programName}`);
      lines.push('-'.repeat(40));
      lines.push('');
      lines.push('【필요 서류】');
      for (const doc of item.requiredDocuments) {
        lines.push(`  □ ${doc}`);
      }
      lines.push('');
      lines.push(`【신청 사이트】 ${item.applicationSite}`);
      lines.push(`【신청 기한】 ${item.applicationPeriod}`);
      lines.push(`【문의처】 ${item.contactInfo}`);
      lines.push('');
      if (item.notes.length > 0) {
        lines.push('【참고사항】');
        for (const note of item.notes) {
          lines.push(`  • ${note}`);
        }
      }
      lines.push('');
      lines.push('');
    }

    lines.push('=' .repeat(60));
    lines.push('※ 신청 전 고용24에서 최신 요건을 반드시 확인하세요.');
    lines.push('※ 문의: 고용노동부 고객상담센터 1350');
    lines.push('=' .repeat(60));

    return lines.join('\n');
  }

  async saveReport(reportId: string, pdfBuffer: Buffer, checklistText: string): Promise<{
    pdfPath: string;
    checklistPath: string;
  }> {
    const reportsDir = config.reportsDir;
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const pdfPath = path.join(reportsDir, `${reportId}_report.pdf`);
    const checklistPath = path.join(reportsDir, `${reportId}_checklist.txt`);

    fs.writeFileSync(pdfPath, pdfBuffer);
    fs.writeFileSync(checklistPath, checklistText, 'utf-8');

    return { pdfPath, checklistPath };
  }

  async generateDetailedPDFReport(report: DetailedSubsidyReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: '고용지원금 상세 분석 보고서',
          Author: '고용지원금 자동화 시스템',
        },
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('Korean', this.fontPath);
      doc.font('Korean');

      this.renderHeader(doc, report);
      this.renderBusinessInfo(doc, report);
      this.renderSummary(doc, report);

      if (report.dataQualityWarnings.length > 0) {
        this.renderDataQualityWarnings(doc, report.dataQualityWarnings);
      }

      this.renderEmployeeAnalysis(doc, report.perEmployeeCalculations);
      this.renderCalculationBreakdowns(doc, report);
      this.renderEligibleSubsidies(doc, report);

      if (report.excludedSubsidies.length > 0) {
        this.renderExcludedSubsidies(doc, report);
      }

      this.renderFooter(doc, report);

      doc.end();
    });
  }

  private renderDataQualityWarnings(
    doc: PDFKit.PDFDocument,
    warnings: DataQualityWarning[]
  ): void {
    doc.fontSize(14).text('데이터 품질 주의사항', { underline: true });
    doc.moveDown(0.5);

    for (const warning of warnings) {
      const severityColor =
        warning.severity === 'HIGH'
          ? '#dc3545'
          : warning.severity === 'MEDIUM'
            ? '#ffc107'
            : '#17a2b8';

      doc.fontSize(10).fillColor(severityColor);
      doc.text(`[${warning.severity}] ${warning.field} (${warning.documentType})`);
      doc.fillColor('#000000');
      doc.fontSize(9);
      doc.text(`  ${warning.message}`);
      doc.fillColor('#666666');
      doc.text(`  → ${warning.suggestedAction}`);
      doc.fillColor('#000000');
      doc.moveDown(0.3);
    }
    doc.moveDown(1);
  }

  private renderEmployeeAnalysis(
    doc: PDFKit.PDFDocument,
    calculations: PerEmployeeCalculation[]
  ): void {
    doc.addPage();
    doc.fontSize(18).text('직원별 지원금 분석', { align: 'center' });
    doc.moveDown(1);

    const youthCount = calculations.filter((c) => c.isYouth).length;
    const seniorCount = calculations.filter((c) => c.isSenior).length;
    const eligibleCount = calculations.filter(
      (c) => c.eligiblePrograms.length > 0
    ).length;
    const totalEstimated = calculations.reduce(
      (sum, c) => sum + c.totalEstimatedSubsidy,
      0
    );

    doc.fontSize(12).text('직원 현황 요약');
    doc.fontSize(10);
    doc.text(`총 직원 수: ${calculations.length}명`);
    doc.text(`청년 (15~34세): ${youthCount}명`);
    doc.text(`고령자 (60세+): ${seniorCount}명`);
    doc.text(`지원금 대상자: ${eligibleCount}명`);
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .fillColor('#0066cc')
      .text(`총 예상 지원금: ${this.formatCurrency(totalEstimated)}`);
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    doc.fontSize(12).text('직원별 상세 분석');
    doc.moveDown(0.5);

    for (const emp of calculations) {
      this.renderEmployeeCard(doc, emp);
    }
  }

  private renderEmployeeCard(
    doc: PDFKit.PDFDocument,
    emp: PerEmployeeCalculation
  ): void {
    const pageHeight = doc.page.height - doc.page.margins.bottom;
    if (doc.y > pageHeight - 120) {
      doc.addPage();
    }

    const cardHeight = 100;
    doc.rect(doc.x, doc.y, 495, cardHeight).stroke('#cccccc');
    const startY = doc.y + 10;
    const startX = doc.x + 10;

    doc.fontSize(11).text(`${emp.employeeName}`, startX, startY);

    const tags: string[] = [];
    if (emp.isYouth) tags.push('청년');
    if (emp.isSenior) tags.push('고령자');
    if (emp.age) tags.push(`${emp.age}세`);

    if (tags.length > 0) {
      doc
        .fontSize(9)
        .fillColor('#666666')
        .text(`[${tags.join(', ')}]`, startX + 120, startY);
      doc.fillColor('#000000');
    }

    doc.fontSize(9);
    let infoY = startY + 18;

    if (emp.hireDate) {
      doc.text(`입사일: ${emp.hireDate}`, startX, infoY);
    }
    if (emp.monthlySalary) {
      doc.text(
        `월급여: ${this.formatCurrency(emp.monthlySalary)}`,
        startX + 150,
        infoY
      );
    }
    if (emp.weeklyWorkHours) {
      doc.text(`주 ${emp.weeklyWorkHours}시간`, startX + 300, infoY);
    }

    infoY += 15;

    if (emp.eligiblePrograms.length > 0) {
      doc.fillColor('#28a745');
      doc.text('지원 가능:', startX, infoY);
      const programNames = emp.eligiblePrograms
        .map((p) => `${p.programName} (${this.formatCurrency(p.estimatedAmount)})`)
        .join(', ');
      doc.text(programNames, startX + 60, infoY, { width: 420 });
      doc.fillColor('#000000');
    }

    infoY += 15;

    if (emp.ineligiblePrograms.length > 0) {
      doc.fillColor('#dc3545');
      doc.text('부적격:', startX, infoY);
      const ineligibleNames = emp.ineligiblePrograms
        .map((p) => p.programName)
        .slice(0, 3)
        .join(', ');
      doc.text(ineligibleNames, startX + 50, infoY, { width: 420 });
      doc.fillColor('#000000');
    }

    infoY += 15;
    doc
      .fontSize(10)
      .fillColor('#0066cc')
      .text(
        `예상 지원금: ${this.formatCurrency(emp.totalEstimatedSubsidy)}`,
        startX,
        infoY
      );
    doc.fillColor('#000000');

    doc.y = startY + cardHeight + 5;
  }

  private renderCalculationBreakdowns(
    doc: PDFKit.PDFDocument,
    report: DetailedSubsidyReport
  ): void {
    doc.addPage();
    doc.fontSize(18).text('지원금 계산 상세 내역', { align: 'center' });
    doc.moveDown(1);

    const breakdowns: CalculationBreakdown[] = [];

    for (const emp of report.perEmployeeCalculations) {
      for (const eligible of emp.eligiblePrograms) {
        const existing = breakdowns.find(
          (b) => b.programName === eligible.breakdown.programName
        );
        if (!existing) {
          breakdowns.push(eligible.breakdown);
        } else {
          existing.eligibleEmployees++;
          existing.totalAmount += eligible.breakdown.totalAmount;
          existing.baseAmount += eligible.breakdown.baseAmount;
          existing.incentiveAmount += eligible.breakdown.incentiveAmount;
        }
      }
    }

    for (const breakdown of breakdowns) {
      this.renderBreakdownCard(doc, breakdown);
    }
  }

  private renderBreakdownCard(
    doc: PDFKit.PDFDocument,
    breakdown: CalculationBreakdown
  ): void {
    const pageHeight = doc.page.height - doc.page.margins.bottom;
    if (doc.y > pageHeight - 200) {
      doc.addPage();
    }

    doc.fontSize(14).fillColor('#0066cc').text(breakdown.programName);
    doc.fillColor('#000000');
    doc.moveDown(0.3);

    doc.fontSize(10);
    doc.text(`대상 직원 수: ${breakdown.eligibleEmployees}명`);
    doc.text(`계산 공식: ${breakdown.calculationFormula}`);
    doc.moveDown(0.5);

    doc.fontSize(11).text('단계별 계산:');
    for (const step of breakdown.steps) {
      doc.fontSize(9);
      doc.text(`  ${step.stepNumber}. ${step.description}`);
      if (step.formula) {
        doc.fillColor('#666666');
        doc.text(`     공식: ${step.formula}`, { indent: 20 });
        doc.fillColor('#000000');
      }
      const inputStr = Object.entries(step.inputValues)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? this.formatCurrency(v) : v}`)
        .join(', ');
      doc.text(`     입력값: ${inputStr}`, { indent: 20 });
      doc.text(`     결과: ${this.formatCurrency(step.result)}`, { indent: 20 });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`기본 지원금: ${this.formatCurrency(breakdown.baseAmount)}`);
    if (breakdown.incentiveAmount > 0) {
      doc.text(`인센티브: ${this.formatCurrency(breakdown.incentiveAmount)}`);
    }
    doc
      .fontSize(12)
      .fillColor('#28a745')
      .text(`총 예상 지원금: ${this.formatCurrency(breakdown.totalAmount)}`);
    doc.fillColor('#000000');

    doc.moveDown(0.5);
    doc.fontSize(10).text('지급 일정:');
    for (const schedule of breakdown.paymentSchedule) {
      doc.fontSize(9);
      doc.text(
        `  • ${schedule.period}: ${this.formatCurrency(schedule.amount)} (${schedule.conditions})`
      );
    }

    doc.moveDown(1.5);
  }

  async generateApplicationFormHelper(
    report: DetailedSubsidyReport
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: '고용지원금 신청서 작성 보조 자료',
          Author: '고용지원금 자동화 시스템',
        },
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('Korean', this.fontPath);
      doc.font('Korean');

      doc.fontSize(20).text('고용지원금 신청서 작성 보조 자료', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor('#666666')
        .text('(노무사/인사담당자용)', { align: 'center' });
      doc.fillColor('#000000');
      doc.moveDown(1);

      doc.fontSize(14).text('1. 사업장 기본 정보', { underline: true });
      doc.moveDown(0.5);
      this.renderFormField(doc, '상호(법인명)', report.businessInfo.name);
      this.renderFormField(doc, '사업자등록번호', report.businessInfo.registrationNumber);
      this.renderFormField(doc, '대표자명', report.businessInfo.representativeName || '');
      this.renderFormField(doc, '사업장 소재지', report.businessInfo.businessAddress || '');
      if (report.businessInfo.businessType || report.businessInfo.businessItem) {
        const bizTypeStr = [report.businessInfo.businessType, report.businessInfo.businessItem].filter(Boolean).join(' / ');
        this.renderFormField(doc, '업태/종목', bizTypeStr);
      }
      if (report.businessInfo.industryCode) {
        this.renderFormField(doc, '업종코드', report.businessInfo.industryCode);
      }
      if (report.businessInfo.industryName) {
        this.renderFormField(doc, '업종명', report.businessInfo.industryName);
      }
      this.renderFormField(doc, '설립일(개업일)', report.businessInfo.establishmentDate || '');
      this.renderFormField(doc, '고용보험 관리번호', report.businessInfo.employmentInsuranceNumber || '');
      if (report.businessInfo.headCount) {
        this.renderFormField(doc, '상시근로자 수', `${report.businessInfo.headCount}명`);
      }
      if (report.businessInfo.regionType) {
        this.renderFormField(doc, '지역 구분', report.businessInfo.regionType);
      }
      if (report.businessInfo.companySize) {
        this.renderFormField(doc, '기업 규모', report.businessInfo.companySize);
      }
      doc.moveDown(1);

      doc.fontSize(14).text('2. 직원 명부 (지원금 대상 여부)', { underline: true });
      doc.moveDown(0.5);
      this.renderEmployeeTable(doc, report.perEmployeeCalculations);
      doc.moveDown(1);

      doc.addPage();
      doc.fontSize(14).text('3. 프로그램별 신청 정보', { underline: true });
      doc.moveDown(0.5);

      for (const item of report.applicationChecklist) {
        this.renderApplicationInfo(doc, item, report.perEmployeeCalculations);
      }

      doc.addPage();
      doc.fontSize(14).text('4. 추출된 데이터 요약', { underline: true });
      doc.moveDown(0.5);
      this.renderExtractedDataSummary(doc, report);

      doc.end();
    });
  }

  private renderFormField(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string
  ): void {
    doc.fontSize(10);
    doc.text(`${label}: `, { continued: true });
    doc.rect(doc.x, doc.y - 2, 300, 16).stroke('#cccccc');
    doc.text(`  ${value}`);
    doc.moveDown(0.3);
  }

  private renderEmployeeTable(
    doc: PDFKit.PDFDocument,
    employees: PerEmployeeCalculation[]
  ): void {
    // 직원이 없으면 안내 메시지 표시
    if (employees.length === 0) {
      doc.fontSize(10).fillColor('#666666');
      doc.text('추출된 직원 정보가 없습니다.');
      doc.fillColor('#000000');
      return;
    }

    doc.fontSize(8);

    // 헤더 수정: 대상 여부 컬럼 추가
    const headers = ['성명', '생년월일', '입사일', '청년/고령', '대상 여부', '대상 프로그램', '예상 지원금'];
    const colWidths = [55, 60, 60, 50, 50, 130, 70];
    let x = doc.x;
    const y = doc.y;

    doc.fillColor('#f0f0f0');
    doc.rect(x, y, 495, 15).fill();
    doc.fillColor('#000000');

    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 2, y + 3, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    }

    doc.y = y + 18;

    // 모든 직원 표시 (지원금 대상 여부와 관계없이)
    for (const emp of employees) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      x = doc.x;
      const rowY = doc.y;

      const category = emp.isYouth ? '청년' : emp.isSenior ? '고령자' : '-';
      const isEligible = emp.eligiblePrograms.length > 0;
      const eligibilityStatus = isEligible ? 'O' : '-';
      const programs = isEligible
        ? emp.eligiblePrograms.map((p) => p.programName).join(', ')
        : '-';
      const subsidy = isEligible
        ? this.formatCurrency(emp.totalEstimatedSubsidy)
        : '-';

      const values = [
        emp.employeeName,
        emp.residentRegistrationNumber?.substring(0, 6) || '-',
        emp.hireDate || '-',
        category,
        eligibilityStatus,
        programs,
        subsidy,
      ];

      // 대상 여부에 따라 색상 구분
      for (let i = 0; i < values.length; i++) {
        if (i === 4) { // 대상 여부 컬럼
          doc.fillColor(isEligible ? '#28a745' : '#999999');
        } else if (!isEligible && i >= 5) { // 비대상자의 프로그램/지원금 컬럼
          doc.fillColor('#999999');
        } else {
          doc.fillColor('#000000');
        }
        doc.text(values[i], x + 2, rowY, { width: colWidths[i] - 4, align: 'left' });
        x += colWidths[i];
      }
      doc.fillColor('#000000');

      doc.y = rowY + 15;
      doc.moveTo(doc.x, doc.y).lineTo(doc.x + 495, doc.y).stroke('#eeeeee');
      doc.y += 2;
    }

    // 요약 정보 추가
    const eligibleCount = employees.filter(e => e.eligiblePrograms.length > 0).length;
    doc.moveDown(0.5);
    doc.fontSize(9);
    doc.text(`총 ${employees.length}명 중 지원금 대상: ${eligibleCount}명`, { align: 'right' });
  }

  private renderApplicationInfo(
    doc: PDFKit.PDFDocument,
    item: ApplicationChecklistItem,
    employees: PerEmployeeCalculation[]
  ): void {
    const eligibleForProgram = employees.filter((e) =>
      e.eligiblePrograms.some((p) => p.program === item.program)
    );

    if (doc.y > doc.page.height - 200) {
      doc.addPage();
    }

    doc.fontSize(12).fillColor('#0066cc').text(`■ ${item.programName}`);
    doc.fillColor('#000000');
    doc.moveDown(0.3);

    doc.fontSize(9);
    if (eligibleForProgram.length > 0) {
      doc.text(`대상 직원 수: ${eligibleForProgram.length}명`);
      doc.text(
        `대상 직원: ${eligibleForProgram.map((e) => e.employeeName).join(', ')}`
      );

      const totalForProgram = eligibleForProgram.reduce(
        (sum, e) =>
          sum +
          (e.eligiblePrograms.find((p) => p.program === item.program)
            ?.estimatedAmount || 0),
        0
      );
      doc.text(`예상 총액: ${this.formatCurrency(totalForProgram)}`);
    } else {
      doc.fillColor('#ff6600');
      doc.text('대상 직원: 별도 확인 필요 (문서에서 자동 확인 불가)');
      doc.fillColor('#000000');
    }
    doc.moveDown(0.3);

    doc.text(`신청 사이트: ${item.applicationSite}`);
    doc.text(`신청 기한: ${item.applicationPeriod}`);
    doc.text(`문의처: ${item.contactInfo}`);
    doc.moveDown(0.3);

    doc.text('필요 서류:');
    for (const docItem of item.requiredDocuments.slice(0, 5)) {
      doc.text(`  □ ${docItem}`);
    }
    if (item.requiredDocuments.length > 5) {
      doc.text(`  ... 외 ${item.requiredDocuments.length - 5}개`);
    }

    if (item.notes.length > 0) {
      doc.moveDown(0.3);
      doc.fillColor('#8B4513');
      doc.text('참고/예외사항:');
      for (const note of item.notes) {
        doc.text(`  • ${note}`, { width: 475 });
      }
      doc.fillColor('#000000');
    }

    doc.moveDown(1);
  }

  private renderExtractedDataSummary(
    doc: PDFKit.PDFDocument,
    report: DetailedSubsidyReport
  ): void {
    doc.fontSize(10);

    const youthCount = report.perEmployeeCalculations.filter(
      (e) => e.isYouth
    ).length;
    const seniorCount = report.perEmployeeCalculations.filter(
      (e) => e.isSenior
    ).length;
    const totalSalary = report.perEmployeeCalculations.reduce(
      (sum, e) => sum + (e.monthlySalary || 0),
      0
    );

    doc.text('【직원 분류 현황】');
    doc.text(`  • 총 직원 수: ${report.perEmployeeCalculations.length}명`);
    doc.text(`  • 청년 (15~34세): ${youthCount}명`);
    doc.text(`  • 고령자 (60세 이상): ${seniorCount}명`);
    doc.text(
      `  • 총 월 급여 합계: ${this.formatCurrency(totalSalary)}`
    );
    doc.moveDown(0.5);

    doc.text('【지원금 대상 요약】');
    for (const summary of report.summaryByProgram) {
      if (summary.eligibleEmployeeCount > 0) {
        doc.text(
          `  • ${summary.programName}: ${summary.eligibleEmployeeCount}명, ${this.formatCurrency(summary.totalAmount)}`
        );
      }
    }
    doc.moveDown(0.5);

    if (report.dataQualityWarnings.length > 0) {
      doc.text('【데이터 품질 경고】');
      for (const warning of report.dataQualityWarnings) {
        doc.fillColor(
          warning.severity === 'HIGH' ? '#dc3545' : '#ffc107'
        );
        doc.text(`  ⚠ ${warning.message}`);
        doc.fillColor('#000000');
      }
    }
  }
}

export const reportService = new ReportService();
