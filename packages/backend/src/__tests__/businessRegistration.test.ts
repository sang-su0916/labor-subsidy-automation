import { extractBusinessRegistration } from '../services/extraction/businessRegistration.extractor';
import { detectRegionType } from '../utils/korean.utils';
import { MOCK_BUSINESS_REGISTRATION } from './fixtures/mockDocuments';

describe('Business Registration Extractor', () => {
  describe('extractBusinessRegistration', () => {
    it('should extract all fields from standard format', () => {
      const result = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);

      expect(result.data).not.toBeNull();
      expect(result.data!.businessNumber).toBe('123-45-67890');
      expect(result.data!.businessName).toBeTruthy();
      expect(result.data!.representativeName).toBe('김대표');
      expect(result.data!.businessAddress).toContain('서울');
      expect(result.data!.businessType).toBeTruthy();
      expect(result.data!.businessItem).toBeTruthy();
      expect(result.data!.registrationDate).toBe('2020-03-15');
      expect(result.context.confidence).toBeGreaterThan(80);
    });

    it('should extract from alternative format', () => {
      const result = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.ALTERNATIVE_FORMAT);

      expect(result.data).not.toBeNull();
      expect(result.data!.businessNumber).toBe('987-65-43210');
      expect(result.data!.businessName).toContain('행복제조');
      expect(result.data!.representativeName).toBe('이사장');
      expect(result.data!.businessAddress).toContain('경기도');
    });

    it('should handle minimal format with degraded confidence', () => {
      const result = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.MINIMAL);

      expect(result.data).not.toBeNull();
      expect(result.data!.businessNumber).toBe('111-22-33333');
      expect(result.data!.businessName).toContain('미니멀');
      expect(result.context.confidence).toBeLessThan(100);
    });

    it('should return null for completely invalid input', () => {
      const result = extractBusinessRegistration('무관한 텍스트입니다');

      expect(result.data).toBeNull();
      expect(result.context.confidence).toBe(0);
      expect(result.context.errors.length).toBeGreaterThan(0);
    });

    it('should handle OCR noise gracefully', () => {
      const noisyText = `
사업자등록증
등록번호: 123-45-67890
상 호: (주)테스트회사
대표자  : 박   대표
      `;

      const result = extractBusinessRegistration(noisyText);

      expect(result.data).not.toBeNull();
      expect(result.data!.businessNumber).toBe('123-45-67890');
    });
  });

  describe('Region Type Detection', () => {
    it('should detect capital region for Seoul', () => {
      const result = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.STANDARD);
      const regionType = detectRegionType(result.data!.businessAddress);

      expect(regionType).toBe('CAPITAL');
    });

    it('should detect capital region for Gyeonggi', () => {
      const result = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.ALTERNATIVE_FORMAT);
      const regionType = detectRegionType(result.data!.businessAddress);

      expect(regionType).toBe('CAPITAL');
    });

    it('should detect non-capital region for Busan', () => {
      const result = extractBusinessRegistration(MOCK_BUSINESS_REGISTRATION.MINIMAL);
      const regionType = detectRegionType(result.data!.businessAddress);

      expect(regionType).toBe('NON_CAPITAL');
    });

    it('should default to CAPITAL for undefined address', () => {
      const regionType = detectRegionType(undefined);

      expect(regionType).toBe('CAPITAL');
    });

    it('should detect Incheon as capital region', () => {
      const regionType = detectRegionType('인천광역시 남동구 논현동');

      expect(regionType).toBe('CAPITAL');
    });
  });
});
