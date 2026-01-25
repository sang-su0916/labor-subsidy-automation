import { SubsidyService } from '../services/subsidy.service';
import { SubsidyProgram } from '../types/subsidy.types';
import {
  createMockWageLedger,
  createMockInsurance,
  createMockBusinessRegistration,
  createMockEmploymentContract,
  getHireDateMonthsAgo,
} from './helpers/mockDataHelpers';

const subsidyService = new SubsidyService();

describe('Youth Job Leap Subsidy Calculation', () => {
  describe('Capital Region Requirements', () => {
    it('should NOT be eligible for general youth in capital region', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration({ businessAddress: '서울특별시 강남구' }),
        wageLedger: createMockWageLedger([
          { name: '김청년', age: 28, monthlyWage: 3000000, hireDate: getHireDateMonthsAgo(8) },
        ]),
        insuranceList: createMockInsurance(['김청년']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'CAPITAL', 'GENERAL');

      expect(result.eligibility).not.toBe('ELIGIBLE');
      expect(result.requirementsNotMet.some(r => r.id === 'youth_type')).toBe(true);
      expect(result.notes).toContainEqual(expect.stringContaining('수도권'));
    });

    it('should be eligible for employment difficulty youth in capital region', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration({ businessAddress: '서울특별시 강남구' }),
        wageLedger: createMockWageLedger([
          { name: '김청년', age: 28, monthlyWage: 3000000, hireDate: getHireDateMonthsAgo(8) },
        ]),
        insuranceList: createMockInsurance(['김청년']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'CAPITAL', 'EMPLOYMENT_DIFFICULTY');

      expect(result.requirementsNotMet.some(r => r.id === 'youth_type')).toBe(false);
    });
  });

  describe('Non-Capital Region', () => {
    it('should calculate correct amount for non-capital region general youth', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration({ businessAddress: '부산광역시 해운대구' }),
        wageLedger: createMockWageLedger([
          { name: '김청년', age: 28, monthlyWage: 3000000, hireDate: getHireDateMonthsAgo(8) },
        ]),
        insuranceList: createMockInsurance(['김청년']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'NON_CAPITAL', 'GENERAL');

      expect(result.monthlyAmount).toBe(600000);
      expect(result.totalMonths).toBe(12);
      expect(result.incentiveAmount).toBe(4800000);
      expect(result.totalAmount).toBe(600000 * 12 + 4800000);
      expect(result.notes).toContainEqual(expect.stringContaining('비수도권'));
    });

    it('should apply higher incentive for employment difficulty youth', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration({ businessAddress: '전라북도 전주시' }),
        wageLedger: createMockWageLedger([
          { name: '김청년', age: 28, monthlyWage: 3000000, hireDate: getHireDateMonthsAgo(8) },
        ]),
        insuranceList: createMockInsurance(['김청년']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'NON_CAPITAL', 'EMPLOYMENT_DIFFICULTY');

      expect(result.incentiveAmount).toBe(7200000);
      expect(result.totalAmount).toBe(600000 * 12 + 7200000);
    });

    it('should scale amount with multiple employees', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration({ businessAddress: '대구광역시' }),
        wageLedger: createMockWageLedger([
          { name: '김청년', age: 28, monthlyWage: 3000000 },
          { name: '이청년', age: 25, monthlyWage: 2800000 },
          { name: '박청년', age: 32, monthlyWage: 3500000 },
        ]),
        insuranceList: createMockInsurance(['김청년', '이청년', '박청년']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'NON_CAPITAL', 'GENERAL');

      expect(result.monthlyAmount).toBe(600000 * 3);
      expect(result.incentiveAmount).toBe(4800000 * 3);
    });
  });

  describe('6-Month Employment Retention Check', () => {
    it('should show application timeline for recently hired employees', () => {
      const data = {
        wageLedger: createMockWageLedger([
          { name: '신입직원', age: 28, hireDate: getHireDateMonthsAgo(4) },
        ]),
        insuranceList: createMockInsurance(['신입직원']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'NON_CAPITAL');

      expect(result.notes.some(note => note.includes('신청 가능 시점'))).toBe(true);
    });

    it('should not show timeline for employees past 6 months', () => {
      const data = {
        wageLedger: createMockWageLedger([
          { name: '기존직원', age: 28, hireDate: getHireDateMonthsAgo(8) },
        ]),
        insuranceList: createMockInsurance(['기존직원']),
      };

      const result = subsidyService.calculateYouthJobLeap(data, 'NON_CAPITAL');

      const timelineNotes = result.notes.filter(note => note.includes('신청 가능 시점'));
      expect(timelineNotes.length).toBe(0);
    });
  });
});

