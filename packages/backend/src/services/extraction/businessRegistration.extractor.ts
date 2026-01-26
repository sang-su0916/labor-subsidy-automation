import { BusinessRegistrationData } from '../../types/document.types';
import {
  extractBusinessNumber,
  extractDate,
  extractFieldValue,
  normalizeKoreanText,
} from '../../utils/korean.utils';

export interface ExtractionContext {
  rawText: string;
  normalizedText: string;
  errors: string[];
  confidence: number;
}

/**
 * 사업자등록증 전용 상호(법인명) 추출
 * "법인명(단체명):주식회사가을식품" 형식 처리
 */
function extractBusinessNameFromRegistration(text: string): string | null {
  // 패턴 1: "법인명(단체명):" 또는 "법인명(단체명) :" 다음의 값
  const pattern1 = text.match(/법인명\s*\(\s*단체명\s*\)\s*[:：]\s*([^\n대표]+)/);
  if (pattern1) {
    const value = cleanBusinessName(pattern1[1]);
    if (value) return value;
  }

  // 패턴 2: "상호(법인명):" 다음의 값
  const pattern2 = text.match(/상호\s*\(\s*법인명\s*\)\s*[:：]\s*([^\n대표]+)/);
  if (pattern2) {
    const value = cleanBusinessName(pattern2[1]);
    if (value) return value;
  }

  // 패턴 3: "상호:" 다음의 값 (개인사업자)
  const pattern3 = text.match(/상\s*호\s*[:：]\s*([^\n대표개업]+)/);
  if (pattern3) {
    const value = cleanBusinessName(pattern3[1]);
    if (value) return value;
  }

  // 패턴 4: "(주)" 또는 "주식회사" 다음의 회사명
  const pattern4 = text.match(/(?:\(주\)|주식회사|㈜)\s*([가-힣a-zA-Z0-9]{2,20})/);
  if (pattern4) {
    return pattern4[1].trim();
  }

  // 패턴 5: "회사명" 또는 "상호"가 아닌 곳에서 "주식회사OOO" 형태 찾기
  const pattern5 = text.match(/주식회사\s*([가-힣]{2,10})/);
  if (pattern5) {
    return '주식회사' + pattern5[1].trim();
  }

  return null;
}

/**
 * 상호명 정제 (컬럼 헤더, 특수문자 제거)
 */
function cleanBusinessName(value: string): string | null {
  if (!value) return null;

  let cleaned = value
    .replace(/[\(\)（）\[\]【】]/g, '') // 괄호 제거
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '') // 숫자 기호 제거
    .replace(/^\s*단체명\s*/, '') // "단체명" 접두사 제거
    .replace(/^\s*법인명\s*/, '') // "법인명" 접두사 제거
    .replace(/\s*(개업|대표|사업장|소재지|종된|개설일).*$/i, '') // 다른 필드 라벨 제거
    .trim();

  // 컬럼 헤더 필터링 (숫자 기호가 포함된 값은 무효)
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(value)) {
    return null;
  }

  // 너무 짧거나 유효하지 않은 값 필터링
  if (cleaned.length < 2) return null;

  // 필드 라벨만 있는 경우 필터링
  const invalidPatterns = /^(상호|법인명|단체명|대표자|사업장|소재지|업태|종목)$/;
  if (invalidPatterns.test(cleaned)) return null;

  return cleaned;
}

/**
 * 사업자등록증 전용 대표자명 추출
 */
function extractRepresentativeFromRegistration(text: string): string | null {
  // 패턴 1: "대표자:" 또는 "대 표 자:" 다음의 이름
  const pattern1 = text.match(/대\s*표\s*자\s*[:：]\s*([가-힣]{2,4})/);
  if (pattern1) {
    return pattern1[1].trim();
  }

  // 패턴 2: "성명(대표자):" 다음의 이름
  const pattern2 = text.match(/성명\s*\(\s*대표자\s*\)\s*[:：]\s*([가-힣]{2,4})/);
  if (pattern2) {
    return pattern2[1].trim();
  }

  // 패턴 3: "대표자(성명):" 다음의 이름
  const pattern3 = text.match(/대표자\s*\(\s*성명\s*\)\s*[:：]\s*([가-힣]{2,4})/);
  if (pattern3) {
    return pattern3[1].trim();
  }

  return null;
}

