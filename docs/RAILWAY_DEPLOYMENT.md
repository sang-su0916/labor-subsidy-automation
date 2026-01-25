# Railway 배포 가이드

## 준비물
- Railway 계정 (https://railway.app - GitHub 로그인 가능)
- 이 프로젝트의 GitHub 레포: https://github.com/sang-su0916/labor-subsidy-automation

## 배포 순서

### 1. Railway 프로젝트 생성
1. https://railway.app 접속
2. **New Project** 클릭
3. **Deploy from GitHub repo** 선택
4. `sang-su0916/labor-subsidy-automation` 선택

### 2. 환경변수 설정
Railway 프로젝트 → **Variables** 탭에서 추가:

| 변수명 | 값 |
|--------|-----|
| `NODE_ENV` | `production` |

(`PORT`, `RAILWAY_PUBLIC_DOMAIN`은 자동 제공됨)

### 3. 배포 시작
- 자동으로 빌드 시작됨
- 빌드 로그 확인: **Deployments** 탭
- 완료 시 **Settings** → **Public Networking**에서 URL 확인

### 4. URL 공유
생성된 URL (예: `https://labor-subsidy-automation-production.up.railway.app`)을 테스터에게 공유

## 빌드 시간
- 첫 배포: 약 3~5분
- 이후 배포: 약 2~3분

## 트러블슈팅

### 빌드 실패 시
- Railway 로그 확인: **Deployments** → 실패한 배포 클릭
- 일반적인 원인: `npm install` 실패 → `package-lock.json` 확인

### 파일 업로드가 저장되지 않음
- Railway는 기본적으로 ephemeral 파일 시스템 사용
- 영구 저장 필요 시: **Volumes** 추가 (`packages/backend/data`)

### CORS 오류
- Railway 환경변수에 `RAILWAY_PUBLIC_DOMAIN`이 자동 설정되었는지 확인
- 백엔드 로그에서 `allowedOrigins` 출력 확인

## 비용
- 무료 플랜: $5 크레딧 제공 (약 500시간 실행 가능)
- 한 달 상시 실행 가능
- 무료 크레딧 소진 후: $5/월

## 다음 단계
배포 완료 후 테스터에게 URL 공유하여 피드백 수집
