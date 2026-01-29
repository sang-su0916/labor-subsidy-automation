import jsPDF from 'jspdf';
import { NotoSansCJKkrRegular } from '../fonts/NotoSansCJKkrFont';
import {
  LaborAttorneyReportData,
  ExtendedEmployeeInfo,
  ProgramApplicationDetail,
  DocumentChecklistItem,
} from '../types/laborAttorney.types';
import { maskResidentNumber } from '../utils/validation';

const COLORS = {
  navy: '#003366',
  darkNavy: '#001a33',
  gray: '#666666',
  lightGray: '#999999',
  veryLightGray: '#f0f0f0',
  white: '#ffffff',
  black: '#000000',
  success: '#28a745',
  tableHeader: '#e8e8e8',
  tableBorder: '#cccccc',
};

const A4 = {
  width: 210,
  height: 297,
  margin: { top: 20, bottom: 20, left: 15, right: 15 },
};

class LaborAttorneyReportService {
  private doc: jsPDF | null = null;
  private currentY: number = A4.margin.top;
  private pageNumber: number = 1;
  private contentWidth: number = A4.width - A4.margin.left - A4.margin.right;

  async generateReport(data: LaborAttorneyReportData): Promise<Blob> {
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

    this.renderCoverPage(data);
    this.addNewPage();
    this.renderBusinessInfoSection(data);
    this.renderBankAccountSection(data);
    this.renderEmployeeSummarySection(data);
    
    if (data.employees.length > 0) {
      this.addNewPage();
      this.renderEmployeeListSection(data);
    }

    if (data.programDetails.length > 0) {
      this.addNewPage();
      this.renderProgramDetailsSection(data);
    }

    this.addNewPage();
    this.renderDocumentChecklistSection(data);

    this.renderDisclaimer(data);

    return this.doc.output('blob');
  }

  private renderCoverPage(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    const centerX = A4.width / 2;

    this.doc.setFontSize(10);
    this.doc.setTextColor(139, 90, 60);
    this.doc.text('노무법인 같이', A4.margin.left, 12);
    
    this.doc.setTextColor(100, 100, 100);
    this.doc.text('지원금 문의: 02-6949-4974', A4.width - A4.margin.right - 60, 12);
    
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(A4.margin.left, 15, A4.width - A4.margin.right, 15);

    this.doc.setFillColor(COLORS.navy);
    this.doc.rect(0, 20, A4.width, 70, 'F');

    this.doc.setTextColor(COLORS.white);
    this.doc.setFontSize(24);
    this.doc.text('고용지원금 신청서', centerX, 55, { align: 'center' });
    this.doc.setFontSize(16);
    this.doc.text('작성 보조 자료', centerX, 70, { align: 'center' });

    this.doc.setFontSize(11);
    this.doc.text('노무사/인사담당자용 출력 양식', centerX, 82, { align: 'center' });

    this.currentY = 110;
    this.doc.setTextColor(COLORS.darkNavy);
    this.doc.setFontSize(12);
    this.doc.text('신청 사업장', centerX, this.currentY, { align: 'center' });

    this.currentY += 12;
    this.doc.setFontSize(22);
    this.doc.text(data.businessInfo.name || '(사업장명)', centerX, this.currentY, { align: 'center' });

    this.currentY += 10;
    this.doc.setFontSize(11);
    this.doc.setTextColor(COLORS.gray);
    this.doc.text(`사업자등록번호: ${data.businessInfo.registrationNumber || '-'}`, centerX, this.currentY, { align: 'center' });

    if (data.businessInfo.employmentInsuranceNumber) {
      this.currentY += 6;
      this.doc.text(`고용보험 관리번호: ${data.businessInfo.employmentInsuranceNumber}`, centerX, this.currentY, { align: 'center' });
    }

    this.currentY = 150;
    this.doc.setFillColor(COLORS.veryLightGray);
    this.doc.roundedRect(A4.margin.left + 20, this.currentY, this.contentWidth - 40, 50, 3, 3, 'F');

    this.doc.setTextColor(COLORS.gray);
    this.doc.setFontSize(10);
    this.doc.text('총 예상 지원금 (최대)', centerX, this.currentY + 12, { align: 'center' });

    this.doc.setTextColor(COLORS.navy);
    this.doc.setFontSize(28);
    this.doc.text(this.formatCurrency(data.totalEstimatedAmount), centerX, this.currentY + 32, { align: 'center' });

    this.doc.setTextColor(COLORS.gray);
    this.doc.setFontSize(10);
    this.doc.text(`${data.eligibleProgramCount}개 프로그램 지원 가능`, centerX, this.currentY + 44, { align: 'center' });

    this.currentY = 220;
    this.renderSummaryGrid(data);

    this.currentY = A4.height - 30;
    this.doc.setTextColor(COLORS.lightGray);
    this.doc.setFontSize(9);
    this.doc.text(`생성일: ${data.reportDate}`, centerX, this.currentY, { align: 'center' });
    this.doc.text('본 자료는 고용지원금 신청을 위한 보조 자료입니다.', centerX, this.currentY + 5, { align: 'center' });
  }

