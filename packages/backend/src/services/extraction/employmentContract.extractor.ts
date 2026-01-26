import { EmploymentContractData } from '../../types/document.types';
import { ExtractionContext } from './businessRegistration.extractor';
import {
  extractKoreanName,
  extractDate,
  extractMoneyAmount,
  extractFieldValue,
  normalizeKoreanText,
} from '../../utils/korean.utils';

const WORK_TYPE_PATTERNS = {
  FULL_TIME: ['정규직', '무기계약', '정규', '상용직', '상용', '정규근로자', '상시근로자'],
  PART_TIME: ['시간제', '파트타임', '단시간', 'part-time', '초단시간', '아르바이트', '시급제'],
  CONTRACT: ['계약직', '기간제', '촉탁', '임시직', '일용', '단기계약', '한시직'],
};

const CONTRACT_TYPE_PATTERNS = {
  INDEFINITE: ['무기한', '정년까지', '퇴직시', '무기계약'],
  FIXED_TERM: ['기간제', '계약기간', '~까지'],
  TEMPORARY: ['일용', '임시', '단기'],
};

function extractResidentNumber(text: string): string | undefined {
  const patterns = [
    /주민등록번호[:\s]*(\d{6}[-\s]?\d{7})/,
    /주민번호[:\s]*(\d{6}[-\s]?\d{7})/,
    /생년월일[:\s]*(\d{6}[-\s]?\d{7})/,
    /(\d{6})[-\s]?(\d{7})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        return `${match[1]}-${match[2]}`;
      }
      return match[1].replace(/\s/g, '').replace(/(\d{6})(\d{7})/, '$1-$2');
    }
  }
  return undefined;
}

/**
 * OCR 오류를 수정한 주민등록번호에서 나이 계산
 * - OCR 오류 패턴 (O→0, l→1 등) 수정
 * - 0-120세 범위 검증
 * - 1800년대 (9, 0 코드)는 현대에서 불가능하므로 null 반환
 */
function calculateAgeFromResidentNumber(
  rrn: string,
  referenceDate: Date = new Date()
): { age: number; birthYear: number } | null {
  // OCR 오류 수정
  let cleaned = rrn.replace(/[-\s]/g, '');
  cleaned = cleaned
    .replace(/[oO]/g, '0')   // O → 0
    .replace(/[lI]/g, '1')   // l, I → 1
    .replace(/[zZ]/g, '2')   // Z → 2
    .replace(/[sS](?=\d)/g, '5')  // S before digit → 5
    .replace(/[bB]/g, '6')   // B → 6
    .replace(/[gG]/g, '9');  // G → 9

  if (cleaned.length < 7) return null;

  const yearPrefix = cleaned.substring(0, 2);
  const monthDay = cleaned.substring(2, 6);
  const genderDigit = cleaned.charAt(6);

  // 성별 코드 검증 (숫자가 아닌 경우 null)
  if (!/[0-9]/.test(genderDigit)) return null;

  let century: number;
  switch (genderDigit) {
    case '1':
    case '2':
    case '5':  // 외국인 남성 (1900년대)
    case '6':  // 외국인 여성 (1900년대)
      century = 1900;
      break;
    case '3':
    case '4':
    case '7':  // 외국인 남성 (2000년대)
    case '8':  // 외국인 여성 (2000년대)
      century = 2000;
      break;
    case '9':
    case '0':
      // 1800년대 출생자는 현대에 존재할 수 없음 (OCR 오류일 가능성 높음)
      // 안전하게 null 반환
      console.warn(`[AgeCalculation] Suspicious gender digit '${genderDigit}' (implies 1800s birth). Returning null.`);
      return null;
    default:
      return null;
  }

  const yearDigit = parseInt(yearPrefix, 10);
  if (isNaN(yearDigit)) return null;

  const birthYear = century + yearDigit;
  const birthMonth = parseInt(monthDay.substring(0, 2), 10);
  const birthDay = parseInt(monthDay.substring(2, 4), 10);

  // 월/일 범위 검증
  if (birthMonth < 1 || birthMonth > 12) {
    console.warn(`[AgeCalculation] Invalid birth month: ${birthMonth}`);
    return null;
  }
  if (birthDay < 1 || birthDay > 31) {
    console.warn(`[AgeCalculation] Invalid birth day: ${birthDay}`);
    return null;
  }

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  let age = refYear - birthYear;
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age--;
  }

  // 나이 범위 검증 (0-120세)
  if (age < 0 || age > 120) {
    console.warn(`[AgeCalculation] Age out of valid range (0-120): ${age}`);
    return null;
  }

  // 근로 가능 연령 확인 (15세 미만 경고만)
  if (age < 15) {
    console.warn(`[AgeCalculation] Age below working age (15): ${age}`);
  }

  return { age, birthYear };
}

