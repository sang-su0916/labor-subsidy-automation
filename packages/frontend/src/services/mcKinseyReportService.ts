/**
 * McKinsey-style PDF Report Generation Service
 * 
 * Generates professional consulting-style PDF reports in A4 vertical format
 * for Korean employment subsidy (고용지원금) analysis.
 */

import jsPDF from 'jspdf';
import { NotoSansCJKkrRegular } from '../fonts/NotoSansCJKkrFont';

// Types for report data
export interface ReportBusinessInfo {
  name: string;
  registrationNumber: string;
  address?: string;
  representativeName?: string;
  region?: 'CAPITAL' | 'NON_CAPITAL';
}

export interface SubsidyCalculationData {
  program: string;
  programName: string;
  eligible: boolean;
  eligibility?: 'ELIGIBLE' | 'NEEDS_REVIEW' | 'NOT_ELIGIBLE';
  monthlyAmount: number;
  totalMonths: number;
  totalAmount: number;
  incentiveAmount?: number;
  quarterlyAmount?: number;
  employees?: number;
  eligibleEmployeeCount?: number;
  perPersonMonthlyAmount?: number;
  perPersonQuarterlyAmount?: number;
  notes?: string[];
  details?: string;
  reason?: string;
}

export interface ApplicationChecklistItem {
  program: string;
  programName: string;
  requiredDocuments: string[];
  applicationSite: string;
  applicationPeriod: string;
  contactInfo: string;
  notes?: string[];
}

export interface McReportData {
  businessInfo: ReportBusinessInfo;
  eligibleCalculations: SubsidyCalculationData[];
  excludedSubsidies?: Array<{
    program: string;
    reason: string;
    excludedBy: string;
  }>;
  totalEligibleAmount: number;
  applicationChecklist?: ApplicationChecklistItem[];
  employeeSummary?: {
    total: number;
    youth: number;
    senior: number;
  };
  generatedAt?: string;
}

// McKinsey color palette
const COLORS = {
  navy: '#003366',
  darkNavy: '#001a33',
  lightNavy: '#0052a3',
  gray: '#666666',
  lightGray: '#999999',
  veryLightGray: '#f5f5f5',
  white: '#ffffff',
  accent: '#0066cc',
  success: '#28a745',
  warning: '#ffc107',
  danger: '#dc3545',
};

// A4 dimensions in mm
const A4 = {
  width: 210,
  height: 297,
  margin: {
    top: 25,
    bottom: 25,
    left: 20,
    right: 20,
  },
};

class McKinseyReportService {
  private doc: jsPDF | null = null;
  private currentY: number = A4.margin.top;
  private pageNumber: number = 1;
  private contentWidth: number = A4.width - A4.margin.left - A4.margin.right;

  /**
   * Generate McKinsey-style PDF report
   */
  async generateReport(data: McReportData): Promise<Blob> {
    // Initialize PDF document
    this.doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    this.doc.addFileToVFS('NotoSansCJKkr-Regular.ttf', NotoSansCJKkrRegular);
    this.doc.addFont('NotoSansCJKkr-Regular.ttf', 'NotoSansCJKkr', 'normal');
    this.doc.setFont('NotoSansCJKkr');
    
    this.currentY = A4.margin.top;
    this.pageNumber = 1;

    // Add pages
    this.renderTitlePage(data);
    this.addNewPage();
    this.renderExecutiveSummary(data);
    this.renderKeyMetrics(data);
    this.renderEligiblePrograms(data);
    
    if (data.applicationChecklist && data.applicationChecklist.length > 0) {
      this.addNewPage();
      this.renderChecklist(data.applicationChecklist);
    }
    
    this.renderDisclaimer();

    // Return as Blob
    return this.doc.output('blob');
  }