  private renderSummaryGrid(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    const gridItems = [
      { label: '총 직원 수', value: `${data.employeeSummary.total}명` },
      { label: '청년 (15-34세)', value: `${data.employeeSummary.youth}명` },
      { label: '고령자 (60세+)', value: `${data.employeeSummary.senior}명` },
      { label: '정규직', value: `${data.employeeSummary.fullTime}명` },
    ];

    const boxWidth = (this.contentWidth - 30) / 4;
    const boxHeight = 25;

    gridItems.forEach((item, index) => {
      const x = A4.margin.left + 5 + (boxWidth + 10) * index;

      this.doc!.setFillColor(COLORS.white);
      this.doc!.setDrawColor(COLORS.tableBorder);
      this.doc!.roundedRect(x, this.currentY, boxWidth, boxHeight, 2, 2, 'FD');

      this.doc!.setTextColor(COLORS.gray);
      this.doc!.setFontSize(8);
      this.doc!.text(item.label, x + boxWidth / 2, this.currentY + 8, { align: 'center' });

      this.doc!.setTextColor(COLORS.navy);
      this.doc!.setFontSize(12);
      this.doc!.text(item.value, x + boxWidth / 2, this.currentY + 18, { align: 'center' });
    });
  }

  private renderBusinessInfoSection(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    this.renderSectionHeader('1. 사업장 정보');

    const fields = [
      ['상호(법인명)', data.businessInfo.name || ''],
      ['사업자등록번호', data.businessInfo.registrationNumber || ''],
      ['대표자명', data.businessInfo.representativeName || ''],
      ['사업장 소재지', data.businessInfo.address || ''],
      ['고용보험 관리번호', data.businessInfo.employmentInsuranceNumber || ''],
      ['업종코드', data.businessInfo.industryCode || ''],
      ['업종명', data.businessInfo.industryName || ''],
      ['설립일(개업일)', data.businessInfo.establishmentDate || ''],
      ['상시근로자 수', data.businessInfo.totalEmployeeCount ? `${data.businessInfo.totalEmployeeCount}명` : ''],
      ['지역 구분', data.businessInfo.region === 'CAPITAL' ? '수도권' : '비수도권'],
      ['기업 규모', data.businessInfo.isSmallBusiness ? '우선지원대상기업(중소기업)' : '대기업'],
    ];

    this.renderFormTable(fields);
  }

  private renderBankAccountSection(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    this.currentY += 10;
    this.renderSectionHeader('2. 지원금 수령 계좌 정보');

    const bankFields = [
      ['은행명', data.bankAccount?.bankName || ''],
      ['계좌번호', data.bankAccount?.accountNumber || ''],
      ['예금주', data.bankAccount?.accountHolderName || ''],
      ['계좌 유형', data.bankAccount?.accountHolderType === 'BUSINESS' ? '법인 명의' : '대표자 명의'],
    ];

    this.renderFormTable(bankFields);
  }

  private renderEmployeeSummarySection(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    this.currentY += 10;
    this.renderSectionHeader('3. 직원 현황 요약');

    const summaryFields = [
      ['총 직원 수', `${data.employeeSummary.total}명`],
      ['청년 (15-34세)', `${data.employeeSummary.youth}명`],
      ['고령자 (60세 이상)', `${data.employeeSummary.senior}명`],
      ['정규직', `${data.employeeSummary.fullTime}명`],
      ['계약직', `${data.employeeSummary.contract}명`],
      ['파트타임', `${data.employeeSummary.partTime}명`],
    ];

    this.renderFormTable(summaryFields);
  }

  private renderEmployeeListSection(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    this.renderSectionHeader('4. 직원 명부 (지원금 대상자)');

    const headers = ['No.', '성명', '주민번호(마스킹)', '입사일', '고용보험가입일', '월급여', '비고'];
    const colWidths = [10, 28, 38, 25, 32, 25, 22];

    this.renderTableHeader(headers, colWidths);

    data.employees.forEach((emp, index) => {
      if (this.currentY > A4.height - 40) {
        this.addNewPage();
        this.renderSectionHeader('4. 직원 명부 (계속)');
        this.renderTableHeader(headers, colWidths);
      }

      const ageNote = this.getAgeNote(emp);
      const maskedResidentNumber = emp.residentRegistrationNumber 
        ? maskResidentNumber(emp.residentRegistrationNumber) 
        : '';
      const row = [
        String(index + 1),
        emp.name,
        maskedResidentNumber,
        emp.hireDate || '',
        emp.employmentInsuranceEnrollmentDate || '',
        emp.monthlySalary ? this.formatCurrency(emp.monthlySalary) : '',
        ageNote,
      ];

      this.renderTableRow(row, colWidths);
    });

    this.currentY += 5;
  }

