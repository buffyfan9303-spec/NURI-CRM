import type { Customer, Measurements } from "@/types/customer";
import { MEASUREMENT_KEYS } from "@/types/customer";

/**
 * MTM 치수 완성도 (%) — 0~100.
 * 기존 _mtmComp 와 동일 (14항목 중 0이 아닌 항목 비율).
 *
 * 80↑ → 초록, 50↑ → 노랑, 그 외 → 빨강 (UI 측에서 색 결정).
 */
export function mtmCompleteness(c: Pick<Customer, keyof Measurements>): number {
  const filled = MEASUREMENT_KEYS.filter((k) => {
    const v = c[k];
    return v && Number(v) !== 0;
  }).length;
  return Math.round((filled / MEASUREMENT_KEYS.length) * 100);
}

export function mtmCompletenessColor(pct: number): "ok" | "warn" | "err" {
  if (pct >= 80) return "ok";
  if (pct >= 50) return "warn";
  return "err";
}
