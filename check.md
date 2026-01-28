# 고용지원금 자동화 프로젝트 진행 현황

> 마지막 업데이트: 2026-01-28 (세션 5)

---

## 완료된 작업

### 1. OCR 기능 극대화
- [x] Claude Vision API 기반 AI 추출 구현
- [x] 사업자등록증 추출 정확도 향상
- [x] 근로계약서 추출 정확도 향상 (이름 정제 로직 포함)
- [x] 급여대장 추출 로직 개선 (기간, 직원수, 총급여)
- [x] Excel 파일 직접 파싱 지원 (급여대장)

### 2. 데이터 추출 안정화
- [x] 문서 유형별 전용 extractor 구현
- [x] AI 추출 실패 시 정규식 fallback 로직
- [x] 추출 신뢰도(confidence) 계산 및 표시

### 3. 세션 및 상태 관리 (2026-01-28)
- [x] 새로고침 시 추출 결과 유지 (documentId → jobId 매핑)
- [x] 기존 완료된 extraction 재사용 로직
- [x] Rate limit 한도 상향 (10000/시간)

### 4. 다중 급여대장 병합 (2026-01-28 완료)
- [x] `subsidy.controller.ts` - `wageLedgers` 배열로 수집
- [x] `calculateEligibility` 메소드 - WAGE_LEDGER case에서 push 후 병합
- [x] `getExtractedDataForSession` 메소드 - 동일 패턴 적용
- [x] `mergeWageLedgers` 메소드 신규 추가

### 5. 프론트엔드 안정화 (2026-01-28 완료)
- [x] 다중 파일 업로드 시 세션 ID 전달 버그 수정
- [x] ExtractionPage 전면 리팩토링 - 초기화/폴링 로직 안정화
- [x] 무한 루프 버그 수정

### 6. 보고서 시스템 (2026-01-28 3종 통합 완료)
- [x] 신청필수서류 출력 - 프로그램별 필요 서류 체크리스트
- [x] 고객 안내 보고서 - 맥킨지 스타일 컨설팅 보고서 (회사명, 예상 지원금)
- [x] 신청 데이터 정리 - 고용24 웹 신청용 데이터 정리

### 7. PDF Vision 추출 (2026-01-28 완료)
- [x] `extractWageLedgerWithVision()` 함수 구현 (`ai-extraction.service.ts`)
- [x] `extraction.service.ts`에 Vision 분기 추가 - PDF 급여대장은 Vision API 우선 사용
- [x] Linux/Render 환경에서 PDF 급여대장 추출 지원

### 8. 다중 급여대장 버그 수정 (2026-01-28 완료)
- [x] `calculateEligibility()`와 `getExtractedDataForSession()` 중복 로직 통합
- [x] extractedDir 읽기 최적화 (한 번만 읽고 Map으로 캐싱)
- [x] 중복 제거 키 개선 (주민번호 없을 때 입사일+인덱스로 fallback)

---

## 현재 문제점 분석

### 문제 1: 다중 급여대장 추출 - 일부만 추출됨

#### 증상
여러 급여대장 파일 업로드 시 일부 파일만 추출되거나 병합이 제대로 안됨

#### 원인 분석
```
현재 구조:
subsidy.controller.ts
├── calculateEligibility()     → wageLedgers 배열 수집 후 mergeWageLedgers() 호출
└── getExtractedDataForSession() → 동일 로직 중복 구현 (DRY 위반)

문제점:
1. 두 메소드가 동일 로직을 중복 구현 → 하나만 수정하면 불일치 발생
2. extractedDir 전체를 문서마다 매번 readdir() → 성능 저하
3. 중복 제거 키가 "이름+주민번호앞6자리" → 주민번호 OCR 실패시 빈 문자열로 중복 처리됨
```

#### 해결 방안
```typescript
// 1. 중복 로직을 하나의 헬퍼 함수로 통합
private async collectExtractedDataForSession(sessionId: string): Promise<{
  data: Record<string, unknown>;
  confidences: ConfidenceInfo[];
}> {
  // ... 한 곳에서만 구현
}

// 2. extractedDir은 한 번만 읽기
const extractedFiles = await fs.readdir(config.extractedDir);
const extractedMap = new Map<string, ExtractedData>();
for (const file of extractedFiles) {
  const data = await readJsonFile(path.join(config.extractedDir, file));
  if (data?.result?.documentId) {
    extractedMap.set(data.result.documentId, data.result);
  }
}

// 3. 중복 제거 키 개선 (주민번호 없을 때 fallback)
const key = employee.residentRegistrationNumber
  ? `${employee.name}_${rrnPrefix}`
  : `${employee.name}_${employee.hireDate || 'unknown'}_${index}`;
```