function extractBirthDateFromText(text: string): string | undefined {
  const patterns = [
    /생년월일[:\s]*(\d{4})[.\-/년](\d{1,2})[.\-/월](\d{1,2})/,
    /생년월일[:\s]*(\d{2})[.\-/년](\d{1,2})[.\-/월](\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const year = match[1].length === 2 ? `19${match[1]}` : match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return undefined;
}

function detectWorkType(text: string): 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' {
  const normalizedText = text.toLowerCase();

  for (const [type, patterns] of Object.entries(WORK_TYPE_PATTERNS)) {
    if (patterns.some((p) => normalizedText.includes(p))) {
      return type as 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
    }
  }

  const hoursMatch = text.match(/주\s*(\d+)\s*시간/);
  if (hoursMatch && parseInt(hoursMatch[1]) < 35) {
    return 'PART_TIME';
  }

  const endDateMatch = text.match(
    /계약\s*(?:기간|종료)[^~\d]*(?:~|부터)?\s*(\d{4}|\d{2})[.\-/년](\d{1,2})/
  );
  if (endDateMatch) {
    return 'CONTRACT';
  }

  return 'FULL_TIME';
}

function detectContractType(
  text: string
): 'INDEFINITE' | 'FIXED_TERM' | 'TEMPORARY' {
  for (const [type, patterns] of Object.entries(CONTRACT_TYPE_PATTERNS)) {
    if (patterns.some((p) => text.includes(p))) {
      return type as 'INDEFINITE' | 'FIXED_TERM' | 'TEMPORARY';
    }
  }
  return 'INDEFINITE';
}

function extractProbationPeriod(text: string): {
  isProbation: boolean;
  months?: number;
} {
  const probationPatterns = [
    /수습\s*(?:기간)?[:\s]*(\d+)\s*(?:개월|월)/,
    /수습\s*(?:기간)?[:\s]*(\d+)\s*(?:일)/,
    /시용\s*(?:기간)?[:\s]*(\d+)\s*(?:개월|월)/,
    /수습\s*(\d+)\s*(?:개월|월)/,
  ];

  for (const pattern of probationPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      if (pattern.source.includes('일')) {
        return { isProbation: true, months: Math.ceil(value / 30) };
      }
      return { isProbation: true, months: value };
    }
  }

  if (text.includes('수습') || text.includes('시용')) {
    return { isProbation: true, months: 3 };
  }

  return { isProbation: false };
}

/**
 * 근로/근무 시간 추출 (확장된 패턴)
 */
