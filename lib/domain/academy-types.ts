/**
 * 학원 도메인 클라이언트 안전 상수/타입. `academy.ts`는 next/headers(getServerSupabase)를
 * import해서 "use client" 컴포넌트가 그 파일에서 값(함수·상수)을 가져오면 서버 전용 코드까지
 * 번들에 끌려 들어가 빌드가 깨진다(rental-types.ts / calendar-shared.ts와 같은 분리 이유).
 * 타입만 쓸 거면 계속 `import type ... from "@/lib/domain/academy"`를 쓰면 된다 — 값(상수)이
 * 필요할 때만 이 파일에서 가져온다.
 */
export const CONSULT_STATUSES = ["신규", "상담완료", "등록", "보류", "이탈"] as const;
export type ConsultStatus = (typeof CONSULT_STATUSES)[number];