  private renderProgramDetailsSection(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    this.renderSectionHeader('5. 프로그램별 신청 내역');

    data.programDetails.forEach((program, index) => {
      if (this.currentY > A4.height - 80) {
        this.addNewPage();
        this.renderSectionHeader('5. 프로그램별 신청 내역 (계속)');
      }

      this.renderProgramCard(program, index + 1);
    });
  }

  private renderProgramCard(program: ProgramApplicationDetail, index: number): void {
    if (!this.doc) return;

    this.doc.setFillColor(COLORS.navy);
    this.doc.rect(A4.margin.left, this.currentY, this.contentWidth, 8, 'F');
    this.doc.setTextColor(COLORS.white);
    this.doc.setFontSize(10);
    this.doc.text(`${index}. ${program.programName}`, A4.margin.left + 3, this.currentY + 5.5);
    this.currentY += 10;

    const infoFields = [
      ['신청처', program.applicationSite],
      ['신청 기한', program.applicationPeriod],
      ['문의처', program.contactInfo],
      ['예상 지원금액', this.formatCurrency(program.estimatedTotalAmount)],
      ['지원 기간', `${program.supportDurationMonths}개월`],
      ['대상 직원 수', `${program.eligibleEmployees.length}명`],
    ];

    this.renderFormTable(infoFields);

    if (program.eligibleEmployees.length > 0) {
      this.currentY += 5;
      this.doc.setTextColor(COLORS.darkNavy);
      this.doc.setFontSize(9);
      this.doc.text('대상 직원:', A4.margin.left, this.currentY);
      this.currentY += 4;

      this.doc.setTextColor(COLORS.gray);
      this.doc.setFontSize(8);
      const empNames = program.eligibleEmployees.map(e => e.name).join(', ');
      const lines = this.doc.splitTextToSize(empNames, this.contentWidth - 10);
      this.doc.text(lines, A4.margin.left + 5, this.currentY);
      this.currentY += lines.length * 3.5 + 5;
    }

    this.currentY += 5;
  }

  private renderDocumentChecklistSection(data: LaborAttorneyReportData): void {
    if (!this.doc) return;

    this.renderSectionHeader('6. 제출 서류 체크리스트');

    data.programDetails.forEach((program) => {
      if (this.currentY > A4.height - 60) {
        this.addNewPage();
        this.renderSectionHeader('6. 제출 서류 체크리스트 (계속)');
      }

      this.doc!.setTextColor(COLORS.navy);
      this.doc!.setFontSize(10);
      this.doc!.text(`[${program.programName}]`, A4.margin.left, this.currentY);
      this.currentY += 6;

      program.requiredDocuments.forEach((doc) => {
        if (this.currentY > A4.height - 25) {
          this.addNewPage();
        }
        this.renderChecklistItem(doc);
      });

      this.currentY += 5;
    });
  }

  private renderChecklistItem(item: DocumentChecklistItem): void {
    if (!this.doc) return;

    this.doc.setDrawColor(COLORS.tableBorder);
    this.doc.rect(A4.margin.left + 2, this.currentY - 2.5, 4, 4);

    this.doc.setTextColor(item.isRequired ? COLORS.black : COLORS.gray);
    this.doc.setFontSize(8);

    const requiredMark = item.isRequired ? '[필수] ' : '[선택] ';
    this.doc.text(`${requiredMark}${item.documentName}`, A4.margin.left + 8, this.currentY);

    if (item.notes) {
      this.doc.setTextColor(COLORS.lightGray);
      this.doc.setFontSize(7);
      this.doc.text(`(${item.notes})`, A4.margin.left + 8, this.currentY + 3);
      this.currentY += 3;
    }

    this.currentY += 5;
  }

  private renderDisclaimer(data: LaborAttorneyReportData): void {
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
    this.doc.setFontSize(7);
    const redDisclaimer = '※ 본 금액은 모든 사후 요건 충족 시 최대 예상 금액입니다. 요건 미충족 또는 조건 변동 시 실제 지원금액은 감소할 수 있습니다.';
    const redLines = this.doc.splitTextToSize(redDisclaimer, this.contentWidth);
    this.doc.text(redLines, A4.margin.left, this.currentY);
    this.currentY += redLines.length * 3.5 + 2;

    // Standard disclaimers
    this.doc.setTextColor(COLORS.lightGray);
    this.doc.setFontSize(7);

    const disclaimers = data.disclaimers.length > 0 ? data.disclaimers : [
      '본 자료는 고용지원금 신청을 돕기 위한 참고 자료입니다.',
      '실제 지원 가능 여부는 고용노동부 심사를 통해 최종 결정됩니다.',
      '신청 전 고용24 (www.work24.go.kr)에서 최신 요건을 반드시 확인하세요.',
      '문의: 고용노동부 고객상담센터 1350',
    ];

    disclaimers.forEach((text) => {
      this.doc!.text(`※ ${text}`, A4.margin.left, this.currentY);
      this.currentY += 3.5;
    });
  }