---

### 문제 2: PDF 급여대장 추출 실패 (Linux 환경)

#### 증상
| 파일 형식 | macOS | Linux/Render |
|-----------|-------|--------------|
| Excel (.xls, .xlsx) | 성공 | 성공 |
| PDF 급여대장 (스캔) | 성공 | **실패** |
| PDF 근로계약서 (텍스트) | 성공 | 성공 |
| PDF 사업자등록증 (텍스트) | 성공 | 성공 |

#### 원인 분석
```typescript
// ocr.service.ts - convertPdfToImageMacOS() 메소드
private async convertPdfToImageMacOS(pdfPath: string): Promise<string> {
  // sips, qlmanage는 macOS 전용 명령어!
  await execAsync(`sips -s format png "${pdfPath}" --out "${outputPath}"`);
  // 또는
  await execAsync(`qlmanage -t -s 1500 -o "${qlOutputDir}" "${pdfPath}"`);
}

// extractTextFromPDF() 메소드 line 144
const isLinux = process.platform === 'linux';
if (needsOCR && !isLinux) {  // Linux에서는 OCR 스킵!
  return await this.extractTextFromScannedPDF(filePath);
}
```

**핵심 문제**: Linux에서는 `sips`/`qlmanage`가 없어서 PDF→이미지 변환 불가 → OCR 불가 → 빈 텍스트 반환

---

## 해결 계획

### 1단계: Gemini Vision API로 PDF 직접 처리 (최우선)

Gemini는 PDF를 직접 지원하므로 이미지 변환 없이 처리 가능

#### 구현 위치
- **신규**: `src/services/ai-extraction.service.ts`에 `extractWageLedgerWithVision()` 추가
- **수정**: `src/services/extraction.service.ts`에 Vision 분기 추가

#### 구현 코드

**파일**: `src/services/ai-extraction.service.ts`

```typescript
import fs from 'fs';

/**
 * Gemini Vision API를 사용하여 PDF 급여대장에서 직접 데이터 추출
 * - PDF를 이미지로 변환할 필요 없음 (Gemini가 PDF 직접 지원)
 * - 테이블 구조 인식 우수
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

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 8192,
    },
  });

  // PDF를 base64로 읽기 (Gemini는 PDF 직접 지원)
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const prompt = `당신은 한국 급여대장/임금대장 전문가입니다.

이 PDF는 급여대장입니다. 테이블에서 각 직원의 정보를 정확히 추출하세요.

## 추출 규칙
1. 테이블의 각 행에서 직원 정보 추출
2. 부서명/소계/합계 행은 제외 (예: 본사, 생산, 관리, 합계)
3. 사람 이름만 추출 (2~4글자 한글)
4. 주민등록번호는 000000-0000000 형식으로 정확히 추출