/**
 * 사업자등록증 전용 사업장 소재지 추출
 */
function extractAddressFromRegistration(text: string): string | null {
  // 패턴 1: "사업장소재지:" 또는 "사업장 소재지:" 다음의 주소
  const pattern1 = text.match(/사업장\s*소재지\s*[:：]\s*([^\n①②③④⑤⑥⑦⑧⑨⑩본점]+)/);
  if (pattern1) {
    const address = cleanAddress(pattern1[1]);
    if (address) return address;
  }

  // 패턴 2: "소재지:" 다음의 주소
  const pattern2 = text.match(/소재지\s*[:：]\s*([^\n①②③④⑤⑥⑦⑧⑨⑩본점]+)/);
  if (pattern2) {
    const address = cleanAddress(pattern2[1]);
    if (address) return address;
  }

  // 패턴 3: 지역명으로 시작하는 주소 찾기
  const pattern3 = text.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n①②③④⑤⑥⑦⑧⑨⑩]{10,60}/);
  if (pattern3) {
    const address = cleanAddress(pattern3[0]);
    if (address) return address;
  }

  return null;
}

/**
 * 주소 정제
 */
function cleanAddress(value: string): string | null {
  if (!value) return null;

  let cleaned = value
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '') // 숫자 기호 제거
    .replace(/\s*(본점|사업의|업태|종목|개업|등록).*$/i, '') // 다른 필드 제거
    .trim();

  // 너무 짧은 값 필터링
  if (cleaned.length < 5) return null;

  // 필드 라벨만 있는 경우 필터링
  if (/^(소재지|사업장|주소)$/.test(cleaned)) return null;

  return cleaned;
}

