import { extractWageLedger, getEmployeeStatistics } from '../services/extraction/wageLedger.extractor';
import { extractInsuranceList, getInsuranceStatistics } from '../services/extraction/insurance.extractor';
import { extractEmploymentContract, getContractStatistics } from '../services/extraction/employmentContract.extractor';
import { MOCK_WAGE_LEDGER, MOCK_INSURANCE_LIST, MOCK_EMPLOYMENT_CONTRACT } from './fixtures/mockDocuments';

describe('Wage Ledger Extractor', () => {
  describe('extractWageLedger', () => {
    it('should extract employees from standard format', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.employees.length).toBeGreaterThanOrEqual(3);
      expect(result.context.confidence).toBeGreaterThan(50);
    });

    it('should extract employees from Excel tab format', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.EXCEL_FORMAT);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.employees.length).toBeGreaterThanOrEqual(3);
    });

    it('should calculate age from resident registration number', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      
      const employeesWithAge = result.data!.employees.filter(e => e.calculatedAge !== undefined);
      expect(employeesWithAge.length).toBeGreaterThan(0);
    });

    it('should classify youth employees (15-34)', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.YOUTH_ONLY);
      
      const stats = getEmployeeStatistics(result.data!);
      expect(stats.youthEmployees).toBeGreaterThan(0);
    });

    it('should classify senior employees (60+)', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.SENIOR_ONLY);
      
      const stats = getEmployeeStatistics(result.data!);
      expect(stats.seniorEmployees).toBeGreaterThan(0);
    });

    it('should handle malformed data gracefully', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.MALFORMED);
      
      expect(result.context.errors.length).toBeGreaterThanOrEqual(0);
      expect(result.context.confidence).toBeLessThan(100);
    });
  });

  describe('getEmployeeStatistics', () => {
    it('should return correct statistics', () => {
      const result = extractWageLedger(MOCK_WAGE_LEDGER.STANDARD);
      const stats = getEmployeeStatistics(result.data!);
      
      expect(stats.totalEmployees).toBeGreaterThan(0);
      expect(typeof stats.youthEmployees).toBe('number');
      expect(typeof stats.seniorEmployees).toBe('number');
      expect(typeof stats.avgWage).toBe('number');
    });
  });
});

describe('Insurance List Extractor', () => {
  describe('extractInsuranceList', () => {
    it('should extract employees from standard format', () => {
      const result = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.employees.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract employees from Excel format', () => {
      const result = extractInsuranceList(MOCK_INSURANCE_LIST.EXCEL_FORMAT);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.employees.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect insurance enrollment status', () => {
      const result = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      
      const fullyInsured = result.data!.employees.filter(
        e => e.employmentInsurance && e.nationalPension && e.healthInsurance && e.industrialAccident
      );
      expect(fullyInsured.length).toBeGreaterThan(0);
    });

    it('should handle partial coverage', () => {
      const result = extractInsuranceList(MOCK_INSURANCE_LIST.PARTIAL_COVERAGE);
      
      expect(result.data).not.toBeNull();
    });
  });

  describe('getInsuranceStatistics', () => {
    it('should return correct statistics', () => {
      const result = extractInsuranceList(MOCK_INSURANCE_LIST.STANDARD);
      const stats = getInsuranceStatistics(result.data!);
      
      expect(stats.totalEmployees).toBeGreaterThan(0);
      expect(typeof stats.employmentInsuranceCount).toBe('number');
      expect(typeof stats.fullCoverageCount).toBe('number');
    });
  });
});

describe('Employment Contract Extractor', () => {
  describe('extractEmploymentContract', () => {
    it('should extract full-time contract info', () => {
      const result = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.workType).toBe('FULL_TIME');
      expect(result.data!.weeklyWorkHours).toBe(40);
    });

    it('should detect contract worker', () => {
      const result = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.CONTRACT_WORKER);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.workType).toBe('CONTRACT');
    });

    it('should detect part-time worker', () => {
      const result = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.PART_TIME);
      
      expect(result.data).not.toBeNull();
      expect(result.data!.workType).toBe('PART_TIME');
      expect(result.data!.weeklyWorkHours).toBeLessThan(40);
    });

    it('should extract employee and employer names', () => {
      const result = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);
      
      expect(result.data!.employeeName).toBeTruthy();
      expect(result.data!.employerName).toBeTruthy();
    });

    it('should extract salary information', () => {
      const result = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);
      
      expect(result.data!.monthlySalary).toBeGreaterThan(0);
    });
  });

  describe('getContractStatistics', () => {
    it('should determine youth eligibility', () => {
      const result = extractEmploymentContract(MOCK_EMPLOYMENT_CONTRACT.FULL_TIME);
      const stats = getContractStatistics(result.data!);
      
      expect(typeof stats.isEligibleForYouthSubsidy).toBe('boolean');
      expect(typeof stats.isFullTimeEquivalent).toBe('boolean');
    });
  });
});
