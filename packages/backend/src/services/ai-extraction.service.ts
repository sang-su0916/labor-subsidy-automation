import { GoogleGenerativeAI } from '@google/generative-ai';
import { DocumentType } from '../config/constants';
import {
  BusinessRegistrationData,
  WageLedgerData,
  EmploymentContractData,
  EmployeeData,
  InsuranceListData,
} from '../types/document.types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('[AI Extraction] GEMINI_API_KEY 환경변수가 설정되지 않았습니다. AI 추출 기능이 비활성화됩니다.');
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// 모델 선택 (환경변수로 override 가능)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const model = genAI?.getGenerativeModel({
  model: GEMINI_MODEL,
  generationConfig: {
    temperature: 0.1,
    topP: 0.8,
    maxOutputTokens: 4096,
  },
}) ?? null;

// 재시도 설정
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 2000,  // 2초
  maxDelayMs: 30000,     // 30초
  backoffMultiplier: 2,  // 지수 백오프
};

// Rate limit 에러 감지
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('429') ||
      message.includes('resource exhausted')
    );
  }
  return false;
}

// 지연 함수
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 재시도 로직이 포함된 API 호출
async function callWithRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRateLimitError(error)) {
        console.log(
          `[AI Extraction] Rate limit hit for ${context}. ` +
          `Attempt ${attempt}/${RETRY_CONFIG.maxRetries}. ` +
          `Waiting ${delayMs / 1000}s...`
        );

        if (attempt < RETRY_CONFIG.maxRetries) {
          await delay(delayMs);
          delayMs = Math.min(delayMs * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
          continue;
        }
      } else {
        // Rate limit이 아닌 다른 에러는 즉시 throw
        throw error;
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

const EXTRACTION_PROMPTS: Record<DocumentType, string> = {
  [DocumentType.BUSINESS_REGISTRATION]: `당신은 한국 사업자등록증에서 정보를 추출하는 전문가입니다.

다음 OCR 텍스트에서 사업자등록증 정보를 추출해주세요.
OCR 오류가 있을 수 있으니 문맥을 파악해서 올바른 값으로 보정해주세요.
예: "0|상수" → "이상수", "1O1-86" → "101-86"

중요 추출 규칙:
1. 사업자등록번호: "000-00-00000" 형식의 10자리 숫자
2. 상호: 실제 회사/사업체 이름만 추출 (예: "가을식품", "삼성전자")
   - "①②③④⑤⑥" 같은 양식 번호는 무시
   - "종된사업장", "개설일", "대표자", "사업장" 같은 양식 레이블은 무시
3. 대표자: 사람 이름 (2~4글자 한글)
4. 소재지: 실제 주소 (시/도로 시작하는 주소)
   - "사업의종류", "업태", "종목" 같은 레이블은 무시

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "businessNumber": "000-00-00000 형식의 사업자등록번호",
  "businessName": "실제 상호명만 (양식 텍스트 제외)",
  "representativeName": "대표자 성명 (2~4글자)",
  "businessAddress": "실제 주소만 (시/도로 시작)",
  "businessType": "업태 (예: 제조업, 도소매업)",
  "businessItem": "종목 (예: 식품, 전자제품)",
  "registrationDate": "YYYY-MM-DD 형식의 개업년월일"
}

OCR 텍스트:
`,

  [DocumentType.WAGE_LEDGER]: `당신은 한국 급여명세서/임금대장에서 정보를 추출하는 전문가입니다.

다음 텍스트에서 직원별 급여 정보를 추출해주세요.
이 텍스트는 엑셀 또는 PDF에서 추출되었을 수 있습니다.

중요 추출 규칙:
1. 직원 이름: 실제 사람 이름만 추출 (2~4글자 한글)
   - "본사", "생산", "관리", "물류", "영업", "합계", "소계" 등 부서명/합계는 제외
   - "대표", "임원", "계" 등은 제외
2. 주민번호: 000000-0000000 형식 (마스킹 *로 처리된 경우 그대로)
3. 급여: 개인별 급여 금액만 추출 (부서 소계/합계 제외)
4. 입사일: YYYY-MM-DD 또는 YY.MM.DD 형식
5. 급여 기간: 파일명이나 헤더에서 년월 추출 (예: "12월", "2025-12" → "2025-12")

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "period": "YYYY-MM 형식의 급여 기간",
  "employees": [
    {
      "name": "실제 직원 성명 (2~4글자)",
      "residentRegistrationNumber": "000000-0000000 형식 (없으면 빈 문자열)",
      "hireDate": "YYYY-MM-DD 형식의 입사일 (없으면 빈 문자열)",
      "position": "직위/직급 (없으면 빈 문자열)",
      "department": "부서 (없으면 빈 문자열)",
      "monthlyWage": 숫자로 된 월급여 (원 단위),
      "baseSalary": 기본급 (있는 경우),
      "overtimePay": 연장근로수당 (있는 경우),
      "bonus": 상여금 (있는 경우)
    }
  ],
  "totalWage": 총 급여 합계 (숫자)
}

텍스트:
`,

  [DocumentType.EMPLOYMENT_CONTRACT]: `당신은 한국 근로계약서에서 정보를 추출하는 전문가입니다.

다음 텍스트에서 근로계약 정보를 추출해주세요.
OCR 오류가 있을 수 있으니 문맥을 파악해서 올바른 값으로 보정해주세요.

중요 추출 규칙:
1. 근로자명: 실제 사람 이름만 추출 (2~4글자 한글)
   - "(이하 '을'이라 한다)", "은(는)" 등 법률 문구 제외
   - "근로자:", "을:" 뒤에 나오는 이름만
2. 사용자명: 회사/사업체 이름만 추출
   - "(이하 '갑'이라 한다)" 등 법률 문구 제외
   - "사용자:", "갑:" 뒤에 나오는 회사명만
3. 월급여: 숫자만 추출
   - "월 급여", "임금", "급여", "월급" 뒤의 금액
   - "원", ",", "₩" 제거하고 숫자만
   - 시급인 경우: 시급 × 209시간 = 월급
   - 연봉인 경우: 연봉 ÷ 12 = 월급
4. 계약 기간: 시작일, 종료일
5. 근로시간: 주당, 일일 근로시간
6. 근로 형태:
   - FULL_TIME: 주 35시간 이상
   - PART_TIME: 주 35시간 미만
   - CONTRACT: 기간제/계약직 명시
7. 계약 유형:
   - INDEFINITE: 무기계약, 정규직
   - FIXED_TERM: 기간제, 종료일 있음
   - TEMPORARY: 일용직, 단기

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "employeeName": "근로자 이름만 (2~4글자)",
  "employerName": "회사명만 (법률문구 제외)",
  "employerRepresentative": "대표자 이름 (2~4글자)",
  "residentRegistrationNumber": "000000-0000000 형식",
  "contractStartDate": "YYYY-MM-DD 형식",
  "contractEndDate": "YYYY-MM-DD 또는 null",
  "workType": "FULL_TIME/PART_TIME/CONTRACT 중 하나",
  "contractType": "INDEFINITE/FIXED_TERM/TEMPORARY 중 하나",
  "monthlySalary": 월급여 숫자 (예: 2500000),
  "weeklyWorkHours": 주당 근로시간 숫자 (기본 40),
  "dailyWorkHours": 일일 근로시간 숫자 (기본 8),
  "calculatedAge": 만 나이 숫자,
  "isYouth": true/false,
  "isSenior": true/false,
  "jobPosition": "직위 또는 null",
  "department": "부서 또는 null",
  "workAddress": "주소 또는 null"
}

텍스트:
`,

  [DocumentType.INSURANCE_LIST]: `당신은 한국 4대보험 가입자명부에서 정보를 추출하는 전문가입니다.

다음 OCR 텍스트에서 보험 가입자 정보를 추출해주세요.
OCR 오류가 있을 수 있으니 문맥을 파악해서 올바른 값으로 보정해주세요.

4대보험 종류:
- 고용보험 (employmentInsurance)
- 국민연금 (nationalPension)
- 건강보험 (healthInsurance)
- 산재보험 (industrialAccident)

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "employees": [
    {
      "name": "피보험자 성명",
      "insuranceNumber": "보험 관리번호/피보험자번호 (없으면 빈 문자열)",
      "enrollmentDate": "YYYY-MM-DD 형식의 취득일/가입일",
      "employmentInsurance": true/false (고용보험 가입 여부),
      "nationalPension": true/false (국민연금 가입 여부),
      "healthInsurance": true/false (건강보험 가입 여부),
      "industrialAccident": true/false (산재보험 가입 여부),
      "dataSource": "extracted"
    }
  ]
}

참고: 문서에서 특정 보험 가입 여부를 확인할 수 없는 경우 해당 필드를 생략하거나 null로 설정하세요.

OCR 텍스트:
`,
};

export interface AIExtractionResult<T> {
  data: T | null;
  confidence: number;
  errors: string[];
  rawResponse?: string;
}

/**
 * 4단계 JSON 파싱 전략
 * 1. 직접 파싱
 * 2. 코드블록 추출 후 파싱
 * 3. JSON 경계 탐색 후 파싱
 * 4. 오류 복구 후 파싱
 */
function safeJsonParse(text: string): { data: unknown; method: string } | null {
  const strategies = [
    // 1단계: 직접 파싱
    () => {
      const trimmed = text.trim();
      const parsed = JSON.parse(trimmed);
      return { data: parsed, method: 'direct' };
    },
    // 2단계: 코드블록 추출
    () => {
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!codeBlockMatch) throw new Error('No code block found');
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return { data: parsed, method: 'codeblock' };
    },
    // 3단계: JSON 경계 탐색 (객체)
    () => {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
        throw new Error('No JSON object boundaries found');
      }
      const jsonStr = text.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      return { data: parsed, method: 'boundary-object' };
    },
    // 4단계: JSON 경계 탐색 (배열)
    () => {
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket === -1 || lastBracket === -1 || firstBracket >= lastBracket) {
        throw new Error('No JSON array boundaries found');
      }
      const jsonStr = text.substring(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonStr);
      return { data: parsed, method: 'boundary-array' };
    },
    // 5단계: 오류 복구 (일반적인 JSON 오류 수정)
    () => {
      let fixedText = text;

      // 코드블록 제거
      fixedText = fixedText.replace(/```(?:json)?/g, '').replace(/```/g, '');

      // JSON 경계 찾기
      const firstBrace = fixedText.indexOf('{');
      const lastBrace = fixedText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        fixedText = fixedText.substring(firstBrace, lastBrace + 1);
      }

      // 일반적인 오류 수정
      fixedText = fixedText
        // 후행 쉼표 제거 (배열)
        .replace(/,\s*]/g, ']')
        // 후행 쉼표 제거 (객체)
        .replace(/,\s*}/g, '}')
        // 작은따옴표를 큰따옴표로 변환 (값에 있는 것 제외)
        .replace(/'/g, '"')
        // 줄바꿈이 포함된 문자열 수정
        .replace(/\n/g, '\\n')
        // undefined를 null로 변환
        .replace(/:\s*undefined/g, ': null')
        // NaN을 null로 변환
        .replace(/:\s*NaN/g, ': null')
        // Infinity를 null로 변환
        .replace(/:\s*Infinity/g, ': null')
        .replace(/:\s*-Infinity/g, ': null');

      const parsed = JSON.parse(fixedText);
      return { data: parsed, method: 'error-recovery' };
    },
    // 6단계: 줄 단위 복구 시도
    () => {
      const lines = text.split('\n');
      let jsonStr = '';
      let braceCount = 0;
      let inJson = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (!inJson && trimmedLine.startsWith('{')) {
          inJson = true;
        }

        if (inJson) {
          jsonStr += line + '\n';
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;

          if (braceCount === 0 && jsonStr.trim()) {
            break;
          }
        }
      }

      if (!jsonStr.trim()) throw new Error('No JSON found in lines');
      const parsed = JSON.parse(jsonStr.trim());
      return { data: parsed, method: 'line-recovery' };
    },
  ];

  for (const strategy of strategies) {
    try {
      return strategy();
    } catch {
      // 다음 전략 시도
      continue;
    }
  }

  return null;
}

