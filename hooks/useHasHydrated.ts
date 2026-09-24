/**
 * Zustand persist 의 localStorage 복원이 완료됐는지 추적.
 * SSR 후 첫 클라이언트 렌더에서는 항상 false 였다가, useEffect 발화 후 true.
 *
 * AuthGuard 가 이 값을 보고 "아직 모름 → 로딩 표시" / "복원 완료 → 판정" 분기.
 */
"use client";

import { useEffect, useState } from "react";

export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
