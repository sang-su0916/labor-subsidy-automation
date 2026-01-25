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

  // Extract business type (업태)
  const businessType = extractFieldValue(normalizedText, ['업태', '업 태']);
  if (!businessType) {
    errors.push('업태를 찾을 수 없습니다');
    confidence -= 5;
  }

  // Extract business item (종목)
  const businessItem = extractFieldValue(normalizedText, ['종목', '종 목', '업종']);
  if (!businessItem) {
    errors.push('종목을 찾을 수 없습니다');
    confidence -= 5;
  }

  // Extract registration date (개업년월일)
  const dateText = extractFieldValue(normalizedText, [
    '개업년월일',
    '개업일자',
    '개업일',
    '설립일',
  ]);
  const registrationDate = dateText ? extractDate(dateText) : null;
  if (!registrationDate) {
    errors.push('개업년월일을 찾을 수 없습니다');
    confidence -= 10;
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