describe('Employment Promotion Subsidy - Minimum Wage Check', () => {
  const MINIMUM_WAGE_121_PERCENT = 1210000;

  it('should exclude employees below 121% minimum wage', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration(),
      wageLedger: createMockWageLedger([
        { name: '저임금직원', age: 45, monthlyWage: 1100000 },
        { name: '적정임금직원', age: 50, monthlyWage: 1500000 },
      ]),
      insuranceList: createMockInsurance(['저임금직원', '적정임금직원']),
    };

    const result = subsidyService.calculateEmploymentPromotion(data);

    const wageCheckFailure = result.requirementsNotMet.find(r => r.id === 'minimum_wage_check');
    expect(wageCheckFailure).toBeDefined();
    expect(wageCheckFailure!.description).toContain('1명');

    const eligible = result.requirementsMet.find(r => r.id === 'wage_eligible');
    expect(eligible).toBeDefined();
    expect(eligible!.description).toContain('1명');
  });

  it('should include all employees meeting minimum wage', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration(),
      wageLedger: createMockWageLedger([
        { name: '직원A', age: 45, monthlyWage: 1500000 },
        { name: '직원B', age: 50, monthlyWage: 2000000 },
        { name: '직원C', age: 55, monthlyWage: 2500000 },
      ]),
      insuranceList: createMockInsurance(['직원A', '직원B', '직원C']),
    };

    const result = subsidyService.calculateEmploymentPromotion(data);

    const eligible = result.requirementsMet.find(r => r.id === 'wage_eligible');
    expect(eligible).toBeDefined();
    expect(eligible!.description).toContain('3명');

    expect(result.monthlyAmount).toBe(600000 * 3);
  });

  it('should show note about minimum wage requirement', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration(),
      wageLedger: createMockWageLedger([
        { name: '직원A', age: 45, monthlyWage: 2000000 },
      ]),
    };

    const result = subsidyService.calculateEmploymentPromotion(data);

    expect(result.notes.some(note => note.includes('121만원'))).toBe(true);
  });

  it('should handle edge case at exactly minimum wage threshold', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration(),
      wageLedger: createMockWageLedger([
        { name: '경계직원', age: 45, monthlyWage: MINIMUM_WAGE_121_PERCENT },
      ]),
    };

    const result = subsidyService.calculateEmploymentPromotion(data);

    const eligible = result.requirementsMet.find(r => r.id === 'wage_eligible');
    expect(eligible).toBeDefined();
    expect(eligible!.description).toContain('1명');
  });
});