  private renderSectionHeader(title: string): void {
    if (!this.doc) return;

    if (this.currentY > A4.height - 30) {
      this.addNewPage();
    }

    this.doc.setFillColor(COLORS.navy);
    this.doc.rect(A4.margin.left, this.currentY, 3, 7, 'F');

    this.doc.setTextColor(COLORS.navy);
    this.doc.setFontSize(12);
    this.doc.text(title, A4.margin.left + 5, this.currentY + 5);

    this.currentY += 12;
  }

  private renderFormTable(fields: string[][]): void {
    if (!this.doc) return;

    const labelWidth = 50;
    const valueWidth = this.contentWidth - labelWidth;
    const rowHeight = 7;

    fields.forEach(([label, value]) => {
      if (this.currentY > A4.height - 25) {
        this.addNewPage();
      }

      this.doc!.setFillColor(COLORS.tableHeader);
      this.doc!.rect(A4.margin.left, this.currentY, labelWidth, rowHeight, 'F');

      this.doc!.setDrawColor(COLORS.tableBorder);
      this.doc!.rect(A4.margin.left, this.currentY, labelWidth, rowHeight);
      this.doc!.rect(A4.margin.left + labelWidth, this.currentY, valueWidth, rowHeight);

      this.doc!.setTextColor(COLORS.darkNavy);
      this.doc!.setFontSize(8);
      this.doc!.text(label, A4.margin.left + 2, this.currentY + 5);

      this.doc!.setTextColor(COLORS.black);
      this.doc!.text(value || '', A4.margin.left + labelWidth + 2, this.currentY + 5);

      this.currentY += rowHeight;
    });
  }

  private renderTableHeader(headers: string[], colWidths: number[]): void {
    if (!this.doc) return;

    this.doc.setFillColor(COLORS.tableHeader);
    this.doc.rect(A4.margin.left, this.currentY, this.contentWidth, 7, 'F');

    this.doc.setDrawColor(COLORS.tableBorder);
    let x = A4.margin.left;
    headers.forEach((header, index) => {
      this.doc!.rect(x, this.currentY, colWidths[index], 7);
      this.doc!.setTextColor(COLORS.darkNavy);
      this.doc!.setFontSize(7);
      this.doc!.text(header, x + 1, this.currentY + 5);
      x += colWidths[index];
    });

    this.currentY += 7;
  }

  private renderTableRow(row: string[], colWidths: number[]): void {
    if (!this.doc) return;

    this.doc.setDrawColor(COLORS.tableBorder);
    let x = A4.margin.left;
    row.forEach((cell, index) => {
      this.doc!.rect(x, this.currentY, colWidths[index], 6);
      this.doc!.setTextColor(COLORS.black);
      this.doc!.setFontSize(7);

      const truncated = cell.length > 15 ? cell.substring(0, 14) + '...' : cell;
      this.doc!.text(truncated, x + 1, this.currentY + 4);
      x += colWidths[index];
    });

    this.currentY += 6;
  }

  private getAgeNote(emp: ExtendedEmployeeInfo): string {
    if (emp.isYouth) return '청년';
    if (emp.isSenior) return '고령자';
    if (emp.age) {
      if (emp.age >= 15 && emp.age <= 34) return '청년';
      if (emp.age >= 60) return '고령자';
    }
    return '';
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

    const footerY = A4.height - 10;

    this.doc.setDrawColor(COLORS.veryLightGray);
    this.doc.line(A4.margin.left, footerY - 3, A4.width - A4.margin.right, footerY - 3);

    this.doc.setTextColor(COLORS.lightGray);
    this.doc.setFontSize(8);
    this.doc.text('고용지원금 신청서 작성 보조 자료', A4.margin.left, footerY);
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

const laborAttorneyReportService = new LaborAttorneyReportService();

export async function generateLaborAttorneyReport(data: LaborAttorneyReportData): Promise<Blob> {
  return laborAttorneyReportService.generateReport(data);
}

export async function downloadLaborAttorneyReport(data: LaborAttorneyReportData, filename?: string): Promise<void> {
  const blob = await laborAttorneyReportService.generateReport(data);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `고용지원금_노무사용양식_${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default laborAttorneyReportService;