function extractWorkHours(text: string): {
  weekly: number;
  daily?: number;
  daysPerWeek?: number;
} {
  let weekly = 40; // 기본값
  let daily: number | undefined;
  let daysPerWeek: number | undefined;

  // 주당 근로/근무 시간 패턴들 (우선순위 순)
  const weeklyPatterns = [
    // "주 40시간", "주소정근로시간 40시간"
    /주\s*(?:\d+\s*)?(?:소정\s*)?(?:근로|근무)시간[:\s]*(\d+)\s*시간/,
    // "소정근로시간: 주 40시간"
    /(?:소정\s*)?(?:근로|근무)시간[:\s]*주?\s*(\d+)\s*시간/,
    // "1주 40시간", "1주간 40시간"
    /1주\s*(?:간)?\s*(\d+)\s*시간/,
    // "주당 40시간"
    /주당\s*(\d+)\s*시간/,
    // "week 40 hours" (영문)
    /week[:\s]*(\d+)\s*(?:hours?|시간)/i,
    // "주 소정 근무시간: 40시간"
    /주\s*소정\s*(?:근로|근무)\s*시간[:\s]*(\d+)/,
    // "근로시간 주 40시간"
    /(?:근로|근무)시간[:\s]*주\s*(\d+)/,
    // 시간제 "주 15시간 근무"
    /주\s*(\d+)\s*시간\s*(?:근무|근로)/,
  ];

  for (const pattern of weeklyPatterns) {
    const match = text.match(pattern);
    if (match) {
      const hours = parseInt(match[1]);
      // 유효 범위 검증 (1-52시간)
      if (hours >= 1 && hours <= 52) {
        weekly = hours;
        break;
      }
    }
  }

  // 일일 근로/근무 시간 패턴들
  const dailyPatterns = [
    // "1일 8시간", "일 8시간"
    /(?:1일\s*|일\s*)(?:소정\s*)?(?:근로|근무)시간[:\s]*(\d+)\s*시간/,
    // "하루 8시간"
    /하루\s*(\d+)\s*시간/,
    // "일일 근무시간 8시간"
    /일일\s*(?:근로|근무)시간[:\s]*(\d+)/,
    // "daily 8 hours"
    /daily[:\s]*(\d+)\s*(?:hours?|시간)/i,
    // "08:00 ~ 17:00" (9시간, 점심 1시간 제외 = 8시간)
    /(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/,
  ];

  for (const pattern of dailyPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match.length === 5) {
        // 시간 범위 패턴 (08:00 ~ 17:00)
        const startHour = parseInt(match[1]);
        const endHour = parseInt(match[3]);
        let hours = endHour - startHour;
        // 점심시간 1시간 제외 (6시간 이상 근무 시)
        if (hours > 6) hours -= 1;
        if (hours >= 1 && hours <= 12) {
          daily = hours;
          break;
        }
      } else {
        const hours = parseInt(match[1]);
        if (hours >= 1 && hours <= 12) {
          daily = hours;
          break;
        }
      }
    }
  }

  // 주 근무일수 패턴들
  const daysPatterns = [
    /주\s*(\d+)\s*일\s*(?:근무|근로|출근)/,
    /(\d+)\s*일\s*근무제/,
    /주\s*(\d+)일제/,
  ];

  for (const pattern of daysPatterns) {
    const match = text.match(pattern);
    if (match) {
      const days = parseInt(match[1]);
      if (days >= 1 && days <= 7) {
        daysPerWeek = days;
        break;
      }
    }
  }

  // 주당 시간을 찾지 못했고 일일 시간과 주 근무일이 있으면 계산
  if (weekly === 40 && daily && daysPerWeek) {
    const calculated = daily * daysPerWeek;
    if (calculated >= 1 && calculated <= 52) {
      weekly = calculated;
    }
  }

  return { weekly, daily, daysPerWeek };
}