describe('Parental Employment Stability - Special Rate Calculation', () => {
  describe('Special Rate for Children Under 12 Months', () => {
    it('should apply 1M won/month for first 3 months with qualifying conditions', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'PARENTAL_LEAVE', {
        childAgeMonths: 6,
        consecutiveLeaveMonths: 6,
      });

      expect(result.totalAmount).toBe(1000000 * 3 + 300000 * 9);
      expect(result.notes.some(note => note.includes('특례 적용'))).toBe(true);
      expect(result.notes.some(note => note.includes('첫 3개월'))).toBe(true);
    });

    it('should NOT apply special rate if child is over 12 months', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'PARENTAL_LEAVE', {
        childAgeMonths: 15,
        consecutiveLeaveMonths: 6,
      });

      expect(result.totalAmount).toBe(300000 * 12);
      expect(result.notes.some(note => note.includes('만12개월 초과'))).toBe(true);
    });

    it('should NOT apply special rate if leave is less than 3 months', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'PARENTAL_LEAVE', {
        childAgeMonths: 6,
        consecutiveLeaveMonths: 2,
      });

      expect(result.totalAmount).toBe(300000 * 12);
      expect(result.notes.some(note => note.includes('3개월 미만'))).toBe(true);
    });

    it('should apply standard rate when child age is not provided', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'PARENTAL_LEAVE');

      expect(result.totalAmount).toBe(300000 * 12);
      expect(result.notes.some(note => note.includes('특례'))).toBe(true);
    });
  });

  describe('Other Parental Leave Types', () => {
    it('should calculate maternity leave correctly', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'MATERNITY_LEAVE');

      expect(result.monthlyAmount).toBe(800000);
      expect(result.totalMonths).toBe(3);
      expect(result.totalAmount).toBe(800000 * 3);
      expect(result.notes.some(note => note.includes('출산전후휴가'))).toBe(true);
    });

    it('should calculate reduced hours correctly', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'REDUCED_HOURS');

      expect(result.monthlyAmount).toBe(300000);
      expect(result.totalMonths).toBe(24);
      expect(result.totalAmount).toBe(300000 * 24);
      expect(result.notes.some(note => note.includes('근로시간 단축'))).toBe(true);
    });
  });

  describe('Additional Support Notes', () => {
    it('should include additional support information', () => {
      const data = {
        businessRegistration: createMockBusinessRegistration(),
        employmentContract: createMockEmploymentContract(),
      };

      const result = subsidyService.calculateParentalEmploymentStability(data, 'PARENTAL_LEAVE');

      expect(result.notes.some(note => note.includes('대체인력지원금'))).toBe(true);
      expect(result.notes.some(note => note.includes('업무분담지원금'))).toBe(true);
      expect(result.notes.some(note => note.includes('남성육아휴직인센티브'))).toBe(true);
    });
  });
});

describe('Senior Continued Employment - Regional Differences', () => {
  it('should calculate 90만원/quarter for capital region', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration({ businessAddress: '서울특별시' }),
      wageLedger: createMockWageLedger([
        { name: '김시니어', age: 62, monthlyWage: 4500000 },
      ]),
    };

    const result = subsidyService.calculateSeniorContinuedEmployment(data, 'CAPITAL');

    expect(result.quarterlyAmount).toBe(900000);
    expect(result.totalAmount).toBe(900000 * 12);
    expect(result.notes.some(note => note.includes('수도권'))).toBe(true);
    expect(result.notes.some(note => note.includes('90만원'))).toBe(true);
  });

  it('should calculate 120만원/quarter for non-capital region', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration({ businessAddress: '부산광역시' }),
      wageLedger: createMockWageLedger([
        { name: '김시니어', age: 62, monthlyWage: 4500000 },
      ]),
    };

    const result = subsidyService.calculateSeniorContinuedEmployment(data, 'NON_CAPITAL');

    expect(result.quarterlyAmount).toBe(1200000);
    expect(result.totalAmount).toBe(1200000 * 12);
    expect(result.notes.some(note => note.includes('비수도권'))).toBe(true);
    expect(result.notes.some(note => note.includes('120만원'))).toBe(true);
  });

  it('should scale with multiple senior employees', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration({ businessAddress: '대전광역시' }),
      wageLedger: createMockWageLedger([
        { name: '김시니어', age: 62, monthlyWage: 4500000 },
        { name: '이시니어', age: 65, monthlyWage: 4000000 },
      ]),
    };

    const result = subsidyService.calculateSeniorContinuedEmployment(data, 'NON_CAPITAL');

    expect(result.quarterlyAmount).toBe(1200000 * 2);
  });
});

