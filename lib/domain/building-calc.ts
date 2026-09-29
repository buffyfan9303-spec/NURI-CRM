/**
 * 건물 관리비 계산 규격 — SQL(0031 crm.bld_allocate / bld_vat_of / bld_split_incl_vat / bld_late_fee)과 같은 식의 TS 판.
 * 화면 미리보기·테스트용이다. **확정 금액은 서버(SQL)가 계산한다** — 이 파일의 결과를 저장하지 않는다.
 * 원 단위 정수. 부동소수점 배분 금지: 분자·분모를 정수 스케일로 올려 BigInt 로 계산한다.
 */
import type { LateTerms } from "@/lib/domain/building-types";

export const VAT_RATE = 0.1;

/** 0.5 는 올림(양·음 같은 방향) — SQL crm.bld_round(floor(x+0.5)) 와 동일. Math.round 가 그 식이고, -0 만 0 으로 정리한다. */
const roundHalfUp = (x: number) => Math.round(x) || 0;
/** 세액 = round(공급가액 × 10%) — SQL bld_vat_of 와 동일. */
export function vatOf(supply: number): number {
  return roundHalfUp(supply * VAT_RATE);
}
/** 부가세 포함 금액 → {supply, vat}. SQL bld_split_incl_vat 와 동일. */
export function splitInclVat(amount: number): { supply: number; vat: number } {
  const supply = roundHalfUp(amount / (1 + VAT_RATE));
  return { supply, vat: amount - supply };
}

export interface AllocRow<Id = string> { id: Id; amount: number; raw: number; adjust: 0 | 1 }

/**
 * 최대잉여법 1원 배정. 원천 총액을 가중치 비례로 내림한 뒤, 잔액을 소수부 큰 순(동률은 id 오름차순)으로 1원씩 준다.
 * 합계 = 총액을 보장한다. 가중치 합이 0 이면 zero_denominator.
 */
export function allocateLargestRemainder<Id extends string>(total: number, weights: { id: Id; w: number }[]): AllocRow<Id>[] {
  if (!Number.isInteger(total)) throw new Error("invalid_total: 원 단위 정수여야 합니다");
  if (weights.length === 0) return [];
  // 가중치를 정수 스케일(소수 6자리)로 올려 BigInt 로 정확히 나눈다.
  const ws = weights.map((x) => BigInt(Math.round(x.w * 1_000_000)));
  const wsum = ws.reduce((a, b) => a + b, 0n);
  if (wsum === 0n) throw new Error("zero_denominator: 배분 기준(면적·지분·사용량) 합이 0 입니다");
  const T = BigInt(total);
  const rows = weights.map((x, i) => {
    const num = T * ws[i]; // total × w
    // floor for negatives too(sum(floor) ≤ total → 잔액 ≥ 0)
    let fl = num / wsum;
    if (num % wsum !== 0n && num < 0n) fl -= 1n;
    const frac = num - fl * wsum; // 0 ≤ frac < wsum
    return { id: x.id, fl, frac, raw: Number(num) / Number(wsum) };
  });
  let rem = T - rows.reduce((a, r) => a + r.fl, 0n);
  const order = [...rows].sort((a, b) => (a.frac === b.frac ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.frac > b.frac ? -1 : 1));
  const adj = new Set<Id>();
  for (const r of order) { if (rem <= 0n) break; adj.add(r.id); rem -= 1n; }
  return rows.map((r) => ({ id: r.id, amount: Number(r.fl) + (adj.has(r.id) ? 1 : 0), raw: r.raw, adjust: adj.has(r.id) ? 1 : 0 }));
}

export function lateTermsReady(t: LateTerms): boolean {
  return t.late_rate != null && t.late_rate_unit != null && t.late_method != null && t.late_grace_days != null && t.late_basis != null
    && t.late_partial_order != null && (t.late_cap_pct != null || t.late_cap_none) && t.late_approved_by != null && t.late_approved_at != null;
}

export interface LateFeeResult { amount: number; days: number; from?: string; to?: string }
/** 0033: 창(window) 계산 — from 은 마지막 부과일 다음날, chargedBefore 는 이 채권에 이미 부과한 연체료 합(누적 상한용). */
export interface LateFeeWindow { from?: string; chargedBefore?: number }

const dayMs = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * 연체료 — 계약 승인값만. 기본 이율 없음. 부가세율(VAT_RATE)을 참조하지 않는다(테스트가 본문을 검사한다).
 * SQL bld_late_fee 와 같은 식: 단리 annual/365·monthly/30·daily, 월복리(30일 단위), 내림, 상한(원금 × cap% − 기부과액).
 * 매달 겹치지 않게: 다음 달은 window.from = 이전 to_date + 1 로 부른다(서버 bld_calculate 와 동일).
 */
export function lateFee(t: LateTerms, principal: number, dueDate: string, asOf: string, window: LateFeeWindow = {}): LateFeeResult {
  if (!lateTermsReady(t)) throw new Error("late_terms_unapproved: 연체 조건이 전부 승인되지 않았습니다");
  if (principal <= 0) return { amount: 0, days: 0 };
  const base = toUtc(dueDate) + (t.late_grace_days! + 1) * dayMs;
  const from = window.from ? Math.max(base, toUtc(window.from)) : base;
  const to = toUtc(asOf);
  if (to < from) return { amount: 0, days: 0, from: iso(from), to: asOf };
  const days = Math.round((to - from) / dayMs) + 1;
  const rate = t.late_rate! / 100;
  let amount: number;
  if (t.late_method === "simple") {
    amount = t.late_rate_unit === "annual" ? (principal * rate * days) / 365 : t.late_rate_unit === "monthly" ? (principal * rate * days) / 30 : principal * rate * days;
  } else {
    const monthly = t.late_rate_unit === "annual" ? rate / 12 : t.late_rate_unit === "monthly" ? rate : rate * 30;
    const months = Math.floor(days / 30);
    const rest = days - months * 30;
    let bal = principal;
    for (let i = 0; i < months; i++) bal += Math.floor(bal * monthly);
    amount = bal - principal + (bal * monthly * rest) / 30;
  }
  amount = Math.floor(amount);
  if (!t.late_cap_none) amount = Math.min(amount, Math.max(Math.floor((principal * t.late_cap_pct!) / 100) - (window.chargedBefore ?? 0), 0));
  return { amount, days, from: iso(from), to: asOf };
}

/** 네 숫자: 납부 요청액 = 당월 부과 + 전월 미납 + 연체료 − 선납·감면(가용 크레딧 한도). */
export function amountDue(input: { currentCharge: number; priorUnpaid: number; lateFee: number; creditAvailable: number }): { credit: number; amountDue: number } {
  const gross = input.currentCharge + input.priorUnpaid + input.lateFee;
  const credit = Math.min(input.creditAvailable, Math.max(gross, 0));
  return { credit, amountDue: gross - credit };
}