  private renderTitlePage(data: McReportData): void {
    if (!this.doc) return;

    const centerX = A4.width / 2;
    
    // Navy header bar
    this.doc.setFillColor(COLORS.navy);
    this.doc.rect(0, 0, A4.width, 60, 'F');
    
    // Title
    this.doc.setTextColor(COLORS.white);
    this.doc.setFontSize(28);
    this.doc.text('고용지원금', centerX, 35, { align: 'center' });
    this.doc.setFontSize(24);
    this.doc.text('분석 보고서', centerX, 48, { align: 'center' });

    // Subtitle bar
    this.doc.setFillColor(COLORS.lightNavy);
    this.doc.rect(0, 60, A4.width, 20, 'F');
    this.doc.setFontSize(14);
    this.doc.text('2026년 기준 지원금 자격 분석', centerX, 73, { align: 'center' });

    // Business info section
    this.currentY = 110;
    this.doc.setTextColor(COLORS.navy);
    this.doc.setFontSize(12);
    this.doc.text('대상 사업장', centerX, this.currentY, { align: 'center' });
    
    this.currentY += 15;
    this.doc.setFontSize(22);
    this.doc.setTextColor(COLORS.darkNavy);
    this.doc.text(data.businessInfo.name || '(사업장명 미입력)', centerX, this.currentY, { align: 'center' });
    
    this.currentY += 12;
    this.doc.setFontSize(12);
    this.doc.setTextColor(COLORS.gray);
    this.doc.text(`사업자등록번호: ${data.businessInfo.registrationNumber || '-'}`, centerX, this.currentY, { align: 'center' });

    if (data.businessInfo.region) {
      this.currentY += 8;
      this.doc.text(`지역: ${data.businessInfo.region === 'CAPITAL' ? '수도권' : '비수도권'}`, centerX, this.currentY, { align: 'center' });
    }

    // Key metric highlight
    this.currentY = 180;
    this.doc.setFillColor(COLORS.veryLightGray);
    this.doc.roundedRect(A4.margin.left, this.currentY, this.contentWidth, 50, 3, 3, 'F');
    
    this.doc.setTextColor(COLORS.gray);
    this.doc.setFontSize(12);
    this.doc.text('총 예상 지원금액 (최대)', centerX, this.currentY + 15, { align: 'center' });
    
    this.doc.setTextColor(COLORS.navy);
    this.doc.setFontSize(32);
    const formattedAmount = this.formatCurrency(data.totalEligibleAmount);
    this.doc.text(formattedAmount, centerX, this.currentY + 35, { align: 'center' });

    // Eligible programs count
    this.currentY += 60;
    this.doc.setTextColor(COLORS.gray);
    this.doc.setFontSize(11);
    const eligibleCount = data.eligibleCalculations.filter(c => 
      c.eligible === true || c.eligibility === 'ELIGIBLE' || c.eligibility === 'NEEDS_REVIEW'
    ).length;
    this.doc.text(`${eligibleCount}개 프로그램 지원 가능`, centerX, this.currentY, { align: 'center' });

    // Date
    this.currentY = A4.height - 40;
    this.doc.setFontSize(10);
    this.doc.setTextColor(COLORS.lightGray);
    const dateStr = data.generatedAt 
      ? new Date(data.generatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    this.doc.text(`생성일: ${dateStr}`, centerX, this.currentY, { align: 'center' });
  }

  private renderExecutiveSummary(data: McReportData): void {
    if (!this.doc) return;

    // Section header
    this.renderSectionHeader('Executive Summary');
    
    this.currentY += 10;
    this.doc.setTextColor(COLORS.gray);
    this.doc.setFontSize(11);
    
    const eligibleCount = data.eligibleCalculations.filter(c => 
      c.eligible === true || c.eligibility === 'ELIGIBLE' || c.eligibility === 'NEEDS_REVIEW'
    ).length;
    
    const summaryText = `${data.businessInfo.name || '대상 사업장'}에 대한 2026년 고용지원금 자격 분석 결과, ` +
      `총 ${eligibleCount}개 프로그램에서 약 ${this.formatCurrency(data.totalEligibleAmount)}의 ` +
      `지원금 수령이 가능할 것으로 분석됩니다. ` +
      `본 분석은 제출된 서류를 기반으로 한 예비 검토 결과이며, ` +
      `최종 지원 여부는 고용노동부 심사를 통해 결정됩니다.`;
    
    const lines = this.doc.splitTextToSize(summaryText, this.contentWidth);
    this.doc.text(lines, A4.margin.left, this.currentY);
    this.currentY += lines.length * 5 + 10;
  }

  private renderKeyMetrics(data: McReportData): void {
    if (!this.doc) return;

    this.renderSectionHeader('핵심 지표 (Key Metrics)');
    
    this.currentY += 8;
    
    const eligibleCalcs = data.eligibleCalculations.filter(c => 
      c.eligible === true || c.eligibility === 'ELIGIBLE' || c.eligibility === 'NEEDS_REVIEW'
    );
    
    // Metrics grid (3 columns)
    const metrics = [
      { label: '총 예상 지원금', value: this.formatCurrency(data.totalEligibleAmount), color: COLORS.navy },
      { label: '지원 가능 프로그램', value: `${eligibleCalcs.length}개`, color: COLORS.success },
      { label: '대상 직원 수', value: data.employeeSummary ? `${data.employeeSummary.total}명` : '-', color: COLORS.accent },
    ];
    
    const boxWidth = (this.contentWidth - 10) / 3;
    const boxHeight = 35;
    
    metrics.forEach((metric, index) => {
      const x = A4.margin.left + (boxWidth + 5) * index;
      
      // Box background
      this.doc!.setFillColor(COLORS.veryLightGray);
      this.doc!.roundedRect(x, this.currentY, boxWidth, boxHeight, 2, 2, 'F');
      
      // Label
      this.doc!.setTextColor(COLORS.gray);
      this.doc!.setFontSize(9);
      this.doc!.text(metric.label, x + boxWidth / 2, this.currentY + 10, { align: 'center' });
      
      // Value
      this.doc!.setTextColor(metric.color);
      this.doc!.setFontSize(16);
      this.doc!.text(metric.value, x + boxWidth / 2, this.currentY + 25, { align: 'center' });
    });
    
    this.currentY += boxHeight + 15;
    
    // Employee breakdown if available
    if (data.employeeSummary) {
      this.doc.setTextColor(COLORS.gray);
      this.doc.setFontSize(10);
      this.doc.text(
        `직원 구성: 청년(15-34세) ${data.employeeSummary.youth}명, 고령자(60세+) ${data.employeeSummary.senior}명`,
        A4.margin.left,
        this.currentY
      );
      this.currentY += 10;
    }
  }

  private renderEligiblePrograms(data: McReportData): void {
    if (!this.doc) return;

    this.renderSectionHeader('프로그램별 분석 결과');
    
    this.currentY += 8;
    
    // Table header
    const colWidths = [52, 18, 32, 28, 30];
    const startX = A4.margin.left;

    this.doc.setFillColor(COLORS.navy);
    this.doc.rect(startX, this.currentY, this.contentWidth, 10, 'F');

    this.doc.setTextColor(COLORS.white);
    this.doc.setFontSize(8);
    this.doc.text('프로그램', startX + 3, this.currentY + 7);
    this.doc.text('대상 수', startX + colWidths[0] + 2, this.currentY + 7);
    this.doc.text('인당 지원금', startX + colWidths[0] + colWidths[1] + 2, this.currentY + 7);
    this.doc.text('지원 기간', startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, this.currentY + 7);
    this.doc.text('총 예상금액', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, this.currentY + 7);
    
    this.currentY += 10;
    
    // Table rows
    data.eligibleCalculations.forEach((calc, index) => {
      if (this.currentY > A4.height - 50) {
        this.addNewPage();
        this.currentY = A4.margin.top + 10;
      }
      
      const isEligible = calc.eligible === true || calc.eligibility === 'ELIGIBLE' || calc.eligibility === 'NEEDS_REVIEW';
      const rowColor = index % 2 === 0 ? COLORS.veryLightGray : COLORS.white;
      
      this.doc!.setFillColor(rowColor);
      this.doc!.rect(startX, this.currentY, this.contentWidth, 12, 'F');
      
      // Status indicator
      if (isEligible) {
        this.doc!.setFillColor(calc.eligibility === 'NEEDS_REVIEW' ? COLORS.warning : COLORS.success);
      } else {
        this.doc!.setFillColor(COLORS.danger);
      }
      this.doc!.circle(startX + 5, this.currentY + 6, 2, 'F');
      
      this.doc!.setTextColor(COLORS.darkNavy);
      this.doc!.setFontSize(8);

      const programName = calc.programName || calc.program;
      this.doc!.text(programName.substring(0, 13), startX + 10, this.currentY + 8);

      if (isEligible) {
        // 대상 수
        const empCount = calc.eligibleEmployeeCount || calc.employees || '-';
        this.doc!.text(`${empCount}명`, startX + colWidths[0] + 2, this.currentY + 8);

        // 인당 지원금
        const perPersonAmount = calc.perPersonQuarterlyAmount
          ? `분기 ${this.formatCurrency(calc.perPersonQuarterlyAmount)}`
          : calc.perPersonMonthlyAmount
            ? `월 ${this.formatCurrency(calc.perPersonMonthlyAmount)}`
            : calc.quarterlyAmount
              ? `분기 ${this.formatCurrency(calc.quarterlyAmount)}`
              : `월 ${this.formatCurrency(calc.monthlyAmount)}`;
        this.doc!.text(perPersonAmount, startX + colWidths[0] + colWidths[1] + 2, this.currentY + 8);

        // 지원 기간
        this.doc!.text(`${calc.totalMonths}개월`, startX + colWidths[0] + colWidths[1] + colWidths[2] + 2, this.currentY + 8);

        // 총 예상금액
        this.doc!.setTextColor(COLORS.navy);
        this.doc!.text(this.formatCurrency(calc.totalAmount), startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, this.currentY + 8);
      } else {
        this.doc!.setTextColor(COLORS.lightGray);
        this.doc!.text(calc.reason || '지원 불가', startX + colWidths[0] + colWidths[1] + 2, this.currentY + 8);
      }
      
      this.currentY += 12;
    });
    
    // Notes for eligible programs
    this.currentY += 5;
    const eligibleWithNotes = data.eligibleCalculations.filter(c => 
      (c.eligible === true || c.eligibility === 'ELIGIBLE' || c.eligibility === 'NEEDS_REVIEW') && 
      c.notes && c.notes.length > 0
    );
    
    if (eligibleWithNotes.length > 0) {
      this.doc.setTextColor(COLORS.gray);
      this.doc.setFontSize(8);
      eligibleWithNotes.forEach(calc => {
        if (calc.notes && calc.notes[0]) {
          const noteText = `* ${calc.programName || calc.program}: ${calc.notes[0]}`;
          const lines = this.doc!.splitTextToSize(noteText, this.contentWidth);
          if (this.currentY + lines.length * 4 > A4.height - 30) {
            this.addNewPage();
            this.currentY = A4.margin.top + 10;
          }
          this.doc!.text(lines, A4.margin.left, this.currentY);
          this.currentY += lines.length * 4 + 2;
        }
      });
    }
  }

  private renderChecklist(checklist: ApplicationChecklistItem[]): void {
    if (!this.doc) return;

    this.renderSectionHeader('신청 체크리스트');
    
    this.currentY += 8;
    
    checklist.forEach((item, index) => {
      if (this.currentY > A4.height - 80) {
        this.addNewPage();
        this.currentY = A4.margin.top + 10;
      }
      
      // Program header
      this.doc!.setFillColor(COLORS.lightNavy);
      this.doc!.rect(A4.margin.left, this.currentY, this.contentWidth, 8, 'F');
      this.doc!.setTextColor(COLORS.white);
      this.doc!.setFontSize(10);
      this.doc!.text(item.programName, A4.margin.left + 3, this.currentY + 6);
      this.currentY += 10;
      
      // Required documents
      this.doc!.setTextColor(COLORS.darkNavy);
      this.doc!.setFontSize(9);
      this.doc!.text('필요 서류:', A4.margin.left, this.currentY);
      this.currentY += 5;
      
      this.doc!.setTextColor(COLORS.gray);
      this.doc!.setFontSize(8);
      item.requiredDocuments.slice(0, 5).forEach(docName => {
        this.doc!.text(`  □ ${docName}`, A4.margin.left + 5, this.currentY);
        this.currentY += 4;
      });
      if (item.requiredDocuments.length > 5) {
        this.doc!.text(`  ... 외 ${item.requiredDocuments.length - 5}개`, A4.margin.left + 5, this.currentY);
        this.currentY += 4;
      }
      
      // Application info
      this.currentY += 2;
      this.doc!.setFontSize(8);
      this.doc!.text(`신청처: ${item.applicationSite}`, A4.margin.left, this.currentY);
      this.currentY += 4;
      this.doc!.text(`문의: ${item.contactInfo}`, A4.margin.left, this.currentY);
      
      this.currentY += 10;
    });
  }

  private renderDisclaimer(): void {
    if (!this.doc) return;

    if (this.currentY > A4.height - 60) {
      this.addNewPage();
    }

    this.currentY = A4.height - 55;

    this.doc.setDrawColor(COLORS.lightGray);
    this.doc.line(A4.margin.left, this.currentY, A4.width - A4.margin.right, this.currentY);

    this.currentY += 5;

    // Red disclaimer - conditional amounts warning
    this.doc.setTextColor(220, 30, 30);
    this.doc.setFontSize(8);
    const redDisclaimer = '※ 본 금액은 모든 사후 요건 충족 시 최대 예상 금액입니다. 요건 미충족 또는 조건 변동 시 실제 지원금액은 감소할 수 있습니다.';
    const redLines = this.doc.splitTextToSize(redDisclaimer, this.contentWidth);
    this.doc.text(redLines, A4.margin.left, this.currentY);
    this.currentY += redLines.length * 4 + 2;

    // Standard disclaimers
    this.doc.setTextColor(COLORS.lightGray);
    this.doc.setFontSize(7);

    const disclaimers = [
      '※ 본 보고서는 제출된 서류를 기반으로 자동 분석한 참고 자료입니다.',
      '※ 실제 지원 가능 여부는 고용노동부 심사를 통해 최종 결정됩니다.',
      '※ 신청 전 고용24 (www.work24.go.kr)에서 최신 요건을 반드시 확인하세요.',
      '※ 문의: 고용노동부 고객상담센터 1350',
    ];

    disclaimers.forEach(text => {
      this.doc!.text(text, A4.margin.left, this.currentY);
      this.currentY += 3.5;
    });
  }

  private renderSectionHeader(title: string): void {
    if (!this.doc) return;
    
    if (this.currentY > A4.height - 40) {
      this.addNewPage();
      this.currentY = A4.margin.top;
    }
    
    // Blue accent line
    this.doc.setFillColor(COLORS.navy);
    this.doc.rect(A4.margin.left, this.currentY, 3, 8, 'F');
    
    this.doc.setTextColor(COLORS.navy);
    this.doc.setFontSize(14);
    this.doc.text(title, A4.margin.left + 6, this.currentY + 6);
    
    this.currentY += 12;
  }

  private addNewPage(): void {
    if (!this.doc) return;
    
    this.renderPageFooter();
    this.doc.addPage();
    this.pageNumber++;
    this.currentY = A4.margin.top;
  }

  private renderPageFooter(): void {
    if (!this.doc) return;
    
    const footerY = A4.height - 15;
    
    this.doc.setDrawColor(COLORS.veryLightGray);
    this.doc.line(A4.margin.left, footerY - 3, A4.width - A4.margin.right, footerY - 3);
    
    this.doc.setTextColor(COLORS.lightGray);
    this.doc.setFontSize(8);
    this.doc.text('고용지원금 분석 보고서', A4.margin.left, footerY);
    this.doc.text(`${this.pageNumber}`, A4.width / 2, footerY, { align: 'center' });
    this.doc.text(new Date().toLocaleDateString('ko-KR'), A4.width - A4.margin.right, footerY, { align: 'right' });
  }

  private formatCurrency(amount: number): string {
    if (amount >= 100000000) {
      const billions = Math.floor(amount / 100000000);
      const millions = Math.floor((amount % 100000000) / 10000);
      return millions > 0 ? `${billions}억 ${millions.toLocaleString()}만원` : `${billions}억원`;
    }
    if (amount >= 10000) {
      return `${Math.round(amount / 10000).toLocaleString()}만원`;
    }
    return `${amount.toLocaleString()}원`;
  }
}

// Singleton instance
const mcKinseyReportService = new McKinseyReportService();

/**
 * Generate and download McKinsey-style PDF report
 */
export async function generateMcKinseyReport(data: McReportData): Promise<Blob> {
  return mcKinseyReportService.generateReport(data);
}

/**
 * Generate and trigger download of McKinsey-style PDF report
 */
export async function downloadMcKinseyReport(data: McReportData, filename?: string): Promise<void> {
  const blob = await mcKinseyReportService.generateReport(data);
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `고용지원금_분석보고서_${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default mcKinseyReportService;