describe('Senior Employment Support', () => {
  it('should calculate quarterly support correctly', () => {
    const data = {
      businessRegistration: createMockBusinessRegistration(),
      wageLedger: createMockWageLedger([
        { name: '신규시니어', age: 61, monthlyWage: 3000000 },
      ]),
      insuranceList: createMockInsurance(['신규시니어']),
    };

    const result = subsidyService.calculateSeniorEmploymentSupport(data);

    expect(result.quarterlyAmount).toBe(300000);
    expect(result.totalMonths).toBe(24);
    expect(result.totalAmount).toBe(300000 * 8);
    expect(result.notes.some(note => note.includes('60세 이상'))).toBe(true);
    expect(result.notes.some(note => note.includes('2년'))).toBe(true);
  });
});

describe('Duplicate Exclusion Rules', () => {
  it('should exclude Employment Promotion when Youth Job Leap is present', () => {
    const calculations = [
      subsidyService.calculateYouthJobLeap({
        businessRegistration: createMockBusinessRegistration({ businessAddress: '부산' }),
        wageLedger: createMockWageLedger([{ name: '김청년', age: 28 }]),
        insuranceList: createMockInsurance(['김청년']),
      }, 'NON_CAPITAL'),
      subsidyService.calculateEmploymentPromotion({
        businessRegistration: createMockBusinessRegistration(),
        wageLedger: createMockWageLedger([{ name: '김청년', age: 28, monthlyWage: 2000000 }]),
      }),
    ];

    const { eligible, excluded } = subsidyService.applyDuplicateExclusion(calculations);

    expect(eligible.some(c => c.program === SubsidyProgram.YOUTH_JOB_LEAP)).toBe(true);
    expect(excluded.some(e => e.program === SubsidyProgram.EMPLOYMENT_PROMOTION)).toBe(true);
    expect(excluded[0].excludedBy).toBe(SubsidyProgram.YOUTH_JOB_LEAP);
  });

  it('should exclude Senior Employment Support when Senior Continued Employment is present', () => {
    const calculations = [
      subsidyService.calculateSeniorContinuedEmployment({
        businessRegistration: createMockBusinessRegistration(),
        wageLedger: createMockWageLedger([{ name: '김시니어', age: 62 }]),
      }, 'CAPITAL'),
      subsidyService.calculateSeniorEmploymentSupport({
        businessRegistration: createMockBusinessRegistration(),
        wageLedger: createMockWageLedger([{ name: '김시니어', age: 62 }]),
      }),
    ];

    const { eligible, excluded } = subsidyService.applyDuplicateExclusion(calculations);

    expect(eligible.some(c => c.program === SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT)).toBe(true);
    expect(excluded.some(e => e.program === SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT)).toBe(true);
  });
});

describe('Application Checklist Generation', () => {
  it('should generate checklist for eligible programs only', () => {
    const eligibleCalc = subsidyService.calculateYouthJobLeap({
      businessRegistration: createMockBusinessRegistration({ businessAddress: '부산' }),
      wageLedger: createMockWageLedger([{ name: '김청년', age: 28 }]),
      insuranceList: createMockInsurance(['김청년']),
    }, 'NON_CAPITAL');

    const notEligibleCalc = subsidyService.calculateEmploymentRetention({
      businessRegistration: createMockBusinessRegistration(),
    });

    const checklist = subsidyService.generateApplicationChecklist([eligibleCalc, notEligibleCalc]);

    expect(checklist.length).toBe(1);
    expect(checklist[0].programName).toBe('청년일자리도약장려금');
    expect(checklist[0].requiredDocuments.length).toBeGreaterThan(0);
    expect(checklist[0].applicationSite).toContain('고용24');
  });

  it('should include NEEDS_REVIEW programs in checklist', () => {
    const needsReviewCalc = subsidyService.calculateSeniorContinuedEmployment({
      businessRegistration: createMockBusinessRegistration(),
      wageLedger: createMockWageLedger([{ name: '김시니어', age: 62 }]),
    }, 'CAPITAL');

    const checklist = subsidyService.generateApplicationChecklist([needsReviewCalc]);

    expect(checklist.length).toBe(1);
    expect(checklist[0].programName).toBe('고령자계속고용장려금');
  });
});
