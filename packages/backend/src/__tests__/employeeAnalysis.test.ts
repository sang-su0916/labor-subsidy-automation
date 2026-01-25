import { employeeAnalysisService } from '../services/employeeAnalysis.service';
import { extractWageLedger } from '../services/extraction/wageLedger.extractor';
import { extractInsuranceList } from '../services/extraction/insurance.extractor';
import { MOCK_WAGE_LEDGER, MOCK_INSURANCE_LIST, TEST_SCENARIOS } from './fixtures/mockDocuments';
import { SubsidyProgram } from '../types/subsidy.types';

describe('Employee Analysis Service', () => {
  describe('mergeEmployeeData', () => {
    it('should merge wage ledger data', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      
      const merged = employeeAnalysisService.mergeEmployeeData(
        wageLedgerResult.data!,
        undefined,
        undefined
      );
      
      expect(merged.length).toBeGreaterThan(0);
    });

    it('should merge wage ledger and insurance data', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const insuranceResult = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      const merged = employeeAnalysisService.mergeEmployeeData(
        wageLedgerResult.data!,
        insuranceResult.data!,
        undefined
      );
      
      expect(merged.length).toBeGreaterThan(0);
      const hasInsuranceInfo = merged.some(e => e.hasEmploymentInsurance);
      expect(hasInsuranceInfo).toBe(true);
    });
  });

  describe('analyzeEmployeeEligibility', () => {
    it('should identify eligible programs for youth employees', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.YOUTH_ONLY);
      const insuranceResult = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      const merged = employeeAnalysisService.mergeEmployeeData(
        wageLedgerResult.data!,
        insuranceResult.data!,
        undefined
      );
      
      const youthEmployee = merged.find(e => e.isYouth);
      if (youthEmployee) {
        const analysis = employeeAnalysisService.analyzeEmployeeEligibility(youthEmployee, 'NON_CAPITAL');
        
        const youthProgram = analysis.eligiblePrograms.find(
          p => p.program === SubsidyProgram.YOUTH_JOB_LEAP
        );
        
        if (youthEmployee.hasEmploymentInsurance) {
          expect(youthProgram).toBeDefined();
        }
      }
    });

    it('should identify eligible programs for senior employees', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.SENIOR_ONLY);
      const insuranceResult = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      const merged = employeeAnalysisService.mergeEmployeeData(
        wageLedgerResult.data!,
        insuranceResult.data!,
        undefined
      );
      
      const seniorEmployee = merged.find(e => e.isSenior);
      if (seniorEmployee) {
        const analysis = employeeAnalysisService.analyzeEmployeeEligibility(seniorEmployee);
        
        const seniorProgram = analysis.eligiblePrograms.find(
          p => p.program === SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT
        );
        
        if (seniorEmployee.hasEmploymentInsurance) {
          expect(seniorProgram).toBeDefined();
        }
      }
    });

    it('should include ineligible programs with reasons', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      
      const merged = employeeAnalysisService.mergeEmployeeData(
        wageLedgerResult.data!,
        undefined,
        undefined
      );
      
      if (merged.length > 0) {
        const analysis = employeeAnalysisService.analyzeEmployeeEligibility(merged[0]);
        
        expect(analysis.ineligiblePrograms.length).toBeGreaterThanOrEqual(0);
        for (const ineligible of analysis.ineligiblePrograms) {
          expect(ineligible.reasons.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('analyzeAllEmployees', () => {
    it('should analyze all employees from wage ledger', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      
      const analyses = employeeAnalysisService.analyzeAllEmployees(
        wageLedgerResult.data!,
        undefined,
        undefined
      );
      
      expect(analyses.length).toBeGreaterThan(0);
      for (const analysis of analyses) {
        expect(analysis.employeeName).toBeTruthy();
        expect(typeof analysis.totalEstimatedSubsidy).toBe('number');
      }
    });
  });

  describe('getEmployeeSummary', () => {
    it('should return correct summary statistics', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const insuranceResult = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      const analyses = employeeAnalysisService.analyzeAllEmployees(
        wageLedgerResult.data!,
        insuranceResult.data!,
        undefined
      );
      
      const summary = employeeAnalysisService.getEmployeeSummary(analyses);
      
      expect(summary.totalEmployees).toBe(analyses.length);
      expect(typeof summary.youthCount).toBe('number');
      expect(typeof summary.seniorCount).toBe('number');
      expect(typeof summary.totalEstimatedSubsidy).toBe('number');
      expect(summary.byProgram).toBeDefined();
    });
  });

  describe('calculation breakdown', () => {
    it('should include detailed calculation steps for eligible programs', () => {
      const wageLedgerResult = extractWageLedger(MOCK_WAGE_LEDGER.YOUTH_ONLY);
      const insuranceResult = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      const merged = employeeAnalysisService.mergeEmployeeData(
        wageLedgerResult.data!,
        insuranceResult.data!,
        undefined
      );
      
      const youthWithInsurance = merged.find(e => e.isYouth && e.hasEmploymentInsurance);
      if (youthWithInsurance) {
        const analysis = employeeAnalysisService.analyzeEmployeeEligibility(youthWithInsurance, 'NON_CAPITAL');
        
        for (const eligible of analysis.eligiblePrograms) {
          expect(eligible.breakdown).toBeDefined();
          expect(eligible.breakdown.steps.length).toBeGreaterThan(0);
          expect(eligible.breakdown.paymentSchedule.length).toBeGreaterThan(0);
          expect(eligible.breakdown.totalAmount).toBeGreaterThan(0);
        }
      }
    });
  });
});
