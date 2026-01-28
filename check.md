# 고용지원금 자동화 프로젝트 진행 현황

> 마지막 업데이트: 2026-01-28 (세션 3)

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

---

## 🔴 긴급 수정 필요: PDF 급여대장 추출 실패

### 현재 상태
| 파일 형식 | 상태 | 원인 |
|-----------|------|------|
| Excel (.xls, .xlsx) | ✅ 성공 | 직접 파싱 |
| PDF 급여대장 | ❌ 실패 | Linux OCR 불가 |
| PDF 근로계약서 | ✅ 성공 | 텍스트 PDF |
| PDF 사업자등록증 | ✅ 성공 | 텍스트 PDF |

### 실패 원인 분석
```
현재 흐름 (Linux/Render 환경):
PDF 급여대장 → pdf-parse (텍스트 추출) → 텍스트 없음 (스캔 PDF)
                    ↓
              OCR 시도 → macOS 명령어 사용 불가 → 실패
```

**핵심 문제:**
1. `ocr.service.ts`에서 `sips`, `qlmanage` 명령어는 macOS 전용
2. Linux(Render)에서는 이 명령어가 없어서 OCR 불가
3. 스캔된 PDF 급여대장은 텍스트가 없어서 추출 실패

### 해결 방안 (3가지 옵션)

#### 옵션 1: Gemini Vision API 사용 (권장) ⭐
```
PDF → base64 인코딩 → Gemini Vision API 직접 전송 → 테이블 인식
```
- 장점: PDF를 이미지로 변환할 필요 없음 (Gemini가 PDF 직접 지원)
- 장점: 테이블 구조 인식 우수
- 구현: `ai-extraction.service.ts`에 `extractWageLedgerWithVision` 추가

#### 옵션 2: Dockerfile에 OCR 도구 설치
```dockerfile
# Dockerfile에 추가
RUN apt-get update && apt-get install -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-kor
```
- 장점: 기존 로직 유지 가능
- 단점: 빌드 시간 증가, 테이블 구조 손실

#### 옵션 3: pdf2pic + GraphicsMagick (Render에서 복잡)
- 단점: Render 환경에서 GraphicsMagick 설치 복잡

---

## 다음 세션 작업 순서

### 1단계: Gemini Vision으로 PDF 급여대장 추출 (최우선)

**파일**: `src/services/ai-extraction.service.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

export async function extractWageLedgerWithVision(
  pdfPath: string
): Promise<AIExtractionResult<WageLedgerData>> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // PDF를 base64로 읽기 (Gemini는 PDF 직접 지원)
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const prompt = `당신은 한국 급여대장/임금대장 전문가입니다.

이 PDF는 급여대장입니다. 테이블에서 각 직원의 정보를 정확히 추출하세요.

## 추출 규칙
1. 테이블의 각 행에서 직원 정보 추출
2. 부서명/소계/합계 행은 제외
3. 사람 이름만 추출 (2~4글자 한글)

## JSON 형식으로 응답
{
  "period": "YYYY-MM",
  "employees": [
    {
      "name": "홍길동",
      "residentRegistrationNumber": "900101-1234567",
      "hireDate": "2024-01-01",
      "position": "대리",
      "department": "영업부",
      "monthlyWage": 3500000
    }
  ],
  "totalWage": 35000000
}`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: pdfBase64,
        mimeType: 'application/pdf',
      },
    },
  ]);

  const text = result.response.text();
  // JSON 파싱 및 정제...
}
```

### 2단계: extraction.service.ts 수정

**파일**: `src/services/extraction.service.ts`
**위치**: `processExtraction` 메소드 (line 122 부근)

```typescript
// PDF 급여대장 → Gemini Vision 사용
const isPdf = document.path.toLowerCase().endsWith('.pdf');

if (isPdf && documentType === DocumentType.WAGE_LEDGER) {
  console.log(`[Extraction] Using Gemini Vision for PDF wage ledger`);

  try {
    const visionResult = await extractWageLedgerWithVision(document.path);

    if (visionResult.data && visionResult.confidence > 50) {
      const result: ExtractionResult = {
        jobId: job.id,
        documentId: document.id,
        documentType,
        status: ExtractionStatus.COMPLETED,
        extractedData: visionResult.data,
        rawText: '[Gemini Vision]',
        confidence: visionResult.confidence,
        errors: visionResult.errors,
        processingTime: Date.now() - startTime,
      };

      job.status = ExtractionStatus.COMPLETED;
      job.completedAt = new Date().toISOString();
      await saveJsonFile(this.getJobPath(job.id), { job, result });
      return;
    }
  } catch (visionError) {
    console.error('[Extraction] Vision extraction failed:', visionError);
  }

  // Vision 실패 시 기존 OCR 방식으로 fallback
  console.log(`[Extraction] Falling back to OCR`);
}

// ... 기존 OCR + AI 추출 로직 ...
```

### 3단계: 환경 변수 확인

Render 환경변수에 `GEMINI_API_KEY`가 설정되어 있는지 확인.

---

## 테스트 체크리스트

### PDF 급여대장 추출 (다음 세션)
- [ ] `extractWageLedgerWithVision` 함수 구현
- [ ] `processExtraction`에 Vision 분기 추가
- [ ] 로컬 테스트 (macOS)
- [ ] Render 배포 후 테스트
- [ ] PDF 급여대장 추출 성공 확인

### 다중 급여대장 병합 (재테스트 필요)
- [ ] Excel 급여대장 3개 업로드 → 모든 직원 합쳐져서 표시
- [ ] 중복 직원 제거 확인
- [ ] 로그 확인: `[WageLedger Merge] 3개 급여대장 병합 완료`

---

## 파일 위치 참조

| 파일 | 역할 | 수정 필요 |
|------|------|-----------|
| `src/services/extraction.service.ts` | 추출 진입점 | ✅ Vision 분기 추가 |
| `src/services/ai-extraction.service.ts` | AI 추출 로직 | ✅ Vision 함수 추가 |
| `src/services/ocr.service.ts` | OCR 서비스 | - |
| `src/controllers/subsidy.controller.ts` | 다중 급여대장 병합 | - |

---

## 기술 스택 현황

| 구분 | 기술 |
|------|------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Node.js + Express + TypeScript |
| OCR | Claude Vision API (AI 추출) |
| PDF 생성 | jsPDF + html2canvas |
| 배포 | Vercel (Frontend) + Render (Backend) |
| **추가 예정** | Gemini Vision API (PDF 급여대장용) |

---

## 배포 정보

| 서비스 | URL |
|--------|-----|
| Frontend | https://goyoung-subsidy.vercel.app |
| Backend | https://labor-subsidy-api.onrender.com |
| GitHub | https://github.com/sang-su0916/labor-subsidy-automation |
