/**
 * Korean text processing utilities for document extraction
 */

const BUSINESS_NUMBER_PATTERNS = [
  /(\d{3})-(\d{2})-(\d{5})/,
  /(\d{3})[\s-]?(\d{2})[\s-]?(\d{5})/,
  /(\d{3})\s*[-~]\s*(\d{2})\s*[-~]\s*(\d{5})/,
  /(\d{3})(\d{2})(\d{5})/,
];

const RESIDENT_NUMBER_PATTERNS = [
  /(\d{6})-(\d{7})/,
  /(\d{6})-(\*{7}|\d\*{6}|\*{6}\d)/,
  /(\d{6})[\s-]?(\d{7})/,
  /(\d{6})\s*[-~]\s*(\d{7}|\*+)/,
];

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
  /(\d+)\s*억\s*(\d+)\s*천?\s*만\s*원/, // 1억 2천만원, 1억 2만원
  /(\d+)\s*천\s*만\s*원/, // 2천만원
];

export function extractBusinessNumber(text: string): string | null {
  const normalizedText = normalizeOcrText(text);
  
  for (const pattern of BUSINESS_NUMBER_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  return null;
}

export function extractResidentNumber(text: string): string | null {
  const normalizedText = normalizeOcrText(text);
  
  for (const pattern of RESIDENT_NUMBER_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }
  }
  return null;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[oO]/g, '0')
    .replace(/[lI]/g, '1')
    .replace(/[zZ]/g, '2')
    .replace(/[sS](?=\d)/g, '5')
    .replace(/[bB](?=\d)/g, '6')
    .replace(/[gG](?=\d)/g, '9')
    .replace(/\s+/g, ' ')
    .trim();
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
    const hasThousand = text.includes('천');
    const multiplier = hasThousand ? 10000000 : 10000;
    const tenThousand = parseInt(billionMillionMatch[2]) * multiplier;
    return billion + tenThousand;
  }

  const tenMillionMatch = text.match(MONEY_PATTERNS[4]);
  if (tenMillionMatch) {
    return parseInt(tenMillionMatch[1]) * 10000000;
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
  const normalizedText = text.replace(/\s+/g, ' ');
  
  for (const label of fieldLabels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelVariants = generateLabelVariants(escapedLabel);
    
    for (const labelVariant of labelVariants) {
      const patterns = [
        new RegExp(`${labelVariant}\\s*[:：]\\s*([^\\n:：]+)`),
        new RegExp(`${labelVariant}\\s+([^\\n]+)`),
        new RegExp(`${labelVariant}\\s*\\n\\s*([^\\n]+)`),
        new RegExp(`${labelVariant}[\\t\\s]{2,}([^\\n\\t]+)`),
        new RegExp(`${labelVariant}\\s*[\\(\\[【]?\\s*([^\\n\\)\\]】]+)`),
      ];

      for (const pattern of patterns) {
        const match = normalizedText.match(pattern);
        if (match && match[1]) {
          const value = cleanExtractedValue(match[1]);
          if (value && !isFieldLabel(value)) {
            return value;
          }
        }
      }
    }
  }
  return null;
}

function generateLabelVariants(label: string): string[] {
  const variants = [label];
  
  const spacedLabel = label.split('').join('\\s*');
  if (spacedLabel !== label) {
    variants.push(spacedLabel);
  }
  
  return variants;
}

