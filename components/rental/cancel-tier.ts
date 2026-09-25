/**
 * 취소 단계표 항목 표시·비교(계약 v2 §5): 항목은 {min_days} 또는 {min_months} 둘 중 하나. 일반 모듈(클라이언트·서버 공용).
 */
import type { CancelCause, CancelTier } from "@/lib/domain/rental-money-types";

type TierLike = { min_days?: number | null; min_months?: number | null; rate: number };

export function tierLabel(t: TierLike, cause: CancelCause): string {
  if (t.min_months != null) return `${t.min_months}개월 전까지`;
  if (t.min_days === 0) return cause === "customer" ? "당일·연락두절" : "당일";
  return `${t.min_days ?? 0}일 전까지`;
}

/** 견적의 tier 와 정책표 항목이 같은 단계인가(비율 + 기간 단위·값). 견적에 min_months 가 없으면 min_days null + 같은 비율로 본다. */
export function sameTier(q: TierLike | null | undefined, t: CancelTier): boolean {
  if (!q || q.rate !== t.rate) return false;
  if (t.min_months != null) return q.min_months === t.min_months || (q.min_days == null && q.min_months == null);
  return q.min_days === t.min_days;
}

/** 정렬: 먼 기간 → 당일. 개월은 일보다 앞(1개월 > 15일). */
export function sortTiers(tiers: CancelTier[]): CancelTier[] {
  const key = (t: CancelTier) => (t.min_months != null ? 10_000 + t.min_months : t.min_days ?? 0);
  return [...tiers].sort((a, b) => key(b) - key(a));
}

/** 공정위 기본표(서버 기본값과 동일해야 한다 — 계약 v2 §5). */
export const CONSUMER_DEFAULT_TIERS: CancelTier[] = [
  { min_months: 1, rate: 0 }, { min_days: 15, rate: 10 }, { min_days: 7, rate: 30 }, { min_days: 3, rate: 50 }, { min_days: 1, rate: 80 }, { min_days: 0, rate: 100 },
];
export const BUSINESS_DEFAULT_TIERS: CancelTier[] = [
  { min_months: 1, rate: 0 }, { min_days: 7, rate: 10 }, { min_days: 5, rate: 30 }, { min_days: 3, rate: 50 }, { min_days: 1, rate: 80 }, { min_days: 0, rate: 100 },
];

/** 두 단계표가 같은 규정인가(정렬 후 기간·비율 비교). */
export function sameTiers(a: CancelTier[], b: CancelTier[]): boolean {
  const norm = (ts: CancelTier[]) => sortTiers(ts).map((t) => `${t.min_months != null ? `m${t.min_months}` : `d${t.min_days ?? 0}`}:${t.rate}`).join("|");
  return norm(a) === norm(b);
}

/**
 * 화면용 "공정위 기본 기준" 판정(결함 D8): 서버 is_default 는 규정을 한 번이라도 저장하면 false 가 되지만,
 * 저장한 내용이 기본표·24시간과 같으면 손님·직원에게는 기본 기준과 같은 규정이다.
 */
export function isDefaultPolicy(p: { customerTiers: CancelTier[]; businessTiers: CancelTier[]; contractGraceHours: number; isDefault: boolean } | null | undefined): boolean {
  if (!p) return true;
  return p.isDefault || (p.contractGraceHours === 24 && sameTiers(p.customerTiers, CONSUMER_DEFAULT_TIERS) && sameTiers(p.businessTiers, BUSINESS_DEFAULT_TIERS));
}
