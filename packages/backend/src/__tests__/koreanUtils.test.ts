import {
  extractBusinessNumber,
  extractResidentNumber,
  extractDate,
  extractAllDates,
  extractMoneyAmount,
  extractFieldValue,
  extractKoreanName,
  normalizeKoreanText,
  calculateAgeFromResidentNumber,
  detectRegionType,
  calculateEmploymentDurationMonths,
  calculateApplicationEligibleDate,
  isEmploymentRetentionMet,
  formatDateKorean,
  getBirthInfoFromResidentNumber,
  calculateAge60Date,
} from '../utils/korean.utils';

describe('Business Number Extraction', () => {
  it('should extract standard format XXX-XX-XXXXX', () => {
    expect(extractBusinessNumber('123-45-67890')).toBe('123-45-67890');
  });

  it('should extract format with spaces', () => {
    expect(extractBusinessNumber('123 45 67890')).toBe('123-45-67890');
  });

  it('should extract format without separators', () => {
    expect(extractBusinessNumber('1234567890')).toBe('123-45-67890');
  });

  it('should handle OCR errors (O→0, l→1)', () => {
    expect(extractBusinessNumber('l23-45-678O0')).toBe('123-45-67800');
  });

  it('should extract from surrounding text', () => {
    expect(extractBusinessNumber('사업자번호: 123-45-67890 입니다')).toBe('123-45-67890');
  });

  it('should return null for invalid format', () => {
    expect(extractBusinessNumber('12-345-6789')).toBeNull();
    expect(extractBusinessNumber('invalid')).toBeNull();
  });
});

describe('Resident Number Extraction', () => {
  it('should extract standard format XXXXXX-XXXXXXX', () => {
    expect(extractResidentNumber('940215-1234567')).toBe('940215-1234567');
  });

  it('should extract masked format XXXXXX-X******', () => {
    expect(extractResidentNumber('940215-1******')).toBe('940215-1******');
  });

  it('should extract from surrounding text', () => {
    expect(extractResidentNumber('주민번호: 940215-1234567')).toBe('940215-1234567');
  });

  it('should return null for invalid format', () => {
    expect(extractResidentNumber('94021-1234567')).toBeNull();
    expect(extractResidentNumber('invalid')).toBeNull();
  });
});

describe('Date Extraction', () => {
  it('should extract Korean date format (XXXX년 XX월 XX일)', () => {
    expect(extractDate('2024년 1월 15일')).toBe('2024-01-15');
    expect(extractDate('2024년 12월 5일')).toBe('2024-12-05');
  });

  it('should extract dot format (XXXX.XX.XX)', () => {
    expect(extractDate('2024.1.15')).toBe('2024-01-15');
    expect(extractDate('2024.01.15')).toBe('2024-01-15');
  });

  it('should extract dash format (XXXX-XX-XX)', () => {
    expect(extractDate('2024-01-15')).toBe('2024-01-15');
    expect(extractDate('2024-1-5')).toBe('2024-01-05');
  });

  it('should extract slash format (XXXX/XX/XX)', () => {
    expect(extractDate('2024/01/15')).toBe('2024-01-15');
  });

  it('should return null for invalid format', () => {
    expect(extractDate('invalid date')).toBeNull();
    expect(extractDate('15-01-2024')).toBeNull();
  });
});

describe('extractAllDates', () => {
  it('should extract multiple dates from text', () => {
    const text = '계약기간: 2024년 1월 15일 ~ 2024년 12월 31일';
    const dates = extractAllDates(text);

    expect(dates).toContain('2024-01-15');
    expect(dates).toContain('2024-12-31');
  });

  it('should remove duplicates', () => {
    const text = '시작일: 2024.01.15, 종료일: 2024.01.15';
    const dates = extractAllDates(text);

    expect(dates.length).toBe(1);
  });
});

describe('Money Amount Extraction', () => {
  it('should extract amount with 원 suffix', () => {
    expect(extractMoneyAmount('3,500,000원')).toBe(3500000);
    expect(extractMoneyAmount('1,000원')).toBe(1000);
  });

  it('should extract 만원 format', () => {
    expect(extractMoneyAmount('350만원')).toBe(3500000);
    expect(extractMoneyAmount('100만 원')).toBe(1000000);
  });

  it('should extract 억원 format', () => {
    expect(extractMoneyAmount('1억원')).toBe(100000000);
    expect(extractMoneyAmount('2억 원')).toBe(200000000);
  });

  it('should extract combined 억만원 format', () => {
    expect(extractMoneyAmount('1억 2천만원')).toBe(120000000);
  });

  it('should return null for non-monetary text', () => {
    expect(extractMoneyAmount('invalid')).toBeNull();
  });
});

describe('Field Value Extraction', () => {
  it('should extract value after colon', () => {
    expect(extractFieldValue('상호: (주)테스트회사', ['상호'])).toBe('(주)테스트회사');
    expect(extractFieldValue('대표자 : 김대표', ['대표자'])).toBe('김대표');
  });

  it('should extract value after label with space', () => {
    expect(extractFieldValue('상호 테스트회사', ['상호'])).toBe('테스트회사');
  });

  it('should try multiple labels', () => {
    expect(extractFieldValue('법인명: 테스트법인', ['상호', '법인명', '회사명'])).toBe('테스트법인');
  });

  it('should handle spaced labels', () => {
    expect(extractFieldValue('상  호: 테스트회사', ['상호'])).toBe('테스트회사');
  });

  it('should return null when no match', () => {
    expect(extractFieldValue('무관한 텍스트', ['상호', '법인명'])).toBeNull();
  });
});

