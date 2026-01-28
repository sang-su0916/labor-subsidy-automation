# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
npm run clean    # Remove dist directory
```

Deploy: `vercel --prod` then update alias with `vercel alias set <deployment-url> goyoung-subsidy.vercel.app`

## Architecture

React 18 + TypeScript + Vite application for Korean employment subsidy automation (고용지원금 자동화).

**Core Flow**: Password Gate → Home → Upload/Manual Input → Extraction → Subsidy Calculation → Report Generation

### Key Directories

- `src/pages/` - Route pages (HomePage, UploadPage, ManualInputPage, ExtractionPage, SubsidyPage, ReportPage)
- `src/services/` - API calls and business logic (subsidyService for eligibility, laborAttorneyReportService for PDF forms)
- `src/components/common/` - Reusable UI (Button, Card, Badge, LoadingSpinner)
- `src/types/` - TypeScript definitions for documents, extraction, subsidies, labor attorney forms
- `src/fonts/` - Korean font imports (Pretendard via CDN)

### API Proxy

Dev server proxies `/api/*` to `http://localhost:3010` (backend). Production uses Render backend at `labor-subsidy-api.onrender.com`.

### Authentication

Session-based password gate (`PasswordGate.tsx`). Password configured via `VITE_SITE_PASSWORD` env var, defaults to `goyoung2026`.

## Subsidy Programs Supported

6 Korean employment subsidy programs defined in `src/types/subsidy.types.ts`:
- 청년일자리도약장려금 (Youth Job Leap)
- 고용촉진장려금 (Employment Promotion)
- 고용유지지원금 (Employment Retention)
- 고령자계속고용장려금 (Senior Continued Employment)
- 고령자고용지원금 (Senior Employment Support)
- 출산육아기 고용안정장려금 (Parental Employment Stability)

## Styling

TailwindCSS with custom Pretendard/Noto Sans KR fonts. Path alias `@/*` maps to `./src/*`.
