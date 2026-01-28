# 노무법인 같이 로고 및 연락처 추가

## Context

### Original Request
사용자가 제공한 "노무법인 같이" 로고 이미지를 시스템에 추가하고, 연락처 "02-6949-4974"를 함께 표시

### Logo Details
- **노무법인 같이** 로고
- 색상: 브라운 (#8B5A3C)
- 구조: 왼쪽 문서 아이콘 심볼 + 오른쪽 텍스트 ("노무법인" 위, "같이" 아래)
- 연락처: 02-6949-4974

---

## Work Objectives

### Core Objective
웹 애플리케이션 헤더와 PDF 보고서에 노무법인 같이 브랜딩 추가

### Concrete Deliverables
1. Header 컴포넌트에 로고 + 연락처 표시
2. PDF 보고서(노무사용 양식)에 로고 + 연락처 추가
3. 반응형 디자인 (모바일에서도 적절히 표시)

### Definition of Done
- [x] 헤더에 "노무법인 같이" 텍스트 + 전화번호 클릭 가능 버튼 표시
- [x] PDF 보고서 상단에 로고 + 연락처 표시
- [x] `npm run build` 성공
- [x] 브라우저 테스트 통과 (헤더 확인)

### Must Have
- 브라운 색상 (#8B5A3C) 일관성 유지
- 전화번호 클릭 시 전화 걸기 기능 (`tel:` 링크)
- 모바일 반응형 디자인

### Must NOT Have (Guardrails)
- 기존 네비게이션 레이아웃 변경 금지
- 로고 크기가 헤더 높이를 넘지 않도록 (최대 h-16 기준)
- PDF에서 한글 폰트 깨짐 방지 (Noto Sans CJK KR 사용)

---

## Verification Strategy

### Manual QA Only

**By Deliverable Type:**

**Frontend/UI:**
- Navigate to: `http://localhost:5173`
- Verify: 헤더 우측에 "노무법인 같이" + "02-6949-4974" 버튼 표시
- Interact: 전화번호 클릭 시 전화 걸기 다이얼로그 표시 (모바일/데스크톱)
- Screenshot: `.sisyphus/evidence/header-logo.png`

**PDF Output:**
- PDF 다운로드 실행
- Verify: PDF 상단에 "노무법인 같이" + "02-6949-4974" 표시
- Verify: 한글 폰트 정상 렌더링

**Evidence Required:**
- [x] 헤더 스크린샷 (데스크톱)
- [x] PDF 첫 페이지 스크린샷
- [x] 빌드 성공 로그

---

## Task Flow

```
Task 1 (Header 수정) → Task 2 (PDF 수정) → Task 3 (빌드 + 테스트)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 2 | 독립 | PDF 서비스는 별도 파일 |
| 3 | 1, 2 | 모든 수정 완료 후 빌드 |

---

## TODOs

- [x] 1. Header 컴포넌트에 노무법인 같이 브랜딩 추가

  **What to do**:
  - `packages/frontend/src/components/layout/Header.tsx` 수정
  - 헤더 왼쪽(로고) 우측에 새 섹션 추가:
    - "노무법인 같이" 텍스트 (브라운 색상 #8B5A3C)
    - "지원금 문의" 서브텍스트
    - 전화번호 버튼 (`tel:02-6949-4974`)
  - 구분선 추가 (`border-l border-slate-200`)
  - 반응형: 작은 화면에서는 전화번호만 아이콘으로 표시

  **Must NOT do**:
  - 기존 네비게이션 위치 변경 금지
  - 헤더 높이 변경 금지 (h-16 유지)

  **Parallelizable**: NO (독립 작업이나 순차 진행 권장)

  **References**:

  **Pattern References**:
  - `packages/frontend/src/components/layout/Header.tsx:17-24` - 현재 헤더 로고 구조

  **Design Pattern**:
  ```tsx
  <div className="flex items-center gap-6">
    {/* 기존 로고 */}
    <Link to="/" className="flex items-center gap-2">
      ...
    </Link>
    
    {/* 새 섹션: 노무법인 같이 */}
    <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
      <div className="flex flex-col text-xs">
        <span className="text-[#8B5A3C] font-semibold">노무법인 같이</span>
        <span className="text-slate-600">지원금 문의</span>
      </div>
      <a 
        href="tel:02-6949-4974" 
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8B5A3C] text-white rounded-lg hover:bg-[#6D4830] transition-colors text-sm font-medium"
      >
        <svg>전화 아이콘</svg>
        02-6949-4974
      </a>
    </div>
  </div>
  ```

  **Acceptance Criteria**:

  **Manual Execution Verification:**

  **For Frontend/UI changes:**
  - [ ] Using browser:
    - Navigate to: `http://localhost:5173`
    - Verify: 헤더 우측에 "노무법인 같이" 텍스트 표시
    - Verify: "02-6949-4974" 버튼이 브라운 색상으로 표시
    - Action: 전화번호 클릭
    - Verify: `tel:` 링크가 작동 (모바일에서 전화 다이얼로그 표시)
    - Screenshot: 브라우저 화면 캡처

  **Evidence Required:**
  - [ ] 헤더 스크린샷 저장

  **Commit**: YES
  - Message: `feat(header): 노무법인 같이 로고 및 연락처 추가`
  - Files: `packages/frontend/src/components/layout/Header.tsx`
  - Pre-commit: `npm run build`

---

- [x] 2. PDF 보고서에 노무법인 같이 브랜딩 추가

  **What to do**:
  - `packages/frontend/src/services/laborAttorneyReportService.ts` 수정
  - PDF 첫 페이지 상단에 헤더 섹션 추가:
    - 좌측: "노무법인 같이" (브라운 색상)
    - 우측: "지원금 문의: 02-6949-4974"
  - 기존 타이틀 아래 위치 (reportTitle 위)
  - Noto Sans CJK KR 폰트 사용 (기존 설정 활용)

  **Must NOT do**:
  - 기존 PDF 레이아웃 크게 변경 금지
  - 페이지 여백 침범 금지

  **Parallelizable**: YES (Header와 독립)

  **References**:

  **Pattern References**:
  - `packages/frontend/src/services/laborAttorneyReportService.ts:43-45` - Noto Sans CJK KR 폰트 설정
  - `packages/frontend/src/services/laborAttorneyReportService.ts:60-80` - PDF 헤더 생성 패턴

  **Implementation Guide**:
  ```typescript
  // PDF 첫 페이지 상단에 추가
  doc.setFontSize(10);
  doc.setTextColor(139, 90, 60); // #8B5A3C
  doc.text('노무법인 같이', 20, 15);
  
  doc.setTextColor(100, 100, 100);
  doc.text('지원금 문의: 02-6949-4974', 150, 15);
  
  // 구분선
  doc.setDrawColor(200, 200, 200);
  doc.line(20, 18, 190, 18);
  ```

  **Acceptance Criteria**:

  **Manual Execution Verification:**

  **For PDF changes:**
  - [ ] Generate PDF:
    - 웹에서 "노무사용 양식 다운로드" 클릭
    - PDF 파일 다운로드
  - [ ] Verify:
    - PDF 첫 페이지 상단에 "노무법인 같이" 표시 (브라운 색상)
    - "지원금 문의: 02-6949-4974" 우측에 표시
    - 한글 폰트 정상 렌더링 (깨짐 없음)
  - [ ] Screenshot: PDF 첫 페이지 캡처

  **Evidence Required:**
  - [ ] PDF 파일 생성 확인
  - [ ] PDF 첫 페이지 스크린샷

  **Commit**: YES
  - Message: `feat(pdf): 노무사용 양식에 노무법인 같이 브랜딩 추가`
  - Files: `packages/frontend/src/services/laborAttorneyReportService.ts`
  - Pre-commit: `npm run build`

---

- [x] 3. 빌드 및 전체 테스트

  **What to do**:
  - `npm run build` 실행
  - TypeScript 컴파일 오류 확인
  - 브라우저 테스트 (localhost:5173)
  - PDF 다운로드 테스트

  **Parallelizable**: NO (모든 작업 완료 후)

  **References**:
  - 프로젝트 루트 `package.json` - 빌드 스크립트

  **Acceptance Criteria**:

  **Manual Execution Verification:**

  - [ ] Build:
    - Command: `npm run build`
    - Expected: Exit code 0, no TypeScript errors
    - Evidence: 빌드 로그 캡처

  - [ ] Browser Test:
    - Start dev server: `cd packages/frontend && npm run dev`
    - Navigate: `http://localhost:5173`
    - Verify: 헤더에 "노무법인 같이" + 전화번호 표시
    - Verify: 전화번호 클릭 시 `tel:` 링크 작동
    - Evidence: 브라우저 스크린샷

  - [ ] PDF Test:
    - 직원 정보 입력 후 "노무사용 양식 다운로드" 클릭
    - Verify: PDF 다운로드 성공
    - Verify: PDF 첫 페이지에 "노무법인 같이" 브랜딩 표시
    - Evidence: PDF 스크린샷

  **Evidence Required:**
  - [ ] 빌드 성공 로그
  - [ ] 브라우저 테스트 스크린샷
  - [ ] PDF 테스트 스크린샷

  **Commit**: NO (최종 검증 단계)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(header): 노무법인 같이 로고 및 연락처 추가` | Header.tsx | npm run build |
| 2 | `feat(pdf): 노무사용 양식에 노무법인 같이 브랜딩 추가` | laborAttorneyReportService.ts | npm run build |

---

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: ✓ built successfully
cd packages/frontend && npm run dev  # Start dev server
```

### Final Checklist
- [x] 헤더에 "노무법인 같이" + "02-6949-4974" 표시
- [x] 전화번호 클릭 시 `tel:` 링크 작동
- [x] PDF에 "노무법인 같이" 브랜딩 표시
- [x] 빌드 성공
- [x] 브라우저 테스트 통과