describe('Korean Name Extraction', () => {
  it('should extract 2-character names', () => {
    expect(extractKoreanName('김철 사원')).toBe('김철');
  });

  it('should extract 3-character names', () => {
    expect(extractKoreanName('김철수 대표')).toBe('김철수');
  });

  it('should extract 4-character names', () => {
    expect(extractKoreanName('남궁민수 이사')).toBe('남궁민수');
  });

  it('should return null for non-Korean text', () => {
    expect(extractKoreanName('John Smith')).toBeNull();
  });
});

describe('Age Calculation from Resident Number', () => {
  const currentYear = new Date().getFullYear();

  it('should calculate age for 1900s birth (gender 1-2)', () => {
    const age = calculateAgeFromResidentNumber('940215-1234567');
    expect(age).toBe(currentYear - 1994);
  });

  it('should calculate age for 2000s birth (gender 3-4)', () => {
    const age = calculateAgeFromResidentNumber('050315-3234567');
    expect(age).toBe(currentYear - 2005);
  });

  it('should return null for invalid format', () => {
    expect(calculateAgeFromResidentNumber('invalid')).toBeNull();
    expect(calculateAgeFromResidentNumber('940215-5234567')).toBeNull();
  });
});

describe('Region Type Detection', () => {
  it('should detect Seoul as capital', () => {
    expect(detectRegionType('서울특별시 강남구')).toBe('CAPITAL');
    expect(detectRegionType('서울 마포구')).toBe('CAPITAL');
  });

  it('should detect Incheon as capital', () => {
    expect(detectRegionType('인천광역시 남동구')).toBe('CAPITAL');
  });

  it('should detect Gyeonggi as capital', () => {
    expect(detectRegionType('경기도 성남시')).toBe('CAPITAL');
  });

  it('should detect other regions as non-capital', () => {
    expect(detectRegionType('부산광역시')).toBe('NON_CAPITAL');
    expect(detectRegionType('대구광역시')).toBe('NON_CAPITAL');
    expect(detectRegionType('전라남도')).toBe('NON_CAPITAL');
    expect(detectRegionType('강원도')).toBe('NON_CAPITAL');
  });

  it('should default to capital for undefined', () => {
    expect(detectRegionType(undefined)).toBe('CAPITAL');
    expect(detectRegionType(null)).toBe('CAPITAL');
  });
});

describe('Employment Duration Calculation', () => {
  it('should calculate months correctly', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const hireDateStr = sixMonthsAgo.toISOString().split('T')[0];

    const months = calculateEmploymentDurationMonths(hireDateStr);
    expect(months).toBeCloseTo(6, 0);
  });

  it('should return 0 for future dates', () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const hireDateStr = futureDate.toISOString().split('T')[0];

    const months = calculateEmploymentDurationMonths(hireDateStr);
    expect(months).toBe(0);
  });

  it('should return 0 for invalid dates', () => {
    expect(calculateEmploymentDurationMonths('invalid')).toBe(0);
  });
});

describe('Application Eligible Date Calculation', () => {
  it('should calculate date 6 months after hire', () => {
    const eligibleDate = calculateApplicationEligibleDate('2024-01-15', 6);

    expect(eligibleDate).not.toBeNull();
    expect(eligibleDate!.getFullYear()).toBe(2024);
    expect(eligibleDate!.getMonth()).toBe(6); // July (0-indexed)
  });

  it('should return null for invalid date', () => {
    expect(calculateApplicationEligibleDate('invalid', 6)).toBeNull();
  });
});

describe('Employment Retention Check', () => {
  it('should return true when retention period is met', () => {
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    const hireDateStr = sevenMonthsAgo.toISOString().split('T')[0];

    expect(isEmploymentRetentionMet(hireDateStr, 6)).toBe(true);
  });

  it('should return false when retention period is not met', () => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const hireDateStr = threeMonthsAgo.toISOString().split('T')[0];

    expect(isEmploymentRetentionMet(hireDateStr, 6)).toBe(false);
  });
});

describe('Korean Date Formatting', () => {
  it('should format date in Korean style', () => {
    const date = new Date(2024, 6, 15); // July 15, 2024
    expect(formatDateKorean(date)).toBe('2024년 7월 15일');
  });
});

describe('Birth Info Extraction', () => {
  it('should extract birth info for 1900s', () => {
    const info = getBirthInfoFromResidentNumber('940215-1234567');

    expect(info).not.toBeNull();
    expect(info!.birthYear).toBe(1994);
    expect(info!.birthMonth).toBe(2);
    expect(info!.birthDay).toBe(15);
  });

  it('should extract birth info for 2000s', () => {
    const info = getBirthInfoFromResidentNumber('050315-3234567');

    expect(info).not.toBeNull();
    expect(info!.birthYear).toBe(2005);
    expect(info!.birthMonth).toBe(3);
    expect(info!.birthDay).toBe(15);
  });
});

describe('Age 60 Date Calculation', () => {
  it('should calculate when person turns 60', () => {
    const date = calculateAge60Date('640315-1234567');

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1964 + 60);
    expect(date!.getMonth()).toBe(2); // March (0-indexed)
    expect(date!.getDate()).toBe(15);
  });
});

describe('Text Normalization', () => {
  it('should normalize whitespace', () => {
    const result = normalizeKoreanText('테스트   텍스트\n\n줄바꿈');
    expect(result).toBe('테스트 텍스트\n줄바꿈');
  });

  it('should trim text', () => {
    const result = normalizeKoreanText('  테스트  ');
    expect(result).toBe('테스트');
  });
});