## 필수 응답 형식 (JSON만)
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
    
    const result = await callWithRetry(async () => {
      return await model.generateContent([
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

    const parseResult = safeJsonParse(text);
    if (!parseResult) {
      return {
        data: null,
        confidence: 0,
        errors: ['Vision API 응답을 JSON으로 파싱할 수 없습니다.'],
        rawResponse: text,
      };
    }

    // 데이터 정제
    let parsed = parseResult.data as WageLedgerData;
    parsed = sanitizeWageLedger(parsed);

    // 직원 데이터 보강 (나이 계산)
    if (parsed.employees) {
      parsed.employees = parsed.employees.map(enrichEmployeeData);
    }

    // 신뢰도 계산
    let confidence = 90; // Vision은 기본 신뢰도 높음
    if (!parsed.employees || parsed.employees.length === 0) {
      confidence -= 40;
    } else {
      const validEmployees = parsed.employees.filter(
        emp => emp.name && emp.monthlyWage && emp.monthlyWage > 0
      );
      const validRatio = validEmployees.length / parsed.employees.length;
      if (validRatio < 0.5) confidence -= 20;
      else if (validRatio < 0.8) confidence -= 10;
    }

    console.log(`[Vision Extraction] Success! ${parsed.employees?.length || 0} employees, confidence: ${confidence}%`);

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
```

**파일**: `src/services/extraction.service.ts` (수정)

```typescript
import { extractWageLedgerWithVision } from './ai-extraction.service';

// processExtraction 메소드 내부, Excel 처리 다음에 추가
private async processExtraction(job: ExtractionJob, document: UploadedDocument): Promise<void> {
  const startTime = Date.now();

  try {
    const documentType = document.documentType as DocumentType;
    const ext = document.path.toLowerCase().split('.').pop();
    const isExcel = ['xls', 'xlsx'].includes(ext || '');
    const isPdf = ext === 'pdf';

    // 1. Excel 급여대장 → 직접 파싱 (기존 로직)
    if (isExcel && documentType === DocumentType.WAGE_LEDGER) {
      // ... 기존 코드 유지
    }

    // 2. PDF 급여대장 → Gemini Vision API 사용 (새로 추가)
    if (isPdf && documentType === DocumentType.WAGE_LEDGER) {
      console.log(`[Extraction] Using Gemini Vision for PDF wage ledger: ${document.originalName}`);
      
      try {
        const visionResult = await extractWageLedgerWithVision(document.path);
        
        if (visionResult.data && visionResult.confidence > 50) {
          const result: ExtractionResult = {
            jobId: job.id,
            documentId: document.id,
            documentType,
            status: ExtractionStatus.COMPLETED,
            extractedData: visionResult.data,
            rawText: '[Gemini Vision - PDF Direct]',
            confidence: visionResult.confidence,
            errors: visionResult.errors,
            processingTime: Date.now() - startTime,
          };

          job.status = ExtractionStatus.COMPLETED;
          job.completedAt = new Date().toISOString();
          await saveJsonFile(this.getJobPath(job.id), { job, result });
          return;
        }
        
        console.log(`[Extraction] Vision confidence too low (${visionResult.confidence}%), falling back to OCR+AI`);
      } catch (visionError) {
        console.error('[Extraction] Vision extraction failed:', visionError);
        // Vision 실패 시 기존 OCR+AI 방식으로 fallback
      }
    }

    // 3. 기존 OCR + AI 추출 로직 (fallback)
    const ocrResult = await ocrService.extractText(document.path, document.fileFormat);
    // ... 기존 코드 유지
  }
}
```

---

### 2단계: 보고서 3종 통합

#### 현재 상태 (6개 이상)
| # | 보고서 | 위치 | 용도 |
|---|--------|------|------|
| 1 | PDF 보고서 | Backend | 기본 요약 |
| 2 | 신청 체크리스트 | Backend | 텍스트 파일 |
| 3 | 상세 분석 보고서 | Backend | 직원별 상세 |
| 4 | 신청서 작성 보조 자료 | Backend | 노무사용 |
| 5 | 맥킨지 스타일 보고서 | Frontend | 경영진용 |
| 6 | 노무사용 양식 | Frontend | 출력용 |

#### 목표 상태 (3개)

| # | 보고서명 | 용도 | 기반 코드 |
|---|----------|------|-----------|
| **1** | 신청필수서류 출력 | 고용지원금 신청에 필요한 서류 체크리스트 | `report.service.ts` 수정 |
| **2** | 고객 안내 보고서 (맥킨지 스타일) | 회사명 + 지원금 분석 결과, 고급스러운 컨설팅 보고서 | `mcKinseyReportService.ts` 확장 |
| **3** | 신청 데이터 정리 보고서 | 웹 신청 시 입력할 데이터를 깔끔하게 정리 | `laborAttorneyReportService.ts` 단순화 |

#### 구현 계획

**보고서 1: 신청필수서류 출력**
```
내용:
- 프로그램별 필요 서류 목록 (체크박스 형식)
- 서류 준비 가이드
- 신청 사이트 및 기한 정보

기반: report.service.ts의 generateChecklistText() 확장 → PDF로 변환
```

**보고서 2: 고객 안내 보고서 (맥킨지 스타일)**
```
내용:
- 표지: 회사명(사업자등록증 기준), 총 예상 지원금
- Executive Summary
- 프로그램별 분석 결과
- 직원 현황 요약
- 신청 일정 및 주의사항

기반: mcKinseyReportService.ts (이미 구현됨, 표지에 회사명 강조 추가)
```

**보고서 3: 신청 데이터 정리 보고서**
```
내용:
- 사업장 기본 정보 (고용24 입력용)
- 직원 명부 (이름, 주민번호 마스킹, 입사일)
- 프로그램별 대상 직원 목록
- 입력값 요약 (숫자 데이터)

기반: laborAttorneyReportService.ts 단순화 (은행계좌 등 불필요 섹션 제거)
```

#### ReportPage.tsx 수정 계획
```tsx
// 현재: 6개 버튼
// 변경: 3개 버튼으로 통합

<Card padding="lg">
  <CardContent>
    <h2>보고서 다운로드</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      
      {/* 보고서 1: 신청필수서류 */}
      <Button onClick={handleDownloadChecklist}>
        신청필수서류 출력
      </Button>
      
      {/* 보고서 2: 고객 안내 보고서 */}
      <Button onClick={handleDownloadMcKinsey}>
        고객 안내 보고서 (PDF)
      </Button>
      
      {/* 보고서 3: 신청 데이터 정리 */}
      <Button onClick={handleDownloadDataSummary}>
        신청 데이터 정리 (PDF)
      </Button>
      
    </div>
  </CardContent>
</Card>
```

---

## 테스트 체크리스트

### PDF 급여대장 Vision 추출 ✅
- [x] `extractWageLedgerWithVision` 함수 구현 완료
- [x] `processExtraction`에 Vision 분기 추가
- [ ] 로컬 테스트 (macOS) - PDF 급여대장 업로드 → 데이터 추출 확인
- [ ] Render 배포 후 테스트 - Linux 환경에서 PDF 추출 성공 확인
- [ ] Excel + PDF 혼합 업로드 → 모두 정상 추출 확인

### 다중 급여대장 병합 ✅
- [x] 중복 로직 통합 완료
- [x] extractedDir 읽기 최적화 완료
- [x] 중복 제거 키 개선 완료
- [ ] Excel 급여대장 3개 업로드 → 모든 직원 합쳐져서 표시
- [ ] PDF 급여대장 2개 + Excel 1개 혼합 → 병합 정상 작동
- [ ] 중복 직원 제거 확인 (동일 이름+주민번호)
- [ ] 로그 확인: `[WageLedger Merge] N개 급여대장 병합 완료: 총 M명`

### 보고서 3종 통합 ✅
- [x] 기존 6개 버튼 → 3개 버튼으로 UI 변경
- [ ] 보고서 1 (신청필수서류): PDF 다운로드 → 체크리스트 포함 확인
- [ ] 보고서 2 (고객 안내): 맥킨지 스타일 → 회사명/지원금 표시 확인
- [ ] 보고서 3 (데이터 정리): 직원 명부/입력값 정리 확인

---

## 다음 세션 작업 순서

### Phase 1~4 완료됨 (2026-01-28)

### 다음 세션 TODO
1. 로컬 테스트 - PDF 급여대장 업로드 → Vision 추출 확인
2. Render 배포 및 Linux 환경 테스트
3. 다중 급여대장 혼합 테스트 (Excel + PDF)
4. 보고서 3종 다운로드 테스트
5. 프로덕션 전체 플로우 테스트

---

## 파일 위치 참조

| 파일 | 역할 | 수정 필요 |
|------|------|-----------|
| `src/services/extraction.service.ts` | 추출 진입점 | Vision 분기 추가 |
| `src/services/ai-extraction.service.ts` | AI 추출 로직 | Vision 함수 추가 |
| `src/services/ocr.service.ts` | OCR 서비스 | - (Vision으로 대체) |
| `src/controllers/subsidy.controller.ts` | 다중 급여대장 병합 | 중복 로직 통합, 키 개선 |
| `src/services/report.service.ts` | 백엔드 PDF 생성 | 보고서 1 수정 |
| `frontend/src/services/mcKinseyReportService.ts` | 맥킨지 보고서 | 회사명 강조 |
| `frontend/src/services/laborAttorneyReportService.ts` | 노무사 양식 | 단순화 |
| `frontend/src/pages/ReportPage.tsx` | 보고서 다운로드 UI | 3개 버튼으로 통합 |

---

## 기술 스택 현황

| 구분 | 기술 |
|------|------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Node.js + Express + TypeScript |
| OCR/AI | Gemini 2.0 Flash (텍스트), **Gemini Vision (PDF 직접)** |
| PDF 생성 | pdfkit (Backend) + jsPDF (Frontend) |
| 배포 | Vercel (Frontend) + Render (Backend) |

---

## 배포 정보

| 서비스 | URL |
|--------|-----|
| Frontend | https://goyoung-subsidy.vercel.app |
| Backend | https://labor-subsidy-api.onrender.com |
| GitHub | https://github.com/sang-su0916/labor-subsidy-automation |

---

## 환경 변수 확인

Render 환경변수에 다음이 설정되어 있어야 함:
- `GEMINI_API_KEY` - Gemini API 키 (Vision 포함)
- `NODE_ENV=production`
- `PORT=3010`
