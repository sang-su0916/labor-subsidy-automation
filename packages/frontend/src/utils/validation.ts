/**
 * 한국 사업자등록번호 검증
 * 형식: XXX-XX-XXXXX (10자리 숫자)
 * 체크섬 알고리즘 적용
 */
export function validateBusinessNumber(value: string): { valid: boolean; error?: string } {
  const cleaned = value.replace(/[^0-9]/g, '');
  
  if (cleaned.length !== 10) {
    return { valid: false, error: '사업자등록번호는 10자리 숫자입니다' };
  }

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const digits = cleaned.split('').map(Number);
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * weights[i];
  }
  sum += Math.floor((digits[8] * 5) / 10);
  
  const checkDigit = (10 - (sum % 10)) % 10;
  
  if (checkDigit !== digits[9]) {
    return { valid: false, error: '유효하지 않은 사업자등록번호입니다' };
  }

  return { valid: true };
}

/**
 * 사업자등록번호 포맷팅 (XXX-XX-XXXXX)
 */
export function formatBusinessNumber(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 5) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5, 10)}`;
}

/**
 * 한국 주민등록번호 검증
 * 형식: YYMMDD-GXXXXXX (13자리)
 * G: 성별 (1,2: 1900년대, 3,4: 2000년대, 5,6: 외국인 1900년대, 7,8: 외국인 2000년대)
 */
export function validateResidentNumber(value: string): { valid: boolean; error?: string } {
  const cleaned = value.replace(/[^0-9]/g, '');
  
  if (cleaned.length !== 13) {
    return { valid: false, error: '주민등록번호는 13자리 숫자입니다' };
  }

  const month = parseInt(cleaned.substring(2, 4), 10);
  const day = parseInt(cleaned.substring(4, 6), 10);
  const genderDigit = parseInt(cleaned.substring(6, 7), 10);

  if (month < 1 || month > 12) {
    return { valid: false, error: '유효하지 않은 월입니다' };
  }

  if (day < 1 || day > 31) {
    return { valid: false, error: '유효하지 않은 일입니다' };
  }

  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 0].includes(genderDigit)) {
    return { valid: false, error: '유효하지 않은 성별 코드입니다' };
  }

  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const digits = cleaned.split('').map(Number);
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * weights[i];
  }
  
  const checkDigit = (11 - (sum % 11)) % 10;
  
  if (checkDigit !== digits[12]) {
    return { valid: false, error: '유효하지 않은 주민등록번호입니다' };
  }

  return { valid: true };
}

/**
 * 주민등록번호 마스킹 (XXXXXX-X******)
 */
export function maskResidentNumber(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) return value;
  return `${cleaned.slice(0, 6)}-${cleaned.slice(6, 7)}******`;
}

/**
 * 주민등록번호 포맷팅 (XXXXXX-XXXXXXX)
 */
export function formatResidentNumber(value: string): string {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned.length <= 6) return cleaned;
  return `${cleaned.slice(0, 6)}-${cleaned.slice(6, 13)}`;
}

/**
 * 주민등록번호에서 생년월일 추출 (YYYY-MM-DD 형식)
 */
export function extractBirthDateFromResidentNumber(residentNumber: string): string | null {
  const cleaned = residentNumber.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) return null;

  const yearPart = cleaned.substring(0, 2);
  const month = cleaned.substring(2, 4);
  const day = cleaned.substring(4, 6);
  const genderDigit = parseInt(cleaned.substring(6, 7), 10);

  let century: string;
  if (genderDigit === 1 || genderDigit === 2 || genderDigit === 5 || genderDigit === 6) {
    century = '19';
  } else if (genderDigit === 3 || genderDigit === 4 || genderDigit === 7 || genderDigit === 8) {
    century = '20';
  } else if (genderDigit === 9 || genderDigit === 0) {
    century = '18';
  } else {
    return null;
  }

  return `${century}${yearPart}-${month}-${day}`;
}
