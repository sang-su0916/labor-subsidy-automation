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
  const businessName = extractFieldValue(normalizedText, ['상호', '법인명', '회사명', '상 호']);
  if (!businessName) {
    errors.push('상호명을 찾을 수 없습니다');
    confidence -= 15;
  }

  // Extract representative name (대표자)
  const representativeName = extractFieldValue(normalizedText, [
    '대표자',
    '대표자명',
    '성명',
    '대 표 자',
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
    },
    context: {
      rawText: text,
      normalizedText,
      errors,
      confidence: Math.max(0, confidence),
    },
  };
}
