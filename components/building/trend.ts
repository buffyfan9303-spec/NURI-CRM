/**
 * 건물 전체 12개월 흐름 + 전년 같은 달 비교의 순수 계산. 금액은 서버(bld_report_categories)가 준 월 합계를 그대로 옮기고
 * 새 금액을 만들지 않는다. 확정하지 않은 달은 totals 에 없고(null) 0원으로 취급하지 않는다.
 */
import { addMonths } from "@/components/building/period";

export interface TrendMonth {
  period: string;
  /** 이 달 확정 관리비 합계. 확정 전이면 null. */
  cur: number | null;
  /** 1년 전 같은 달. 확정 전이면 null. */
  prevYear: number | null;
  /** cur − prevYear (둘 다 있을 때만). */
  diff: number | null;
  /** diff / prevYear (둘 다 있고 prevYear 가 0 이 아닐 때만). */
  pct: number | null;
}

/** `end` 달까지 12개월(오래된 → 최신). totals = 확정된 달의 합계만 든 Map. */
export function trendMonths(end: string, totals: ReadonlyMap<string, number>): TrendMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const period = addMonths(end, i - 11);
    const cur = totals.get(period) ?? null;
    const prevYear = totals.get(addMonths(period, -12)) ?? null;
    const diff = cur !== null && prevYear !== null ? cur - prevYear : null;
    return { period, cur, prevYear, diff, pct: diff !== null && prevYear ? diff / prevYear : null };
  });
}

/** 표에서 확정 여부를 가려 읽어야 할 달(12개월 + 각 달의 전년 = 24개월). */
export const trendWindow = (end: string): string[] => Array.from({ length: 24 }, (_, i) => addMonths(end, i - 23));