function calculateAge(residentNumber: string): { age: number; isYouth: boolean; isSenior: boolean } | null {
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
  const age = currentYear - birthYear;

  return {
    age,
    isYouth: age >= 15 && age <= 34,
    isSenior: age >= 60,
  };
}

function enrichEmployeeData(employee: EmployeeData): EmployeeData {
  const enriched = { ...employee };

  if (employee.residentRegistrationNumber) {
    const ageInfo = calculateAge(employee.residentRegistrationNumber);
    if (ageInfo) {
      enriched.calculatedAge = ageInfo.age;
      enriched.isYouth = ageInfo.isYouth;
      enriched.isSenior = ageInfo.isSenior;
    }
  }

  return enriched;
}

export async function extractWithAI<T>(
  ocrText: string,
  documentType: DocumentType
): Promise<AIExtractionResult<T>> {
  const errors: string[] = [];

  // API 키가 설정되지 않은 경우
  if (!model) {
    return {
      data: null,
      confidence: 0,
      errors: ['GEMINI_API_KEY 환경변수가 설정되지 않았습니다. AI 추출을 사용할 수 없습니다.'],
    };
  }

  if (!ocrText || ocrText.trim().length < 10) {
    return {
      data: null,
      confidence: 0,
      errors: ['OCR 텍스트가 너무 짧습니다'],
    };
  }

  const prompt = EXTRACTION_PROMPTS[documentType];
  if (!prompt) {
    return {
      data: null,
      confidence: 0,
      errors: [`지원하지 않는 문서 유형: ${documentType}`],
    };
  }

  try {
    console.log(`[AI Extraction] Starting ${documentType} extraction...`);

    // 재시도 로직이 포함된 API 호출
    const text = await callWithRetry(async () => {
      const result = await model.generateContent(prompt + ocrText);
      return result.response.text();
    }, documentType);

    console.log(`[AI Extraction] Raw response:`, text.substring(0, 500));

    // 안전한 JSON 파싱 (4단계 전략)
    const parseResult = safeJsonParse(text);
    if (!parseResult) {
      errors.push('AI 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해주세요.');
      console.error('[AI Extraction] All JSON parsing strategies failed');
      return {
        data: null,
        confidence: 0,
        errors,
        rawResponse: text,
      };
    }

    console.log(`[AI Extraction] JSON parsed using method: ${parseResult.method}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parseResult.data as any;

    // 직원 데이터 보강 (나이 계산 등)
    if (documentType === DocumentType.WAGE_LEDGER && parsed.employees) {
      parsed.employees = parsed.employees.map(enrichEmployeeData);
    }

    // 신뢰도 계산 (더 세밀한 기준)
    let confidence = 95;
    if (documentType === DocumentType.BUSINESS_REGISTRATION) {
      if (!parsed.businessNumber) confidence -= 25;
      if (!parsed.businessName) confidence -= 20;
      if (!parsed.representativeName) confidence -= 15;
      if (!parsed.businessAddress) confidence -= 10;
      if (!parsed.registrationDate) confidence -= 5;
    } else if (documentType === DocumentType.WAGE_LEDGER) {
      if (!parsed.employees || parsed.employees.length === 0) {
        confidence -= 40;
      } else {
        // 직원 데이터 품질 검사
        let validEmployees = 0;
        for (const emp of parsed.employees) {
          let empScore = 0;
          if (emp.name && emp.name.trim().length >= 2) empScore += 3;
          if (emp.monthlyWage && emp.monthlyWage > 0) empScore += 3;
          if (emp.residentRegistrationNumber) empScore += 2;
          if (emp.hireDate) empScore += 1;
          if (empScore >= 6) validEmployees++;
        }
        const validRatio = validEmployees / parsed.employees.length;
        if (validRatio < 0.5) confidence -= 20;
        else if (validRatio < 0.8) confidence -= 10;
        else if (validRatio < 1.0) confidence -= 5;
      }
      if (!parsed.period) confidence -= 5;
    } else if (documentType === DocumentType.EMPLOYMENT_CONTRACT) {
      // 필수 필드 검사
      if (!parsed.employeeName) confidence -= 20;
      if (!parsed.employerName) confidence -= 10;
      if (!parsed.monthlySalary || parsed.monthlySalary <= 0) confidence -= 15;
      if (!parsed.contractStartDate) confidence -= 10;
      // 선택 필드 보너스
      if (parsed.weeklyWorkHours && parsed.weeklyWorkHours > 0) confidence += 2;
      if (parsed.workType) confidence += 2;
      if (parsed.contractType) confidence += 2;
      if (parsed.residentRegistrationNumber) confidence += 3;
      // 최대 100으로 제한
      confidence = Math.min(100, confidence);
    } else if (documentType === DocumentType.INSURANCE_LIST) {
      if (!parsed.employees || parsed.employees.length === 0) confidence -= 40;
      if (!parsed.companyName) confidence -= 15;
    }

    console.log(`[AI Extraction] Success! Confidence: ${confidence}%`);

    return {
      data: parsed as T,
      confidence: Math.max(0, confidence),
      errors,
      rawResponse: text,
    };
  } catch (error) {
    console.error('[AI Extraction] Error:', error);

    if (error instanceof SyntaxError) {
      errors.push('AI 응답을 JSON으로 파싱할 수 없습니다');
    } else if (error instanceof Error) {
      errors.push(`AI 추출 실패: ${error.message}`);
    }

    return {
      data: null,
      confidence: 0,
      errors,
    };
  }
}

export async function extractBusinessRegistrationWithAI(
  ocrText: string
): Promise<AIExtractionResult<BusinessRegistrationData>> {
  return extractWithAI<BusinessRegistrationData>(ocrText, DocumentType.BUSINESS_REGISTRATION);
}

export async function extractWageLedgerWithAI(
  ocrText: string
): Promise<AIExtractionResult<WageLedgerData>> {
  return extractWithAI<WageLedgerData>(ocrText, DocumentType.WAGE_LEDGER);
}

export async function extractEmploymentContractWithAI(
  ocrText: string
): Promise<AIExtractionResult<EmploymentContractData>> {
  return extractWithAI<EmploymentContractData>(ocrText, DocumentType.EMPLOYMENT_CONTRACT);
}

export async function extractInsuranceListWithAI(
  ocrText: string
): Promise<AIExtractionResult<InsuranceListData>> {
  return extractWithAI<InsuranceListData>(ocrText, DocumentType.INSURANCE_LIST);
}
