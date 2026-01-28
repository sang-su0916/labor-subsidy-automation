import { extractBusinessRegistration } from '../services/extraction/businessRegistration.extractor';
import { extractWageLedger } from '../services/extraction/wageLedger.extractor';
import { extractInsuranceList } from '../services/extraction/insurance.extractor';
import { extractEmploymentContract } from '../services/extraction/employmentContract.extractor';
import { SubsidyService } from '../services/subsidy.service';
import { ReportService } from '../services/report.service';
import { SubsidyProgram } from '../types/subsidy.types';
import {
  MOCK_BUSINESS_REGISTRATION,
  MOCK_WAGE_LEDGER,
  MOCK_INSURANCE_LIST,
  MOCK_EMPLOYMENT_CONTRACT,
  TEST_SCENARIOS,
} from './fixtures/mockDocuments';
import { detectRegionType } from '../utils/korean.utils';

const subsidyService = new SubsidyService();
const reportService = new ReportService();

describe('E2E Integration - Complete Pipeline', () => {
  describe('Youth Startup Scenario', () => {
    it('should process all documents and calculate youth subsidies correctly', () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.YOUTH_ONLY);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      const contract = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);

      expect(businessReg.data).not.toBeNull();
      expect(wageLedger.data).not.toBeNull();
      expect(insurance.data).not.toBeNull();
      expect(contract.data).not.toBeNull();

      const regionType = detectRegionType(businessReg.data!.businessAddress);

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
        insuranceList: insurance.data!,
        employmentContract: contract.data!,
      };

      const calculations = subsidyService.calculateAll(data, [
        SubsidyProgram.YOUTH_JOB_LEAP,
        SubsidyProgram.EMPLOYMENT_PROMOTION,
      ], regionType);

      expect(calculations.length).toBe(2);

      const { eligible, excluded } = subsidyService.applyDuplicateExclusion(calculations);

      if (excluded.length > 0) {
        expect(excluded[0].program).toBe(SubsidyProgram.EMPLOYMENT_PROMOTION);
        expect(excluded[0].excludedBy).toBe(SubsidyProgram.YOUTH_JOB_LEAP);
      }

      const report = subsidyService.generateReportWithExclusions(data, calculations);

      expect(report.businessInfo.name).toBeTruthy();
      expect(report.totalEligibleAmount).toBeGreaterThanOrEqual(0);
    });

    it('should generate complete PDF report for youth startup', async () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.ALTERNATIVE_FORMAT);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.YOUTH_ONLY);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);

      const regionType = detectRegionType(businessReg.data!.businessAddress);

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
        insuranceList: insurance.data!,
      };

      const calculations = subsidyService.calculateAll(data, [
        SubsidyProgram.YOUTH_JOB_LEAP,
      ], regionType);

      const report = subsidyService.generateReportWithExclusions(data, calculations);
      const pdfBuffer = await reportService.generatePDFReport(report);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      const checklistText = await reportService.generateChecklistText(report.applicationChecklist);
      expect(checklistText).toContain('청년일자리도약장려금');
    });
  });

  describe('Senior Company Scenario', () => {
    it('should process senior employee documents correctly', () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.ALTERNATIVE_FORMAT);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.SENIOR_ONLY);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);

      expect(wageLedger.data).not.toBeNull();

      const seniorEmployees = wageLedger.data!.employees.filter(e => e.isSenior);
      expect(seniorEmployees.length).toBeGreaterThan(0);

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
        insuranceList: insurance.data!,
      };

      const calculations = subsidyService.calculateAll(data, [
        SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
        SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
      ], 'NON_CAPITAL');

      expect(calculations.length).toBe(2);

      const { eligible, excluded } = subsidyService.applyDuplicateExclusion(calculations);

      expect(eligible.some(c => c.program === SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT)).toBe(true);
      expect(excluded.some(e => e.program === SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT)).toBe(true);
    });

    it('should apply correct regional rates for senior subsidies', () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.MINIMAL);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.SENIOR_ONLY);

      const regionType = detectRegionType(businessReg.data!.businessAddress);
      expect(regionType).toBe('NON_CAPITAL');

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
      };

      const result = subsidyService.calculateSeniorContinuedEmployment(data, 'NON_CAPITAL');

      expect(result.quarterlyAmount).toBe(1200000 * wageLedger.data!.employees.length);
      expect(result.notes.some(note => note.includes('비수도권'))).toBe(true);
    });
  });

  describe('Mixed Age Company Scenario', () => {
    it('should handle mixed youth and senior employees', () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);

      expect(wageLedger.data).not.toBeNull();

      const employees = wageLedger.data!.employees;
      const youthCount = employees.filter(e => e.isYouth).length;
      const seniorCount = employees.filter(e => e.isSenior).length;

      expect(youthCount).toBeGreaterThan(0);
      expect(seniorCount).toBeGreaterThanOrEqual(0);

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
        insuranceList: insurance.data!,
      };

      const calculations = subsidyService.calculateAll(data, [
        SubsidyProgram.YOUTH_JOB_LEAP,
        SubsidyProgram.EMPLOYMENT_PROMOTION,
        SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
        SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
      ], 'NON_CAPITAL');

      expect(calculations.length).toBe(4);

      const report = subsidyService.generateReportWithExclusions(data, calculations);

      expect(report.excludedSubsidies.length).toBeGreaterThan(0);
      expect(report.totalEligibleAmount).toBeGreaterThan(0);
    });

    it('should generate complete application checklist for mixed company', async () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
        insuranceList: insurance.data!,
      };

      const calculations = subsidyService.calculateAll(data, [
        SubsidyProgram.YOUTH_JOB_LEAP,
        SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
      ], 'NON_CAPITAL');

      const report = subsidyService.generateReportWithExclusions(data, calculations);
      const checklistText = await reportService.generateChecklistText(report.applicationChecklist);

      if (report.eligibleCalculations.some(c => c.program === SubsidyProgram.YOUTH_JOB_LEAP)) {
        expect(checklistText).toContain('청년일자리도약장려금');
        expect(checklistText).toContain('고용24');
      }

      if (report.eligibleCalculations.some(c => c.program === SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT)) {
        expect(checklistText).toContain('고령자계속고용장려금');
      }
    });
  });

  describe('Parental Leave Scenario', () => {
    it('should calculate parental leave subsidy with special rate', () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const contract = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);

      const data = {
        businessRegistration: businessReg.data!,
        employmentContract: contract.data!,
      };

      const resultWithSpecialRate = subsidyService.calculateParentalEmploymentStability(
        data,
        'PARENTAL_LEAVE',
        { childAgeMonths: 8, consecutiveLeaveMonths: 6 }
      );

      expect(resultWithSpecialRate.totalAmount).toBe(1000000 * 3 + 300000 * 9);
      expect(resultWithSpecialRate.notes.some(note => note.includes('특례'))).toBe(true);

      const resultWithoutSpecialRate = subsidyService.calculateParentalEmploymentStability(
        data,
        'PARENTAL_LEAVE',
        { childAgeMonths: 18, consecutiveLeaveMonths: 6 }
      );

      expect(resultWithoutSpecialRate.totalAmount).toBe(300000 * 12);
    });
  });

  describe('Data Quality and Confidence', () => {
    it('should track extraction confidence across documents', () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      const contract = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);

      expect(businessReg.context.confidence).toBeGreaterThan(50);
      expect(wageLedger.context.confidence).toBeGreaterThan(50);
      expect(insurance.context.confidence).toBeGreaterThan(50);
      expect(contract.context.confidence).toBeGreaterThan(50);
    });

    it('should handle malformed data gracefully', () => {
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.MALFORMED);

      expect(wageLedger.context.confidence).toBeLessThan(100);
    });

    it('should report errors in extraction context', () => {
      const result = extractBusinessRegistration('완전히 무관한 텍스트');

      expect(result.data).toBeNull();
      expect(result.context.errors.length).toBeGreaterThan(0);
      expect(result.context.confidence).toBe(0);
    });
  });

  describe('Full Pipeline with PDF Output', () => {
    it('should complete entire pipeline from OCR to PDF', async () => {
      const businessReg = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const wageLedger = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const insurance = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      const contract = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);

      const allExtracted = [businessReg, wageLedger, insurance, contract]
        .every(r => r.data !== null);
      expect(allExtracted).toBe(true);

      const data = {
        businessRegistration: businessReg.data!,
        wageLedger: wageLedger.data!,
        insuranceList: insurance.data!,
        employmentContract: contract.data!,
      };

      const calculations = subsidyService.calculateAll(data, [
        SubsidyProgram.YOUTH_JOB_LEAP,
        SubsidyProgram.EMPLOYMENT_PROMOTION,
        SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
        SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
        SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY,
      ], 'NON_CAPITAL');

      expect(calculations.length).toBe(5);

      const report = subsidyService.generateReportWithExclusions(data, calculations);

      expect(report.id).toBeTruthy();
      expect(report.generatedAt).toBeTruthy();
      expect(report.businessInfo.name).toBeTruthy();
      expect(report.totalEligibleAmount).toBeGreaterThanOrEqual(0);
      expect(report.eligibleCalculations.length).toBeGreaterThanOrEqual(0);

      const pdfBuffer = await reportService.generatePDFReport(report);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(5000);
      expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');

      const checklistText = await reportService.generateChecklistText(report.applicationChecklist);
      expect(checklistText.length).toBeGreaterThan(0);
    });
  });
});

