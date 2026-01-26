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

  // Extract business name (상호)
  const businessName = extractFieldValue(normalizedText, [
    '상호(법인명)',
    '상호(상호)',
    '상호',
    '법인명',
    '회사명',
    '상 호',
    '상     호',
  ]);
  if (!businessName) {
    errors.push('상호명을 찾을 수 없습니다');
    confidence -= 15;
  }

  // Extract representative name (대표자)
  const representativeName = extractFieldValue(normalizedText, [
    '성명(대표자)',
    '대표자(성명)',
    '대표자',
    '대표자명',
    '성명',
    '대 표 자',
    '대     표     자',
  ]);
  if (!representativeName) {
    errors.push('대표자명을 찾을 수 없습니다');
    confidence -= 15;
  }

  // Extract business address (사업장 소재지)
  const businessAddress = extractFieldValue(normalizedText, [
    '사업장 소재지',
    '사업장소재지',
    '소재지',
    '주소',
    '사업장',
  ]);
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
