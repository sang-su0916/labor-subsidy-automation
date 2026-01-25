import { ReportService } from '../services/report.service';
import { SubsidyService } from '../services/subsidy.service';
import { SubsidyProgram } from '../types/subsidy.types';
import {
  createMockReport,
  createMockCalculation,
  createMockWageLedger,
  createMockBusinessRegistration,
  createMockInsurance,
} from './helpers/mockDataHelpers';

const reportService = new ReportService();
const subsidyService = new SubsidyService();

describe('PDF Report Generation', () => {
  describe('generatePDFReport', () => {
    it('should generate valid PDF buffer', async () => {
      const report = createMockReport({
        eligibleCalculations: [
          createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 7200000),
        ],
        totalEligibleAmount: 7200000,
      });

      const buffer = await reportService.generatePDFReport(report);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.toString('utf-8', 0, 4)).toBe('%PDF');
    });

    it('should generate report with multiple eligible programs', async () => {
      const report = createMockReport({
        eligibleCalculations: [
          createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 7200000, 'ELIGIBLE'),
          createMockCalculation(SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT, 2400000, 'ELIGIBLE'),
        ],
        totalEligibleAmount: 9600000,
      });

      const buffer = await reportService.generatePDFReport(report);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it('should include excluded programs section when present', async () => {
      const report = createMockReport({
        eligibleCalculations: [
          createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 7200000, 'ELIGIBLE'),
        ],
        excludedSubsidies: [{
          program: SubsidyProgram.EMPLOYMENT_PROMOTION,
          reason: '청년일자리도약장려금과 중복 수급 불가',
          excludedBy: SubsidyProgram.YOUTH_JOB_LEAP,
        }],
        totalEligibleAmount: 7200000,
      });

      const buffer = await reportService.generatePDFReport(report);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it('should handle empty calculations gracefully', async () => {
      const report = createMockReport({
        eligibleCalculations: [],
        totalEligibleAmount: 0,
      });

      const buffer = await reportService.generatePDFReport(report);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generateChecklistText', () => {
    it('should generate text checklist for eligible programs', async () => {
      const calculations = [
        createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 7200000, 'ELIGIBLE'),
      ];
      const checklist = subsidyService.generateApplicationChecklist(calculations);
      
      const text = await reportService.generateChecklistText(checklist);

      expect(text).toContain('청년일자리도약장려금');
      expect(text).toContain('필요 서류');
      expect(text).toContain('신청 사이트');
      expect(text).toContain('고용24');
    });

    it('should include all required documents', async () => {
      const calculations = [
        createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 7200000, 'ELIGIBLE'),
      ];
      const checklist = subsidyService.generateApplicationChecklist(calculations);
      
      const text = await reportService.generateChecklistText(checklist);

      expect(text).toContain('사업자등록증');
      expect(text).toContain('근로계약서');
      expect(text).toContain('4대보험');
    });

    it('should generate multi-program checklist', async () => {
      const calculations = [
        createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 7200000, 'ELIGIBLE'),
        createMockCalculation(SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT, 10800000, 'NEEDS_REVIEW'),
      ];
      const checklist = subsidyService.generateApplicationChecklist(calculations);
      
      const text = await reportService.generateChecklistText(checklist);

      expect(text).toContain('청년일자리도약장려금');
      expect(text).toContain('고령자계속고용장려금');
    });
  });
});