function cleanExtractedValue(value: string): string {
  let cleaned = value
    .replace(/^[\s:：\-]+/, '')
    .replace(/[\s:：\-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  const labelBoundaries = [
    '개업년월일', '개업일', '개업', '소재지', '업태', '종목', '업종',
    '상호', '법인명', '대표자', '사업장', '등록번호', '주민등록번호',
    '성명', '주소', '전화', '사업자'
  ];
  
  for (const boundary of labelBoundaries) {
    const idx = cleaned.indexOf(boundary);
    if (idx > 0) {
      cleaned = cleaned.substring(0, idx).trim();
      break;
    }
  }
  
  return cleaned;
}

// 값이 다른 필드 레이블인지 확인
function isFieldLabel(value: string): boolean {
  const commonLabels = [
    '상호', '법인명', '대표자', '사업장', '소재지', '업태', '종목',
    '개업', '등록번호', '주민등록번호', '성명', '주소'
  ];
  return commonLabels.some(label => value.startsWith(label));
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

export function calculateEmploymentDurationMonths(hireDate: string): number {
  const hire = new Date(hireDate);
  if (isNaN(hire.getTime())) return 0;
  
  const now = new Date();
  const months = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
  return Math.max(0, months);
}

export function calculateApplicationEligibleDate(hireDate: string, requiredMonths: number): Date | null {
  const hire = new Date(hireDate);
  if (isNaN(hire.getTime())) return null;
  
  const eligibleDate = new Date(hire);
  eligibleDate.setMonth(eligibleDate.getMonth() + requiredMonths);
  return eligibleDate;
}

export function isEmploymentRetentionMet(hireDate: string, requiredMonths: number): boolean {
  return calculateEmploymentDurationMonths(hireDate) >= requiredMonths;
}

export function formatDateKorean(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 주민등록번호 체크섬 검증
 * 한국 주민등록번호는 13자리이며, 마지막 자릿수가 체크섬
 */
export function validateResidentNumber(rrn: string): { isValid: boolean; error?: string } {
  // 하이픈 및 공백 제거
  const cleaned = rrn.replace(/[-\s]/g, '');

  // 길이 확인 (마스킹된 경우 부분 검증만)
  if (cleaned.length !== 13) {
    // 마스킹된 경우 (예: 900101-1******)
    if (cleaned.includes('*')) {
      // 앞 7자리 기본 검증만 수행
      const frontPart = cleaned.substring(0, 7).replace(/\*/g, '');
      if (frontPart.length >= 6) {
        const month = parseInt(frontPart.substring(2, 4));
        const day = parseInt(frontPart.substring(4, 6));
        if (month < 1 || month > 12) {
          return { isValid: false, error: '월 값이 유효하지 않습니다 (1-12)' };
        }
        if (day < 1 || day > 31) {
          return { isValid: false, error: '일 값이 유효하지 않습니다 (1-31)' };
        }
      }
      return { isValid: true }; // 마스킹된 경우 부분 검증 통과
    }
    return { isValid: false, error: '주민등록번호는 13자리여야 합니다' };
  }

  // 숫자만 포함 확인
  if (!/^\d{13}$/.test(cleaned)) {
    return { isValid: false, error: '주민등록번호는 숫자만 포함해야 합니다' };
  }

  // 월/일 범위 검증
  const month = parseInt(cleaned.substring(2, 4));
  const day = parseInt(cleaned.substring(4, 6));
  if (month < 1 || month > 12) {
    return { isValid: false, error: '월 값이 유효하지 않습니다 (1-12)' };
  }
  if (day < 1 || day > 31) {
    return { isValid: false, error: '일 값이 유효하지 않습니다 (1-31)' };
  }

  // 성별 코드 검증 (1-4: 내국인, 5-8: 외국인)
  const genderDigit = parseInt(cleaned.charAt(6));
  if (genderDigit < 1 || genderDigit > 8) {
    return { isValid: false, error: '성별 코드가 유효하지 않습니다 (1-8)' };
  }

  // 체크섬 검증 (가중치: 2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5)
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned.charAt(i)) * weights[i];
  }
  const checkDigit = (11 - (sum % 11)) % 10;

  if (checkDigit !== parseInt(cleaned.charAt(12))) {
    return { isValid: false, error: '체크섬이 일치하지 않습니다 (OCR 오류 가능성)' };
  }

  return { isValid: true };
}

/**
 * 사업자등록번호 체크섬 검증
 * 한국 사업자등록번호는 10자리이며, 마지막 자릿수가 체크섬
 */
export function validateBusinessNumber(brn: string): { isValid: boolean; error?: string } {
  // 하이픈 및 공백 제거
  const cleaned = brn.replace(/[-\s]/g, '');

  // 길이 확인
  if (cleaned.length !== 10) {
    return { isValid: false, error: '사업자등록번호는 10자리여야 합니다' };
  }

  // 숫자만 포함 확인
  if (!/^\d{10}$/.test(cleaned)) {
    return { isValid: false, error: '사업자등록번호는 숫자만 포함해야 합니다' };
  }

  // 체크섬 검증 (가중치: 1, 3, 7, 1, 3, 7, 1, 3, 5)
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * weights[i];
  }

  // 8번째 자리 * 5 / 10의 정수 부분 추가
  sum += Math.floor((parseInt(cleaned.charAt(8)) * 5) / 10);

  const checkDigit = (10 - (sum % 10)) % 10;

  if (checkDigit !== parseInt(cleaned.charAt(9))) {
    return { isValid: false, error: '체크섬이 일치하지 않습니다 (OCR 오류 가능성)' };
  }

  return { isValid: true };
}

/**
 * OCR 오류 수정을 적용한 주민등록번호 정규화
 */
export function normalizeResidentNumber(rrn: string): string {
  let cleaned = rrn.replace(/[-\s]/g, '');

  // OCR 오류 수정 패턴
  cleaned = cleaned
    .replace(/[oO]/g, '0')   // O → 0
    .replace(/[lI]/g, '1')   // l, I → 1
    .replace(/[zZ]/g, '2')   // Z → 2
    .replace(/[sS](?=\d)/g, '5')  // S before digit → 5
    .replace(/[bB]/g, '6')   // B → 6 (or 8)
    .replace(/[gG]/g, '9');  // G → 9

  // 형식 맞추기
  if (cleaned.length >= 6) {
    return cleaned.length >= 13
      ? `${cleaned.substring(0, 6)}-${cleaned.substring(6, 13)}`
      : cleaned;
  }

  return cleaned;
}

/**
 * OCR 오류 수정을 적용한 사업자등록번호 정규화
 */
export function normalizeBusinessNumber(brn: string): string {
  let cleaned = brn.replace(/[-\s]/g, '');

  // OCR 오류 수정 패턴
  cleaned = cleaned
    .replace(/[oO]/g, '0')
    .replace(/[lI]/g, '1')
    .replace(/[zZ]/g, '2')
    .replace(/[sS](?=\d)/g, '5')
    .replace(/[bB]/g, '6')
    .replace(/[gG]/g, '9');

  // 형식 맞추기 (XXX-XX-XXXXX)
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 5)}-${cleaned.substring(5)}`;
  }

  return cleaned;
}