function extractInsuranceInfo(text: string): {
  employmentInsurance?: boolean;
  nationalPension?: boolean;
  healthInsurance?: boolean;
  industrialAccident?: boolean;
} {
  const result: {
    employmentInsurance?: boolean;
    nationalPension?: boolean;
    healthInsurance?: boolean;
    industrialAccident?: boolean;
  } = {};

  const insuranceSection = text.match(
    /(?:4대\s*보험|사회\s*보험|보험\s*가입)[^.]*?\./i
  );
  const sectionText = insuranceSection ? insuranceSection[0] : text;

  if (/고용\s*보험/.test(sectionText)) {
    result.employmentInsurance = !/미가입|제외|적용\s*제외/.test(sectionText);
  }
  if (/국민\s*연금/.test(sectionText)) {
    result.nationalPension = !/미가입|제외|적용\s*제외/.test(sectionText);
  }
  if (/건강\s*보험/.test(sectionText)) {
    result.healthInsurance = !/미가입|제외|적용\s*제외/.test(sectionText);
  }
  if (/산재\s*보험|산업\s*재해/.test(sectionText)) {
    result.industrialAccident = !/미가입|제외|적용\s*제외/.test(sectionText);
  }

  if (/4대\s*보험\s*(?:가입|적용)/.test(text)) {
    return {
      employmentInsurance: true,
      nationalPension: true,
      healthInsurance: true,
      industrialAccident: true,
    };
  }

  return result;
}

export function extractEmploymentContract(text: string): {
  data: EmploymentContractData | null;
  context: ExtractionContext;
} {
  const normalizedText = normalizeKoreanText(text);
  const errors: string[] = [];
  let confidence = 100;

  const employeeName =
    extractFieldValue(normalizedText, [
      '근로자',
      '피용자',
      '을',
      '성명',
      '근로자 성명',
    ]) || extractKoreanName(normalizedText);

  if (!employeeName) {
    errors.push('근로자명을 찾을 수 없습니다');
    confidence -= 20;
  }

  const employerName = extractFieldValue(normalizedText, [
    '사용자',
    '사업주',
    '갑',
    '회사명',
    '상호',
  ]);

  if (!employerName) {
    errors.push('사용자명을 찾을 수 없습니다');
    confidence -= 15;
  }

  const residentRegistrationNumber = extractResidentNumber(normalizedText);
  let calculatedAge: number | undefined;
  let birthYear: number | undefined;
  let isYouth: boolean | undefined;
  let isSenior: boolean | undefined;
  let birthDate: string | undefined;

  if (residentRegistrationNumber) {
    const ageInfo = calculateAgeFromResidentNumber(residentRegistrationNumber);
    if (ageInfo) {
      calculatedAge = ageInfo.age;
      birthYear = ageInfo.birthYear;
      isYouth = calculatedAge >= 15 && calculatedAge <= 34;
      isSenior = calculatedAge >= 60;
    }
  } else {
    birthDate = extractBirthDateFromText(normalizedText);
    if (birthDate) {
      const birthDateObj = new Date(birthDate);
      const now = new Date();
      birthYear = birthDateObj.getFullYear();
      calculatedAge =
        now.getFullYear() -
        birthYear -
        (now <
        new Date(now.getFullYear(), birthDateObj.getMonth(), birthDateObj.getDate())
          ? 1
          : 0);
      isYouth = calculatedAge >= 15 && calculatedAge <= 34;
      isSenior = calculatedAge >= 60;
    }
  }

  const contractStartText = extractFieldValue(normalizedText, [
    '계약기간',
    '근로계약기간',
    '근무개시일',
    '입사일',
  ]);

  let contractStartDate = '';
  let contractEndDate: string | undefined;

  if (contractStartText) {
    const dateRangeMatch = contractStartText.match(/(.+?)[\s~\-～]+(.+)/);
    if (dateRangeMatch) {
      contractStartDate = extractDate(dateRangeMatch[1]) || '';
      contractEndDate = extractDate(dateRangeMatch[2]) || undefined;
    } else {
      contractStartDate = extractDate(contractStartText) || '';
    }
  }

  if (!contractStartDate) {
    const fallbackDate = extractDate(normalizedText);
    if (fallbackDate) {
      contractStartDate = fallbackDate;
    } else {
      errors.push('계약 시작일을 찾을 수 없습니다');
      confidence -= 15;
    }
  }

  const workType = detectWorkType(normalizedText);
  const contractType = detectContractType(normalizedText);

  const salaryText = extractFieldValue(normalizedText, [
    '월급',
    '월 급여',
    '임금',
    '급여',
    '월 통상임금',
    '기본급',
  ]);
  const monthlySalary = salaryText ? extractMoneyAmount(salaryText) : null;

  if (!monthlySalary) {
    errors.push('월 급여를 찾을 수 없습니다');
    confidence -= 20;
  }

  const workHours = extractWorkHours(normalizedText);

  const probation = extractProbationPeriod(normalizedText);

  const jobPosition = extractFieldValue(normalizedText, [
    '직위',
    '직책',
    '담당업무',
    '업무내용',
  ]);

  const department = extractFieldValue(normalizedText, [
    '부서',
    '소속',
    '근무부서',
  ]);

  const workplaceAddress = extractFieldValue(normalizedText, [
    '근무장소',
    '근무지',
    '사업장 소재지',
  ]);

  const socialInsuranceEnrollment = extractInsuranceInfo(normalizedText);

  const overtimeAllowed = /연장\s*근로|시간외\s*근무|초과\s*근무/.test(
    normalizedText
  );

  const isRenewal = /갱신|재계약|연장\s*계약/.test(normalizedText);

  if (!employeeName && !employerName) {
    return {
      data: null,
      context: {
        rawText: text,
        normalizedText,
        errors,
        confidence: 0,
      },
    };
  }

  return {
    data: {
      employeeName: employeeName || '',
      employerName: employerName || '',
      contractStartDate,
      contractEndDate,
      workType,
      monthlySalary: monthlySalary || 0,
      weeklyWorkHours: workHours.weekly,
      residentRegistrationNumber,
      birthDate,
      calculatedAge,
      isYouth,
      isSenior,
      probationPeriodMonths: probation.months,
      isProbation: probation.isProbation,
      jobPosition: jobPosition || undefined,
      department: department || undefined,
      workplaceAddress: workplaceAddress || undefined,
      dailyWorkHours: workHours.daily,
      workDaysPerWeek: workHours.daysPerWeek,
      overtimeAllowed,
      socialInsuranceEnrollment:
        Object.keys(socialInsuranceEnrollment).length > 0
          ? socialInsuranceEnrollment
          : undefined,
      contractType,
      isRenewal,
    },
    context: {
      rawText: text,
      normalizedText,
      errors,
      confidence: Math.max(0, confidence),
    },
  };
}

