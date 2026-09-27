/**
 * Supabase auth 호출 실패 중 "세션이 없다"가 아니라 "지금 잠깐 못 물어봤다"인 것을 가려낸다.
 * (네트워크 단절·502/503/504·429). 이 경우 로그인으로 보내면 멀쩡한 세션의 사용자가
 * 갑자기 로그인 화면으로 튕긴다(2026-09-28 신고 "자동으로 페이지가 이동"). 호출부는
 * 통과시켜 화면이 ErrorState 를 그리게 한다. 의존성 없음 — middleware(edge)에서도 import 한다.
 */
export function isTransientAuthError(e: { name?: string; status?: number } | null | undefined): boolean {
  if (!e) return false;
  return e.name === "AuthRetryableFetchError" || e.status === 429 || (e.status ?? 0) >= 500;
}
