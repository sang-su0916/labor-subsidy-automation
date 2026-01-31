# 고용지원금 자동화 시스템

한국 고용지원금 신청을 자동화하는 웹 애플리케이션입니다. 사업자등록증, 임금대장, 근로계약서, 4대보험 가입자명부 등의 문서를 업로드하면 OCR로 데이터를 추출하고, 지원 가능한 고용지원금을 자동으로 분석합니다.

## 온라인 서비스 (바로 사용하기)

**설치 없이 바로 사용하세요!**

| 서비스 | URL |
|--------|-----|
| **웹 앱** | <https://goyoung-subsidy.vercel.app> |
| **API** | <https://labor-subsidy-api.onrender.com> |

> 📖 **사용법**: [사용자 매뉴얼](./사용자_매뉴얼.md) 참고

## 주요 기능

- **문서 업로드**: PDF, Excel, Word 파일 지원 (최대 100MB)
- **자동 데이터 추출**: OCR 및 문서 파싱으로 필요 정보 자동 추출
- **지원금 자격 분석**: 청년일자리도약장려금, 고용촉진장려금, 고용유지지원금, 고령자계속고용장려금 등 자동 분석
- **예상 지원액 계산**: 조건에 맞는 지원금의 예상 수령액 계산

## 지원하는 고용지원금 프로그램 (2026년 기준)

| 프로그램 | 지원 대상 | 지원 금액 | 지급 시기 |
|---------|----------|----------|----------|
| 청년일자리도약장려금 | 15~34세 청년 정규직 채용 | 기업지원금: 월 60만원 × 12개월 (720만원) + 비수도권 청년본인 장기근속인센티브 최대 720만원 별도 | 6개월 고용유지 후 신청, 심사 후 14일 이내 |
| 고용촉진장려금 | 취업취약계층 채용 | 월 30~60만원 × 최대 2년 | 6개월 단위 신청, 심사 후 14일 이내 |
| 고용유지지원금 | 경영악화 시 고용유지 | 휴업수당의 1/2~2/3 (1일 최대 66,000원, 연 180일) | 월 단위 사후 환급 |
| 고령자계속고용장려금 | 정년 연장/폐지/재고용 도입 기업 | 수도권 분기 90만원 (최대 1,080만원) / **비수도권 분기 120만원 (최대 1,440만원)** | 분기 단위 신청, 심사 후 14일 이내 |
| 고령자고용지원금 | 60세 이상 고령자 신규 채용 | 분기 30만원 × 2년 (최대 240만원) | 분기 단위 신청, 심사 후 14일 이내 |
| 출산육아기 고용안정장려금 | 육아휴직/근로시간 단축 허용 | 육아휴직 월 30만원 + 대체인력 월 120만원 + 업무분담 월 20만원 + 남성인센티브 월 10만원 | 3개월 단위 50% 신청, 종료 후 6개월 계속고용 시 잔여 50% |

## 기술 스택

### Frontend

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router DOM
- Axios

### Backend

- Node.js + Express + TypeScript
- Tesseract.js (OCR)
- pdf-parse, mammoth, xlsx (문서 파싱)
- multer (파일 업로드)
- Zod (유효성 검사)

## 프로젝트 구조

```
labor-subsidy-automation/
├── packages/
│   ├── frontend/          # React 프론트엔드
│   │   ├── src/
│   │   │   ├── components/  # UI 컴포넌트
│   │   │   ├── pages/       # 페이지 컴포넌트
│   │   │   ├── services/    # API 서비스
│   │   │   └── types/       # TypeScript 타입
│   │   └── ...
│   ├── backend/           # Express 백엔드
│   │   ├── src/
│   │   │   ├── config/      # 설정
│   │   │   ├── controllers/ # 컨트롤러
│   │   │   ├── middleware/  # 미들웨어
│   │   │   ├── routes/      # 라우트
│   │   │   ├── services/    # 비즈니스 로직
│   │   │   ├── types/       # TypeScript 타입
│   │   │   └── utils/       # 유틸리티
│   │   └── ...
│   └── shared/            # 공유 타입
└── package.json           # 모노레포 설정
```

## 설치 및 실행

### 사전 요구사항

- Node.js 18+
- npm 9+

### 설치

```bash
# 저장소 클론
git clone <repository-url>
cd labor-subsidy-automation

# 의존성 설치
npm install
```

### 개발 서버 실행

```bash
# 백엔드와 프론트엔드 동시 실행
npm run dev

# 또는 개별 실행
npm run dev:backend   # http://localhost:3010
npm run dev:frontend  # http://localhost:5173
```

### 빌드

```bash
npm run build
```

## API 엔드포인트

### 파일 업로드

- `POST /api/upload` - 단일 파일 업로드
- `POST /api/upload/batch` - 다중 파일 업로드
- `GET /api/upload/:sessionId` - 세션 문서 조회
- `PATCH /api/upload/document/:documentId/type` - 문서 유형 변경
- `DELETE /api/upload/document/:documentId` - 문서 삭제

### 데이터 추출

- `POST /api/extraction/start/:documentId` - 추출 시작
- `GET /api/extraction/result/:jobId` - 추출 결과 조회

### 지원금 계산

- `GET /api/subsidy/programs` - 지원금 프로그램 목록
- `POST /api/subsidy/calculate` - 지원금 자격 계산
- `POST /api/subsidy/report` - 보고서 생성

## 지원 문서 유형

- **사업자등록증** (BUSINESS_REGISTRATION)
- **임금대장** (WAGE_LEDGER)
- **근로계약서** (EMPLOYMENT_CONTRACT)
- **4대보험 가입자명부** (INSURANCE_LIST)

## 환경 변수

`.env.example`을 참고하여 `.env` 파일을 생성하세요:

```env
PORT=3010
NODE_ENV=development
```

## 라이선스

MIT