describe('Detailed PDF Report Generation', () => {
  it('should generate detailed report with employee analysis', async () => {
    const wageLedger = createMockWageLedger([
      { name: '김청년', age: 28, monthlyWage: 3000000 },
      { name: '이고령', age: 62, monthlyWage: 4500000 },
    ]);

    const data = {
      businessRegistration: createMockBusinessRegistration(),
      wageLedger,
      insuranceList: createMockInsurance(['김청년', '이고령']),
    };

    const calculations = subsidyService.calculateAll(data, [
      SubsidyProgram.YOUTH_JOB_LEAP,
      SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
    ], 'NON_CAPITAL');

    const report = subsidyService.generateReportWithExclusions(data, calculations);

    const perEmployeeCalculations = wageLedger.employees.map(emp => ({
      employeeName: emp.name,
      residentRegistrationNumber: emp.residentRegistrationNumber,
      hireDate: emp.hireDate,
      age: emp.calculatedAge,
      monthlySalary: emp.monthlyWage,
      weeklyWorkHours: emp.weeklyWorkHours,
      isYouth: emp.isYouth ?? false,
      isSenior: emp.isSenior ?? false,
      eligiblePrograms: [] as any[],
      ineligiblePrograms: [] as any[],
      totalEstimatedSubsidy: 0,
    }));

    const detailedReport = {
      ...report,
      perEmployeeCalculations,
      dataQualityWarnings: [],
      summaryByProgram: [],
      calculationTimestamp: new Date().toISOString(),
    };

    const buffer = await reportService.generateDetailedPDFReport(detailedReport);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

describe('Report with Real Calculations', () => {
  it('should generate complete report from extraction to PDF', async () => {
    const wageLedger = createMockWageLedger([
      { name: '김청년', age: 26, monthlyWage: 3200000, hireDate: '2023-06-01' },
      { name: '이청년', age: 30, monthlyWage: 3500000, hireDate: '2023-03-15' },
      { name: '박시니어', age: 63, monthlyWage: 5000000, hireDate: '2018-01-10' },
    ]);

    const businessReg = createMockBusinessRegistration({ 
      businessAddress: '부산광역시 해운대구' 
    });

    const data = {
      businessRegistration: businessReg,
      wageLedger,
      insuranceList: createMockInsurance(['김청년', '이청년', '박시니어']),
    };

    const calculations = subsidyService.calculateAll(data, [
      SubsidyProgram.YOUTH_JOB_LEAP,
      SubsidyProgram.EMPLOYMENT_PROMOTION,
      SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
    ], 'NON_CAPITAL');

    const report = subsidyService.generateReportWithExclusions(data, calculations);

    expect(report.totalEligibleAmount).toBeGreaterThan(0);
    expect(report.eligibleCalculations.length).toBeGreaterThan(0);

    const buffer = await reportService.generatePDFReport(report);
    expect(buffer).toBeInstanceOf(Buffer);

    const checklistText = await reportService.generateChecklistText(report.applicationChecklist);
    expect(checklistText.length).toBeGreaterThan(100);
  });

  it('should calculate correct totals across all programs', async () => {
    const wageLedger = createMockWageLedger([
      { name: '김청년', age: 26, monthlyWage: 3200000 },
    ]);

    const data = {
      businessRegistration: createMockBusinessRegistration({ businessAddress: '대전광역시' }),
      wageLedger,
      insuranceList: createMockInsurance(['김청년']),
    };

    const calculations = subsidyService.calculateAll(data, [
      SubsidyProgram.YOUTH_JOB_LEAP,
    ], 'NON_CAPITAL');

    const report = subsidyService.generateReportWithExclusions(data, calculations);

    const youthCalc = report.eligibleCalculations.find(
      c => c.program === SubsidyProgram.YOUTH_JOB_LEAP
    );

    expect(youthCalc).toBeDefined();
    expect(youthCalc!.monthlyAmount).toBe(600000);
    expect(youthCalc!.totalAmount).toBe(600000 * 12 + 4800000);
    expect(report.totalEligibleAmount).toBe(youthCalc!.totalAmount);
  });
});

describe('Currency Formatting in Reports', () => {
  it('should format large amounts correctly', async () => {
    const report = createMockReport({
      eligibleCalculations: [
        createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 72000000, 'ELIGIBLE'),
      ],
      totalEligibleAmount: 72000000,
    });

    const buffer = await reportService.generatePDFReport(report);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('should handle amounts over 1억', async () => {
    const report = createMockReport({
      eligibleCalculations: [
        createMockCalculation(SubsidyProgram.YOUTH_JOB_LEAP, 150000000, 'ELIGIBLE'),
      ],
      totalEligibleAmount: 150000000,
    });

    const buffer = await reportService.generatePDFReport(report);
    expect(buffer).toBeInstanceOf(Buffer);
  });
});