export function extractBusinessRegistration(text: string): {
  data: BusinessRegistrationData | null;
  context: ExtractionContext;
} {
  const normalizedText = normalizeKoreanText(text);
  const errors: string[] = [];
  let confidence = 100;

  // Extract business number
  const businessNumber = extractBusinessNumber(normalizedText);
  if (!businessNumber) {
    errors.push('사업자등록번호를 찾을 수 없습니다');
    confidence -= 20;
  }

  // Extract business name (상호) - 전용 추출 함수 우선 사용
  let businessName = extractBusinessNameFromRegistration(normalizedText);

  // fallback: 기존 방식
  if (!businessName) {
    businessName = extractFieldValue(normalizedText, [
      '상호(법인명)',
      '상호(상호)',
      '상호',
      '법인명',
      '회사명',
      '상 호',
      '상     호',
    ]);
  }

  if (!businessName) {
    errors.push('상호명을 찾을 수 없습니다');
    confidence -= 15;
  }

  // Extract representative name (대표자) - 전용 추출 함수 우선 사용
  let representativeName = extractRepresentativeFromRegistration(normalizedText);

  // fallback: 기존 방식
  if (!representativeName) {
    representativeName = extractFieldValue(normalizedText, [
      '성명(대표자)',
      '대표자(성명)',
      '대표자',
      '대표자명',
      '성명',
      '대 표 자',
      '대     표     자',
    ]);
  }

  if (!representativeName) {
    errors.push('대표자명을 찾을 수 없습니다');
    confidence -= 15;
  }

  // Extract business address (사업장 소재지) - 전용 추출 함수 우선 사용
  let businessAddress = extractAddressFromRegistration(normalizedText);

  // fallback: 기존 방식
  if (!businessAddress) {
    businessAddress = extractFieldValue(normalizedText, [
      '사업장 소재지',
      '사업장소재지',
      '소재지',
      '주소',
      '사업장',
    ]);
  }

  if (!businessAddress) {
    errors.push('사업장 소재지를 찾을 수 없습니다');
    confidence -= 10;
  }

  // Extract business type (업태) - 선택적 필드
  let businessType = extractFieldValue(normalizedText, ['업태', '업 태', '업  태']);
  // 업태가 없으면 종목과 동일하게 설정하는 경우가 많음
  if (!businessType) {
    // 경미한 경고만 (신뢰도 감소 없음)
    errors.push('업태를 찾을 수 없습니다');
  }

  // Extract business item (종목)
  const businessItem = extractFieldValue(normalizedText, ['종목', '종 목', '업종', '종  목']);
  if (!businessItem) {
    errors.push('종목을 찾을 수 없습니다');
    confidence -= 3;
  }

  // 업태가 없고 종목이 있으면 종목을 업태로 사용
  if (!businessType && businessItem) {
    businessType = businessItem;
  }

  // Extract registration date (개업년월일) - 다양한 패턴 시도
  let registrationDate: string | null = null;
  const dateText = extractFieldValue(normalizedText, [
    '개업년월일',
    '개업일자',
    '개업일',
    '설립일',
    '개 업 년 월 일',
  ]);

  if (dateText) {
    registrationDate = extractDate(dateText);
  }

  // 날짜를 찾지 못했으면 텍스트에서 직접 날짜 패턴 검색
  if (!registrationDate) {
    // "개업" 키워드 근처의 날짜 찾기
    const dateNearOpening = normalizedText.match(/개업[^\d]*(\d{4})[년.\-/]?\s*(\d{1,2})[월.\-/]?\s*(\d{1,2})/);
    if (dateNearOpening) {
      const year = dateNearOpening[1];
      const month = dateNearOpening[2].padStart(2, '0');
      const day = dateNearOpening[3].padStart(2, '0');
      registrationDate = `${year}-${month}-${day}`;
    }
  }

  if (!registrationDate) {
    errors.push('개업년월일을 찾을 수 없습니다');
    confidence -= 5;
  }

  // 업종코드 추출
  const industryCode = extractFieldValue(normalizedText, [
    '업종코드',
    '업종 코드',
    '분류코드',
  ]);

  // 업종명 추출 (종목과 다를 수 있음 - 더 상세한 분류)
  const industryName = extractFieldValue(normalizedText, [
    '업종명',
    '세부업종',
    '사업의 종류',
  ]);

  // 설립일 추출 (법인의 경우)
  let establishmentDate: string | null = null;
  const establishmentText = extractFieldValue(normalizedText, [
    '설립일',
    '법인설립일',
    '법인 설립일',
    '설립년월일',
  ]);
  if (establishmentText) {
    establishmentDate = extractDate(establishmentText);
  }

  // 고용보험 관리번호 추출
  const employmentInsuranceNumber = extractFieldValue(normalizedText, [
    '고용보험관리번호',
    '고용보험 관리번호',
    '관리번호',
    '사업장관리번호',
    '사업장 관리번호',
  ]);

  // 상시근로자수 추출
  let headCount: number | undefined;
  const headCountText = extractFieldValue(normalizedText, [
    '상시근로자',
    '상시 근로자',
    '종업원수',
    '종업원 수',
    '근로자수',
    '직원수',
  ]);
  if (headCountText) {
    const countMatch = headCountText.match(/(\d+)\s*(?:명|인)?/);
    if (countMatch) {
      headCount = parseInt(countMatch[1]);
    }
  }

  // 사업자 유형 판별 (법인/개인)
  let businessCategory: 'INDIVIDUAL' | 'CORPORATION' | 'OTHER' = 'INDIVIDUAL';
  if (/법인|주식회사|\(주\)|㈜|유한회사/.test(normalizedText)) {
    businessCategory = 'CORPORATION';
  } else if (/재단|협회|조합|단체/.test(normalizedText)) {
    businessCategory = 'OTHER';
  }

  // 우선지원대상기업 판별 (간접적 추정)
  let isSmallMediumBusiness: boolean | undefined;
  if (/중소기업|소기업|우선지원/.test(normalizedText)) {
    isSmallMediumBusiness = true;
  } else if (headCount !== undefined) {
    // 업종별 기준이 다르지만, 일반적으로 300인 미만을 중소기업으로 추정
    isSmallMediumBusiness = headCount < 300;
  }

  // If critical fields are missing, return null
  if (!businessNumber && !businessName) {
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
      businessNumber: businessNumber || '',
      businessName: businessName || '',
      representativeName: representativeName || '',
      businessAddress: businessAddress || '',
      businessType: businessType || '',
      businessItem: businessItem || '',
      registrationDate: registrationDate || '',
      industryCode: industryCode || undefined,
      industryName: industryName || undefined,
      establishmentDate: establishmentDate || undefined,
      employmentInsuranceNumber: employmentInsuranceNumber || undefined,
      headCount,
      businessCategory,
      isSmallMediumBusiness,
    },
    context: {
      rawText: text,
      normalizedText,
      errors,
      confidence: Math.max(0, confidence),
    },
  };
}
