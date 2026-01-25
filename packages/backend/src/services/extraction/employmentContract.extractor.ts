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
  FULL_TIME: ['정규직', '무기계약', '정규', '상용직', '상용'],
  PART_TIME: ['시간제', '파트타임', '단시간', 'part-time', '초단시간'],
  CONTRACT: ['계약직', '기간제', '촉탁', '임시직', '일용'],
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

function calculateAgeFromResidentNumber(
  rrn: string,
  referenceDate: Date = new Date()
): { age: number; birthYear: number } | null {
  const cleaned = rrn.replace(/[-\s]/g, '');
  if (cleaned.length < 7) return null;

  const yearPrefix = cleaned.substring(0, 2);
  const monthDay = cleaned.substring(2, 6);
  const genderDigit = cleaned.charAt(6);

  let century: number;
  switch (genderDigit) {
    case '1':
    case '2':
    case '5':
    case '6':
      century = 1900;
      break;
    case '3':
    case '4':
    case '7':
    case '8':
      century = 2000;
      break;
    case '9':
    case '0':
      century = 1800;
      break;
    default:
      return null;
  }

  const birthYear = century + parseInt(yearPrefix, 10);
  const birthMonth = parseInt(monthDay.substring(0, 2), 10);
  const birthDay = parseInt(monthDay.substring(2, 4), 10);

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  let age = refYear - birthYear;
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age--;
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

function extractWorkHours(text: string): {
  weekly: number;
  daily?: number;
  daysPerWeek?: number;
} {
  let weekly = 40;
  let daily: number | undefined;
  let daysPerWeek: number | undefined;

  const weeklyMatch = text.match(
    /(?:주\s*)?(?:소정\s*)?근로시간[:\s]*(\d+)\s*시간/
  );
  if (weeklyMatch) {
    weekly = parseInt(weeklyMatch[1]);
  }

  const dailyMatch = text.match(
    /(?:1일\s*|일\s*)?(?:소정\s*)?근로시간[:\s]*(\d+)\s*시간/
  );
  if (dailyMatch) {
    daily = parseInt(dailyMatch[1]);
  }

  const daysMatch = text.match(/주\s*(\d+)\s*일\s*(?:근무|근로)/);
  if (daysMatch) {
    daysPerWeek = parseInt(daysMatch[1]);
  }

  if (!weeklyMatch && daily && daysPerWeek) {
    weekly = daily * daysPerWeek;
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