export function getContractStatistics(contract: EmploymentContractData): {
  isEligibleForYouthSubsidy: boolean;
  isEligibleForSeniorSubsidy: boolean;
  isFullTimeEquivalent: boolean;
  hasValidInsuranceEnrollment: boolean;
  contractDurationMonths?: number;
} {
  const isEligibleForYouthSubsidy =
    contract.isYouth === true &&
    contract.workType === 'FULL_TIME' &&
    (contract.contractType === 'INDEFINITE' || !contract.contractEndDate);

  const isEligibleForSeniorSubsidy =
    contract.isSenior === true && contract.weeklyWorkHours >= 15;

  const isFullTimeEquivalent = contract.weeklyWorkHours >= 35;

  const hasValidInsuranceEnrollment =
    contract.socialInsuranceEnrollment?.employmentInsurance === true;

  let contractDurationMonths: number | undefined;
  if (contract.contractStartDate && contract.contractEndDate) {
    const start = new Date(contract.contractStartDate);
    const end = new Date(contract.contractEndDate);
    contractDurationMonths =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
  }

  return {
    isEligibleForYouthSubsidy,
    isEligibleForSeniorSubsidy,
    isFullTimeEquivalent,
    hasValidInsuranceEnrollment,
    contractDurationMonths,
  };
}
