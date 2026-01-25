/**
 * Korean text processing utilities for document extraction
 */

// 사업자등록번호 패턴: XXX-XX-XXXXX
const BUSINESS_NUMBER_PATTERN = /(\d{3})-?(\d{2})-?(\d{5})/;

// 주민등록번호 패턴: XXXXXX-XXXXXXX (마스킹 고려)
const RESIDENT_NUMBER_PATTERN = /(\d{6})-?(\d{7}|\*{7}|\d\*{6})/;

// 날짜 패턴들
const DATE_PATTERNS = [
  /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, // 2024년 1월 15일
  /(\d{4})\.(\d{1,2})\.(\d{1,2})/, // 2024.1.15
  /(\d{4})-(\d{1,2})-(\d{1,2})/, // 2024-01-15
  /(\d{4})\/(\d{1,2})\/(\d{1,2})/, // 2024/01/15
];

// 금액 패턴
const MONEY_PATTERNS = [
  /(\d{1,3}(?:,\d{3})*)\s*원/, // 1,000,000원
  /(\d+)\s*만\s*원/, // 100만원
  /(\d+)\s*억\s*원/, // 1억원
  /(\d+)\s*억\s*(\d+)\s*만\s*원/, // 1억 2천만원
];

export function extractBusinessNumber(text: string): string | null {
  const match = text.match(BUSINESS_NUMBER_PATTERN);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

export function extractResidentNumber(text: string): string | null {
  const match = text.match(RESIDENT_NUMBER_PATTERN);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return null;
}

export function extractDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

export function extractAllDates(text: string): string[] {
  const dates: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, 'g'));
    for (const match of matches) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }
  }
  return [...new Set(dates)];
}

export function extractMoneyAmount(text: string): number | null {
  const billionMillionMatch = text.match(MONEY_PATTERNS[3]);
  if (billionMillionMatch) {
    const billion = parseInt(billionMillionMatch[1]) * 100000000;
    const tenThousand = parseInt(billionMillionMatch[2]) * 10000;
    return billion + tenThousand;
  }

  const billionMatch = text.match(MONEY_PATTERNS[2]);
  if (billionMatch) {
    return parseInt(billionMatch[1]) * 100000000;
  }

  const tenThousandMatch = text.match(MONEY_PATTERNS[1]);
  if (tenThousandMatch) {
    return parseInt(tenThousandMatch[1]) * 10000;
  }

  const regularMatch = text.match(MONEY_PATTERNS[0]);
  if (regularMatch) {
    return parseInt(regularMatch[1].replace(/,/g, ''));
  }

  const plainNumberMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
  if (plainNumberMatch) {
    const value = parseInt(plainNumberMatch[1].replace(/,/g, ''));
    if (value >= 100000) {
      return value;
    }
  }

  return null;
}

export function normalizeKoreanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, '\n')
    .replace(/[ ]+/g, ' ')
    .replace(/[ㅇO0]/g, (char) => {
      return char;
    })
    .trim();
}

export function extractKoreanName(text: string): string | null {
  // Korean names are typically 2-4 characters
  const namePattern = /([가-힣]{2,4})\s*(대표|사원|근로자|피보험자)?/;
  const match = text.match(namePattern);
  return match ? match[1] : null;
}

export function extractFieldValue(text: string, fieldLabels: string[]): string | null {
  for (const label of fieldLabels) {
    // Try patterns like "상호: 회사명" or "상호 : 회사명" or "상호 회사명"
    const patterns = [
      new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`),
      new RegExp(`${label}\\s+([^\\n]+)`),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return null;
}

export function calculateAgeFromResidentNumber(residentNumber: string): number | null {
  const match = residentNumber.match(/(\d{2})(\d{2})(\d{2})-?(\d)/);
  if (!match) return null;

  const yearPrefix = parseInt(match[4]);
  let birthYear: number;

  if (yearPrefix === 1 || yearPrefix === 2) {
    birthYear = 1900 + parseInt(match[1]);
  } else if (yearPrefix === 3 || yearPrefix === 4) {
    birthYear = 2000 + parseInt(match[1]);
  } else {
    return null;
  }

  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}

export type RegionType = 'CAPITAL' | 'NON_CAPITAL';

const CAPITAL_REGION_KEYWORDS = ['서울', '인천', '경기'];

export function detectRegionType(address: string | undefined | null): RegionType {
  if (!address) return 'CAPITAL';
  
  const normalizedAddress = address.replace(/\s+/g, '');
  
  for (const keyword of CAPITAL_REGION_KEYWORDS) {
    if (normalizedAddress.includes(keyword)) {
      return 'CAPITAL';
    }
  }
  
  return 'NON_CAPITAL';
}

export function getBirthInfoFromResidentNumber(residentNumber: string): {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
} | null {
  const match = residentNumber.match(/(\d{2})(\d{2})(\d{2})-?(\d)/);
  if (!match) return null;

  const yearPrefix = parseInt(match[4]);
  let birthYear: number;

  if (yearPrefix === 1 || yearPrefix === 2) {
    birthYear = 1900 + parseInt(match[1]);
  } else if (yearPrefix === 3 || yearPrefix === 4) {
    birthYear = 2000 + parseInt(match[1]);
  } else {
    return null;
  }

  return {
    birthYear,
    birthMonth: parseInt(match[2]),
    birthDay: parseInt(match[3]),
  };
}

export function calculateAge60Date(residentNumber: string): Date | null {
  const birthInfo = getBirthInfoFromResidentNumber(residentNumber);
  if (!birthInfo) return null;

  return new Date(birthInfo.birthYear + 60, birthInfo.birthMonth - 1, birthInfo.birthDay);
}
