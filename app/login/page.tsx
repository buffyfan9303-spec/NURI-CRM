/**
 * 로그인 페이지 — 서버 래퍼.
 * ?from=/?err= 쿼리에 따라 문구가 달라지므로 정적 프리렌더 대상이 아니다(항상 요청 시 렌더).
 */
import { Suspense } from "react";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
