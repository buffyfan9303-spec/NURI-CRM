# NURI CRM — Next.js

맞춤양복 · 공장 · 원단 통합 관리 시스템.
기존 단일 HTML 프로토타입(`../NURI-CRM.html`)을 Next.js 14 + TypeScript +
Tailwind CSS + Zustand 기반으로 재구축하는 프로젝트.

## 스택

| 영역 | 도구 |
|---|---|
| 프레임워크 | Next.js 14 (App Router) + TypeScript |
| 스타일링 | Tailwind CSS + CSS Variables |
| 상태 관리 | Zustand (+ persist) |
| 폼 / 검증 | react-hook-form + zod |
| 아이콘 | @tabler/icons-react |
| 날짜 | date-fns |
| QR 생성 | qrcode.react |
| QR 스캔 | @yudiel/react-qr-scanner |
| 인쇄 | react-to-print |

## 시작하기

```bash
npm install
npm run dev
```

→ http://localhost:3000 접속

## 개발 단계

- [x] **Phase 1.1** — 부트스트랩 (디자인 토큰 + Tailwind 매핑)
- [ ] Phase 1.2 — 타입 정의 + 시드 데이터
- [ ] Phase 1.3 — Zustand 스토어 7종
- [ ] Phase 1.4 — 레이아웃 셸 (Sidebar / Topbar / Theme)
- [ ] Phase 1.5 — 대시보드
- [ ] Phase 1.6 — 고객 흐름 (등록 / 조회 / 상세 / 수정)
- [ ] Phase 1.7 — 주문 + 칸반 보드
- [ ] Phase 1.8 — 나머지 9개 뷰
- [ ] Phase 2.1 — QR 생성 (주문 단위)
- [ ] Phase 2.2 — 스캐너 뷰 (카메라)
- [ ] Phase 2.3 — 상태 전이 트랜잭션

## 폴더 구조 (계획)

```
nuri-crm-next/
├── app/                  # Next.js App Router 페이지
├── components/           # UI 컴포넌트 (layout, customer, order, …)
├── lib/                  # stores · api · utils · constants · validators
├── types/                # 도메인 타입
├── hooks/                # 커스텀 훅
└── public/               # 정적 리소스
```

## 디자인 시스템

모든 색상 토큰은 `app/globals.css` 의 CSS 변수로 정의되며,
`tailwind.config.ts` 에서 `bg-bg`, `text-acc`, `border-bd` 등의 유틸리티로 노출된다.
다크 모드는 `document.body.classList.toggle('dk')` 로 토글한다 (기존 로직 보존).
