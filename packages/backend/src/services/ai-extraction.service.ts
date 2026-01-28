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
// gemini-1.5-flash는 deprecated, gemini-2.0-flash 사용
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

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
  [DocumentType.BUSINESS_REGISTRATION]: `당신은 한국 사업자등록증 OCR 전문가입니다.

## 핵심 규칙
사업자등록증 양식에는 "①상호 ②등록번호 ③대표자 ④사업장" 같은 레이블이 있습니다.
이런 레이블이 아닌 **실제 값**만 추출하세요.

## 올바른 추출 예시
- OCR: "상호(법인명) 가을식품 ②등록번호" → businessName: "가을식품"
- OCR: "대표자 박노철 ⑤사업장" → representativeName: "박노철"
- OCR: "654-81-01412" → businessNumber: "654-81-01412"
- OCR: "경기도 김포시 대곶면..." → businessAddress: "경기도 김포시 대곶면..."

## 잘못된 추출 (절대 금지)
- businessName: "③종된사업장 개설일 ④대표자" ❌ (레이블임)
- businessAddress: "⑥사업의종류" ❌ (레이블임)
- businessName: "상호(법인명)" ❌ (레이블임)

## 상호 찾는 방법
1. "상호" 또는 "법인명" 레이블 다음에 나오는 한글 단어
2. 보통 2~10글자 (예: 가을식품, 삼성전자, 현대자동차)
3. 숫자나 기호가 아닌 순수 한글 회사명

반드시 아래 JSON만 응답:
{
  "businessNumber": "000-00-00000",
  "businessName": "실제 회사명 (2~10글자 한글)",
  "representativeName": "대표자명 (2~4글자)",
  "businessAddress": "시/도로 시작하는 실제 주소",
  "businessType": "업태",
  "businessItem": "종목",
  "registrationDate": "YYYY-MM-DD"
}

OCR 텍스트:
`,

  [DocumentType.WAGE_LEDGER]: `당신은 한국 급여대장/임금대장 전문가입니다.

## 핵심 규칙
급여대장에는 부서별 소계와 개인별 급여가 있습니다.
**개인(사람)의 급여만** 추출하고, 부서 소계는 제외하세요.

## 사람 이름 vs 부서명 구분
✅ 사람 이름 (추출 O):
- 김용화, 박노철, 이상수, 김현정, 곽봉준, 서효진 (2~4글자 성+이름)
- 주민번호가 함께 있으면 확실히 사람

❌ 부서명/합계 (추출 X):
- 본사, 생산, 관리, 물류, 영업, 총무, 경리
- 합계, 소계, 계, 총계, 부서계
- 대표이사, 임원, 관리자 (직급만 있는 경우)

## 급여 기간 추출
- 파일명에서 추출: "12월_가을식품" → "2025-12"
- 헤더에서 추출: "2025년 12월 급여" → "2025-12"
- 올해 기준으로 년도 추정

## 예시
입력: "본사 8,257,323 / 김용화 2022-07-04 3,505,727"
→ 본사는 부서(제외), 김용화는 사람(추출)

반드시 JSON만 응답:
{
  "period": "YYYY-MM",
  "employees": [
    {
      "name": "사람이름 (2~4글자)",
      "residentRegistrationNumber": "000000-0000000 또는 빈문자열",
      "hireDate": "YYYY-MM-DD 또는 빈문자열",
      "position": "직급 또는 빈문자열",
      "department": "소속부서 또는 빈문자열",
      "monthlyWage": 숫자,
      "baseSalary": 숫자 또는 0,
      "overtimePay": 숫자 또는 0,
      "bonus": 숫자 또는 0
    }
  ],
  "totalWage": 개인급여합계숫자
}

텍스트:
`,

  [DocumentType.EMPLOYMENT_CONTRACT]: `당신은 한국 근로계약서에서 정보를 추출하는 전문가입니다.

## 🔴 핵심 규칙: 이름은 2~4글자 한글만!

### 근로자 이름 추출 방법
1. 계약서 첫 문장에서 "(이하 '을')" 또는 "(이하 '근로자')" 바로 앞의 2~4글자 한글 이름
2. 또는 서명란의 "성명:" 뒤 2~4글자

**정확한 예시:**
- "가을식품(이하 '갑')과 곽봉준(이하 '을')" → employeeName: "곽봉준" ✅
- "회사와 김현정(이하 '근로자')" → employeeName: "김현정" ✅

**잘못된 예시 (절대 금지):**
- employeeName: "곽봉준 (이하 '을'이라 한다.)" ❌ (법률문구 포함)
- employeeName: "간의 근로관계에 관한" ❌ (이름이 아님)
- employeeName: "김현정 (이하 '을'이라 한다.) 은(는) 다음과 같은" ❌

### 회사명 추출 방법
1. "(이하 '갑')" 또는 "(이하 '회사')" 바로 앞의 회사명
2. "(주)", "주식회사" 제외하고 핵심 이름만

**정확한 예시:**
- "(주)가을식품(이하 '갑')" → employerName: "가을식품" ✅

### 주민등록번호
- "000000-0000000" 형식 (13자리 숫자+하이픈)

### 급여
- 숫자만 추출 (쉼표, "원", "금" 제거)

반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이):
{
  "employeeName": "2~4글자 한글 이름만",
  "employerName": "회사명만 (2~10글자)",
  "employerRepresentative": "대표자명 또는 null",
  "residentRegistrationNumber": "000000-0000000 또는 빈문자열",
  "contractStartDate": "YYYY-MM-DD",
  "contractEndDate": "YYYY-MM-DD 또는 null",
  "workType": "FULL_TIME 또는 PART_TIME",
  "contractType": "INDEFINITE 또는 FIXED_TERM",
  "monthlySalary": 숫자,
  "weeklyWorkHours": 숫자,
  "dailyWorkHours": 숫자,
  "jobPosition": "직위 또는 null",
  "department": "부서 또는 null",
  "workAddress": "근무지 주소 또는 null",
  "probationPeriodMonths": 숫자 또는 0,
  "isProbation": boolean
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

// 데이터 정제 유틸리티
const INVALID_PATTERNS = {
  // 양식 레이블 패턴
  FORM_LABELS: /[①②③④⑤⑥⑦⑧⑨⑩]|상호\s*\(법인명\)|등록번호|대표자|사업장|종된사업장|개설일|사업의종류|업태|종목/g,
  // 부서명/합계 패턴
  DEPARTMENT_NAMES: /^(본사|생산|관리|물류|영업|총무|경리|인사|회계|기술|개발|합계|소계|계|총계|부서계|대표이사|임원|관리자)$/,
  // 잘못된 이름 패턴 (법률 용어, 문서 용어)
  INVALID_NAMES: /^(간의|관한|기본|목적|정함|사항|내용|회사|근로|계약|조항|규정|규칙|조건|일자|기간|급여|임금|시간|장소|업무|직위|직책|근무|휴가|휴일|보험|퇴직|해지|비밀|기타|상호|주소|대표|성명|연락|전화)$/,
  // 법률 문구 패턴 (유니코드 따옴표 포함: '' "")
  LEGAL_PHRASES: /\(이하\s*['"''"""]?[가-힣]+['"''"""]?(?:이라|라)\s*한다\.?\)|은\(는\)|다음과\s*같[이은].*?(?:조건|체결|합의)|조건으로\s*근로|근로계약을?\s*체결[하고]*|각\s*1부씩\s*보관|근로기준법|에\s*의하여|에\s*따라|을\s*체결한다/g,
  // 주민번호 패턴
  RRN_PATTERN: /^\d{6}-?\d{7}$/,
  // 사업자번호 패턴
  BIZ_NUMBER_PATTERN: /^\d{3}-\d{2}-\d{5}$/,
};

// 문자열에서 레이블/양식 텍스트 제거
function cleanFormLabels(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(INVALID_PATTERNS.FORM_LABELS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 법률 문구 제거
function cleanLegalPhrases(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(INVALID_PATTERNS.LEGAL_PHRASES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 유효한 사람 이름인지 확인 (2~4글자 한글)
function isValidPersonName(name: string | null | undefined): boolean {
  if (!name) return false;
  const cleaned = name.trim();
  // 2~4글자 한글
  if (!/^[가-힣]{2,4}$/.test(cleaned)) return false;
  // 부서명이 아님
  if (INVALID_PATTERNS.DEPARTMENT_NAMES.test(cleaned)) return false;
  return true;
}

// 유효한 회사명인지 확인
function isValidCompanyName(name: string | null | undefined): boolean {
  if (!name) return false;
  const cleaned = cleanFormLabels(name);
  // 최소 2글자
  if (cleaned.length < 2) return false;
  // 레이블만 있는 경우 제외
  if (/^(상호|법인명|사업장|회사명)$/.test(cleaned)) return false;
  return true;
}

// 사업자등록증 데이터 정제
function sanitizeBusinessRegistration(data: BusinessRegistrationData): BusinessRegistrationData {
  const sanitized = { ...data };

  // 상호 정제
  if (sanitized.businessName) {
    sanitized.businessName = cleanFormLabels(sanitized.businessName);
    if (!isValidCompanyName(sanitized.businessName)) {
      sanitized.businessName = '';
    }
  }

  // 대표자명 정제
  if (sanitized.representativeName) {
    sanitized.representativeName = cleanFormLabels(sanitized.representativeName);
    if (!isValidPersonName(sanitized.representativeName)) {
      sanitized.representativeName = '';
    }
  }

  // 주소 정제 (레이블 제거)
  if (sanitized.businessAddress) {
    sanitized.businessAddress = cleanFormLabels(sanitized.businessAddress);
    if (!/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/.test(sanitized.businessAddress)) {
      console.warn(`[Sanitize] Invalid address format: ${sanitized.businessAddress}`);
    }
  }

  // 사업자번호 형식 검증
  if (sanitized.businessNumber && !INVALID_PATTERNS.BIZ_NUMBER_PATTERN.test(sanitized.businessNumber)) {
    const digits = sanitized.businessNumber.replace(/\D/g, '');
    if (digits.length === 10) {
      sanitized.businessNumber = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    }
  }

  if (sanitized.businessType) {
    sanitized.businessType = cleanBusinessTypeField(sanitized.businessType);
  }

  if (sanitized.businessItem) {
    sanitized.businessItem = cleanBusinessTypeField(sanitized.businessItem);
  }

  return sanitized;
}

function cleanBusinessTypeField(value: string): string {
  if (!value) return '';
  
  const cutoffPatterns = [
    /\s*종목\s*.*/i,
    /\s*발급사유.*/i,
    /\s*사업자단위과세.*/i,
    /\s*전자세금계산서.*/i,
    /\s*①.*/,
    /\s*\d{4}년\d{2}월\d{2}일.*/,
  ];
  
  let cleaned = value;
  for (const pattern of cutoffPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned.trim();
}

// 급여대장 데이터 정제
function sanitizeWageLedger(data: WageLedgerData): WageLedgerData {
  const sanitized = { ...data };

  if (sanitized.employees) {
    // 유효한 직원만 필터링
    sanitized.employees = sanitized.employees.filter((emp) => {
      // 이름이 유효한 사람 이름인지 확인
      if (!isValidPersonName(emp.name)) {
        console.log(`[Sanitize] Filtering out invalid employee name: ${emp.name}`);
        return false;
      }
      // 급여가 0 이하인 경우 (부서 소계 등) 제외
      if (emp.monthlyWage !== undefined && emp.monthlyWage <= 0) {
        console.log(`[Sanitize] Filtering out employee with zero wage: ${emp.name}`);
        return false;
      }
      return true;
    });

    // totalWage 재계산
    sanitized.totalWage = sanitized.employees.reduce(
      (sum, emp) => sum + (emp.monthlyWage || 0),
      0
    );
  }

  return sanitized;
}

// rawText에서 근로자 이름 직접 추출 (fallback)
function extractEmployeeNameFromRawText(rawText: string): string | null {
  // 유니코드 따옴표 포함: " " ' ' " '
  const quotes = `["'"'""']?`;

  // 패턴 1: "회사명(이하 "회사")와 이름(이하 "근로자")"
  const pattern1Regex = new RegExp(`[가-힣]+\\s*\\(이하\\s*${quotes}회사${quotes}\\s*\\)\\s*[와과]\\s*([가-힣]{2,4})\\s*\\(이하\\s*${quotes}근로자${quotes}\\)`);
  const pattern1 = rawText.match(pattern1Regex);
  if (pattern1) return pattern1[1];

  // 패턴 2: "회사명(이하 '갑')과 이름(이하 '을')"
  const pattern2Regex = new RegExp(`[가-힣]+\\s*\\(이하\\s*${quotes}갑${quotes}\\s*\\)\\s*[과와]\\s*([가-힣]{2,4})\\s*\\(이하\\s*${quotes}을${quotes}\\)`);
  const pattern2 = rawText.match(pattern2Regex);
  if (pattern2) return pattern2[1];

  // 패턴 3: 서명란 "(근로자)" 섹션에서 "성 명: 이름"
  const pattern3 = rawText.match(/\(근로자\)[\s\S]*?성\s*명\s*[:：]?\s*([가-힣]{2,4})/);
  if (pattern3) return pattern3[1];

  // 패턴 4: 단순 "성 명: 이름" (가장 마지막에 나오는 것)
  const pattern4Matches = rawText.matchAll(/성\s*명\s*[:：]?\s*([가-힣]{2,4})/g);
  let lastName = null;
  for (const match of pattern4Matches) {
    lastName = match[1];
  }
  if (lastName) return lastName;

  return null;
}

// rawText에서 회사명 직접 추출 (fallback)
function extractEmployerNameFromRawText(rawText: string): string | null {
  // 유니코드 따옴표 포함
  const quotes = `["'"'""']?`;

  // 패턴 1: "(주)회사명 (이하 '갑'이라 한다)" - (주), ㈜, 주식회사 포함
  const pattern1Regex = new RegExp(`(?:\\(?주\\)?|㈜|주식회사)\\s*([가-힣]+(?:파트너스|전자|식품|물류|산업|건설|테크|소프트|엔지니어링)?)\\s*\\(이하\\s*${quotes}갑${quotes}`);
  const pattern1 = rawText.match(pattern1Regex);
  if (pattern1) return pattern1[1];

  // 패턴 2: "회사명(이하 "회사")" 또는 "회사명 (이하 '사용자')"
  const pattern2Regex = new RegExp(`([가-힣]+(?:파트너스|전자|식품|물류|산업|건설|테크|소프트)?)\\s*\\(이하\\s*${quotes}(?:회사|사용자)${quotes}`);
  const pattern2 = rawText.match(pattern2Regex);
  if (pattern2) return pattern2[1];

  // 패턴 3: "회사명 (주)회사명" 또는 "회사명㈜회사명" 라인에서 추출
  const pattern3 = rawText.match(/회사명\s*(?:\(?주\)?|㈜|주식회사)?\s*([가-힣]+)/);
  if (pattern3) return pattern3[1];

  // 패턴 4: "(회사)" 또는 "(사용자)" 섹션의 상호
  const pattern4 = rawText.match(/\((?:회\s*사|사용자)\)[\s\S]*?상\s*호\s*[:：]?\s*(?:\(?주\)?|㈜|주식회사)?\s*([가-힣]+)/);
  if (pattern4) return pattern4[1];

  // 패턴 5: "상호: (주)회사명" 또는 "상호 주식회사 회사명"
  const pattern5 = rawText.match(/상\s*호\s*[:：]?\s*(?:\(?주\)?|㈜|주식회사)?\s*([가-힣]+)/);
  if (pattern5) return pattern5[1];

  return null;
}

// 근로계약서 데이터 정제
export function sanitizeEmploymentContract(data: EmploymentContractData, rawText?: string): EmploymentContractData {
  const sanitized = { ...data };

  // 근로자명 정제
  if (sanitized.employeeName) {
    console.log(`[Sanitize] Original employeeName: "${sanitized.employeeName}"`);

    // 1단계: 괄호 앞의 텍스트만 추출 (가장 흔한 오류 패턴 처리)
    // "곽봉준 (이하 '을'이라 한다.)" → "곽봉준"
    let cleanedName = sanitized.employeeName.split(/\s*[\(（]/)[0].trim();
    console.log(`[Sanitize] After removing parentheses: "${cleanedName}"`);

    // 2단계: 법률 문구 정제 (나머지 불필요한 텍스트 제거)
    cleanedName = cleanLegalPhrases(cleanedName);
    console.log(`[Sanitize] After cleanLegalPhrases: "${cleanedName}"`);

    // 3단계: 첫 번째 한글 이름만 추출 (2~4글자)
    const nameMatch = cleanedName.match(/[가-힣]{2,4}/);
    const extractedName = nameMatch ? nameMatch[0] : '';
    console.log(`[Sanitize] Extracted name: "${extractedName}"`);

    // 4단계: 유효한 이름인지 확인 (부서명/법률용어가 아닌 사람 이름)
    const isValidName = extractedName
      && extractedName.length >= 2
      && !INVALID_PATTERNS.DEPARTMENT_NAMES.test(extractedName)
      && !INVALID_PATTERNS.INVALID_NAMES.test(extractedName);

    if (isValidName) {
      sanitized.employeeName = extractedName;
      console.log(`[Sanitize] Final employeeName: "${extractedName}"`);
    } else {
      sanitized.employeeName = '';
      console.log(`[Sanitize] Invalid name, set to empty`);
    }
  }

  // AI가 이름 추출 실패시 rawText에서 직접 추출
  if (!sanitized.employeeName && rawText) {
    const fallbackName = extractEmployeeNameFromRawText(rawText);
    if (fallbackName) {
      console.log(`[Sanitize] AI failed to extract employee name, using fallback: ${fallbackName}`);
      sanitized.employeeName = fallbackName;
    }
  }

  // 사용자(회사)명 정제
  if (sanitized.employerName) {
    console.log(`[Sanitize] Original employerName: "${sanitized.employerName}"`);

    // 너무 긴 텍스트는 잘못 추출된 것 (회사명은 보통 20자 이내)
    if (sanitized.employerName.length > 20) {
      console.log(`[Sanitize] employerName too long (${sanitized.employerName.length} chars), discarding`);
      sanitized.employerName = '';
    } else {
      // 계약서 문구가 포함되어 있으면 잘못 추출된 것
      const invalidEmployerPatterns = /한다|동의|근로자|체결|조건|계약|보관|확인|기입|날인|작성|교부/;
      if (invalidEmployerPatterns.test(sanitized.employerName)) {
        console.log(`[Sanitize] employerName contains contract phrases, discarding`);
        sanitized.employerName = '';
      } else {
        sanitized.employerName = cleanLegalPhrases(sanitized.employerName);
        // (주), 주식회사 등 제거하고 핵심 회사명만
        sanitized.employerName = sanitized.employerName
          .replace(/\(주\)|주식회사|㈜/g, '')
          .replace(/\s*(주|소)\s*$/g, '')  // 끝에 "주" 또는 "소" 제거
          .trim();

        // 핵심 회사명만 추출 (한글 2~10자)
        const companyMatch = sanitized.employerName.match(/[가-힣]{2,10}/);
        if (companyMatch) {
          sanitized.employerName = companyMatch[0];
          console.log(`[Sanitize] Extracted company name: "${sanitized.employerName}"`);
        }

        // 유효하지 않으면 빈 문자열
        if (!isValidCompanyName(sanitized.employerName)) {
          sanitized.employerName = '';
        }
      }
    }
  }

  // AI가 회사명 추출 실패시 rawText에서 직접 추출
  if (!sanitized.employerName && rawText) {
    const fallbackEmployer = extractEmployerNameFromRawText(rawText);
    if (fallbackEmployer) {
      console.log(`[Sanitize] AI failed to extract employer name, using fallback: ${fallbackEmployer}`);
      sanitized.employerName = fallbackEmployer;
    }
  }

  // 대표자명 정제
  if (sanitized.employerRepresentative) {
    sanitized.employerRepresentative = cleanLegalPhrases(sanitized.employerRepresentative);
    const repMatch = sanitized.employerRepresentative.match(/[가-힣]{2,4}/);
    sanitized.employerRepresentative = repMatch ? repMatch[0] : '';
  }

  // 월급여가 문자열이면 숫자로 변환
  if (typeof sanitized.monthlySalary === 'string') {
    const salaryStr = sanitized.monthlySalary as string;
    // 쉼표, 원, 만원 등 제거
    let salary = parseInt(salaryStr.replace(/[,원\s]/g, ''), 10);
    // "만원" 단위면 10000 곱하기
    if (salaryStr.includes('만')) {
      salary *= 10000;
    }
    sanitized.monthlySalary = isNaN(salary) ? 0 : salary;
  }

  // 주민번호 형식 검증
  if (sanitized.residentRegistrationNumber) {
    const rrn = sanitized.residentRegistrationNumber.replace(/\s/g, '');
    if (!INVALID_PATTERNS.RRN_PATTERN.test(rrn)) {
      // 숫자만 추출
      const digits = rrn.replace(/\D/g, '');
      if (digits.length === 13) {
        sanitized.residentRegistrationNumber = `${digits.slice(0, 6)}-${digits.slice(6)}`;
      }
    }
  }

  return sanitized;
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
    let parsed = parseResult.data as any;

    // 데이터 정제 (잘못된 값 필터링)
    console.log(`[AI Extraction] Sanitizing ${documentType} data...`);
    if (documentType === DocumentType.BUSINESS_REGISTRATION) {
      parsed = sanitizeBusinessRegistration(parsed);
    } else if (documentType === DocumentType.WAGE_LEDGER) {
      parsed = sanitizeWageLedger(parsed);
      // 직원 데이터 보강 (나이 계산 등)
      if (parsed.employees) {
        parsed.employees = parsed.employees.map(enrichEmployeeData);
      }
    } else if (documentType === DocumentType.EMPLOYMENT_CONTRACT) {
      parsed = sanitizeEmploymentContract(parsed, ocrText);
    }

    // 신뢰도 계산 (100% 달성 가능 - 필드 누락 시에만 감점)
    let confidence = 100;
    if (documentType === DocumentType.BUSINESS_REGISTRATION) {
      if (!parsed.businessNumber) confidence -= 25;
      if (!parsed.businessName) confidence -= 20;
      if (!parsed.representativeName) confidence -= 15;
      if (!parsed.businessAddress) confidence -= 10;
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

/**
 * Gemini Vision API를 사용하여 PDF 급여대장에서 직접 데이터 추출
 * - PDF를 이미지로 변환할 필요 없음 (Gemini가 PDF 직접 지원)
 * - 테이블 구조 인식 우수
 * - Linux/Render 환경에서도 작동
 */
export async function extractWageLedgerWithVision(
  pdfPath: string
): Promise<AIExtractionResult<WageLedgerData>> {
  if (!genAI) {
    return {
      data: null,
      confidence: 0,
      errors: ['GEMINI_API_KEY 환경변수가 설정되지 않았습니다.'],
    };
  }

  const visionModel = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.05,
      topP: 0.9,
      maxOutputTokens: 16384,
    },
  });

  const fs = await import('fs');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const prompt = `당신은 한국 급여대장/임금대장 데이터 추출 전문 AI입니다. 정확도 100%를 목표로 합니다.

## 🎯 목표
이 PDF에서 모든 직원의 급여 정보를 100% 정확하게 추출하세요.

## 📋 추출 규칙 (엄격히 준수)

### 1. 직원 식별
- ✅ 추출 대상: 실제 사람 이름 (2~4글자 한글 성명)
- ❌ 제외 대상: 부서명(본사, 생산, 관리, 물류, 영업), 합계/소계 행

### 2. 주민등록번호 추출
- 형식: 000000-0000000 (13자리)
- 앞 6자리: 생년월일 (YYMMDD)
- 뒷자리 첫 번째: 성별 (1,2=1900년대, 3,4=2000년대)
- 예: 950815-1234567 (1995년 8월 15일생 남성)

### 3. 입사일 추출
- 형식: YYYY-MM-DD
- 테이블에서 "입사일", "채용일", "취득일" 컬럼 확인
- 없으면 빈 문자열

### 4. 급여 추출 (숫자만, 쉼표 제거)
- monthlyWage: 월 총지급액 (실수령액 또는 지급 총액)
- baseSalary: 기본급 (없으면 0)
- overtimePay: 연장근로수당 (없으면 0)
- bonus: 상여금 (없으면 0)

### 5. 급여 기간
- 문서 상단 또는 파일명에서 "YYYY년 MM월" 형식 확인
- 예: "2024년 12월 급여대장" → period: "2024-12"

## 🚫 절대 금지
- 부서 소계/합계를 직원으로 추출하지 마세요
- 추측하지 마세요 - 보이는 값만 추출
- 빈 값은 빈 문자열("") 또는 0으로

## 📤 응답 형식 (JSON만, 다른 텍스트 없이)
{
  "period": "YYYY-MM",
  "employees": [
    {
      "name": "홍길동",
      "residentRegistrationNumber": "900101-1234567",
      "hireDate": "2024-01-01",
      "position": "대리",
      "department": "영업부",
      "monthlyWage": 3500000,
      "baseSalary": 3000000,
      "overtimePay": 300000,
      "bonus": 200000
    }
  ],
  "totalWage": 35000000
}`;

  try {
    console.log('[Vision Extraction] Processing PDF with Gemini Vision...');
    console.log(`[Vision Extraction] PDF path: ${pdfPath}, size: ${pdfBuffer.length} bytes`);

    const result = await callWithRetry(async () => {
      return await visionModel.generateContent([
        { text: prompt },
        {
          inlineData: {
            data: pdfBase64,
            mimeType: 'application/pdf',
          },
        },
      ]);
    }, 'WAGE_LEDGER_VISION');

    const text = result.response.text();
    console.log('[Vision Extraction] Raw response length:', text.length);
    console.log('[Vision Extraction] Response preview:', text.substring(0, 500));

    const parseResult = safeJsonParse(text);
    if (!parseResult) {
      console.error('[Vision Extraction] JSON parsing failed');
      return {
        data: null,
        confidence: 0,
        errors: ['Vision API 응답을 JSON으로 파싱할 수 없습니다.'],
        rawResponse: text,
      };
    }

    console.log(`[Vision Extraction] JSON parsed using method: ${parseResult.method}`);

    // 데이터 정제
    let parsed = parseResult.data as WageLedgerData;
    parsed = sanitizeWageLedger(parsed);

    // 직원 데이터 보강 (나이 계산)
    if (parsed.employees) {
      parsed.employees = parsed.employees.map(enrichEmployeeData);
    }

    // 신뢰도 100% 기본값 - 필드 누락 시에만 감점
    let confidence = 100;
    if (!parsed.employees || parsed.employees.length === 0) {
      confidence -= 40;
    } else {
      const validEmployees = parsed.employees.filter(
        (emp) => emp.name && emp.monthlyWage && emp.monthlyWage > 0
      );
      const validRatio = validEmployees.length / parsed.employees.length;
      if (validRatio < 0.5) confidence -= 20;
      else if (validRatio < 0.8) confidence -= 10;
    }

    console.log(
      `[Vision Extraction] Success! ${parsed.employees?.length || 0} employees extracted, confidence: ${confidence}%`
    );

    return {
      data: parsed,
      confidence: Math.max(0, confidence),
      errors: [],
      rawResponse: text,
    };
  } catch (error) {
    console.error('[Vision Extraction] Error:', error);
    return {
      data: null,
      confidence: 0,
      errors: [error instanceof Error ? error.message : 'Vision 추출 실패'],
    };
  }
}

export async function extractBusinessRegistrationWithVision(
  pdfPath: string
): Promise<AIExtractionResult<BusinessRegistrationData>> {
  if (!genAI) {
    return {
      data: null,
      confidence: 0,
      errors: ['GEMINI_API_KEY 환경변수가 설정되지 않았습니다.'],
    };
  }

  const visionModel = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.05,
      topP: 0.9,
      maxOutputTokens: 8192,
    },
  });

  const fs = await import('fs');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const prompt = `당신은 한국 사업자등록증 데이터 추출 전문 AI입니다. 정확도 100%를 목표로 합니다.

## 목표
이 PDF 이미지에서 사업자등록증 정보를 정확하게 추출하세요.

## 추출 규칙
1. 사업자등록번호: 10자리 숫자 (XXX-XX-XXXXX 형식)
2. 상호(법인명): 회사/사업장 이름
3. 대표자명: 대표자 성명
4. 사업장 주소: 전체 주소
5. 등록일자: YYYY-MM-DD 형식
6. 업태/업종: 사업 업태 및 종목
7. 개업일자: YYYY-MM-DD 형식

## 출력 형식 (JSON)
{
  "businessNumber": "123-45-67890",
  "businessName": "주식회사 테스트",
  "representativeName": "홍길동",
  "businessAddress": "서울특별시 강남구 테헤란로 123",
  "registrationDate": "2020-01-15",
  "businessType": "서비스업",
  "businessCategory": "소프트웨어 개발",
  "openDate": "2020-01-01"
}

반드시 유효한 JSON만 출력하세요. 설명이나 마크다운 없이 JSON만 출력하세요.`;

  try {
    console.log('[Vision BR Extraction] Processing PDF with Gemini Vision...');
    console.log(`[Vision BR Extraction] PDF path: ${pdfPath}, size: ${pdfBuffer.length} bytes`);

    const result = await callWithRetry(async () => {
      return await visionModel.generateContent([
        { text: prompt },
        {
          inlineData: {
            data: pdfBase64,
            mimeType: 'application/pdf',
          },
        },
      ]);
    }, 'BUSINESS_REGISTRATION_VISION');

    const text = result.response.text();
    console.log('[Vision BR Extraction] Raw response length:', text.length);
    console.log('[Vision BR Extraction] Response preview:', text.substring(0, 500));

    const parseResult = safeJsonParse(text);
    if (!parseResult) {
      console.error('[Vision BR Extraction] JSON parsing failed');
      return {
        data: null,
        confidence: 0,
        errors: ['Vision API 응답을 JSON으로 파싱할 수 없습니다.'],
        rawResponse: text,
      };
    }

    console.log(`[Vision BR Extraction] JSON parsed using method: ${parseResult.method}`);

    let parsed = parseResult.data as BusinessRegistrationData;
    parsed = sanitizeBusinessRegistration(parsed);

    let confidence = 100;
    if (!parsed.businessNumber) confidence -= 25;
    if (!parsed.businessName) confidence -= 20;
    if (!parsed.representativeName) confidence -= 15;
    if (!parsed.businessAddress) confidence -= 10;

    console.log(`[Vision BR Extraction] Success! Confidence: ${confidence}%`);

    return {
      data: parsed,
      confidence: Math.max(0, confidence),
      errors: [],
      rawResponse: text,
    };
  } catch (error) {
    console.error('[Vision BR Extraction] Error:', error);
    return {
      data: null,
      confidence: 0,
      errors: [error instanceof Error ? error.message : 'Vision 추출 실패'],
    };
  }
}