describe('TEST_SCENARIOS Integration', () => {
  it('should process MIXED_AGE_COMPANY scenario', () => {
    const scenario = TEST_SCENARIOS.MIXED_AGE_COMPANY;
    
    const businessReg = extractBusinessRegistration(scenario.businessRegistration);
    const wageLedger = extractWageLedger(scenario.wageLedger);
    const insurance = extractInsuranceList(scenario.insuranceList);
    const contract = extractEmploymentContract(scenario.employmentContract);

    expect(businessReg.data).not.toBeNull();
    expect(wageLedger.data).not.toBeNull();

    const youthCount = wageLedger.data!.employees.filter(e => e.isYouth).length;
    const seniorCount = wageLedger.data!.employees.filter(e => e.isSenior).length;

    expect(youthCount).toBe(scenario.expectedYouthCount);
    expect(seniorCount).toBe(scenario.expectedSeniorCount);
  });

  it('should process YOUTH_STARTUP scenario', () => {
    const scenario = TEST_SCENARIOS.YOUTH_STARTUP;
    
    const wageLedger = extractWageLedger(scenario.wageLedger);

    expect(wageLedger.data).not.toBeNull();

    const youthCount = wageLedger.data!.employees.filter(e => e.isYouth).length;

    expect(youthCount).toBe(scenario.expectedYouthCount);
    expect(scenario.expectedSeniorCount).toBe(0);
  });

  it('should process SENIOR_COMPANY scenario', () => {
    const scenario = TEST_SCENARIOS.SENIOR_COMPANY;
    
    const wageLedger = extractWageLedger(scenario.wageLedger);

    expect(wageLedger.data).not.toBeNull();

    const seniorCount = wageLedger.data!.employees.filter(e => e.isSenior).length;

    expect(seniorCount).toBe(scenario.expectedSeniorCount);
    expect(scenario.expectedYouthCount).toBe(0);
  });
});
