/**
 * 렌탈 돈 흐름 조회(0027). 서버 전용(getServerSupabase → next/headers) — Server Component 와 서버 액션에서만 import.
 * 권한은 RPC 가 첫 줄에서 검사한다(revenue.read 없으면 42501 → 여기서는 {masked} 또는 오류 문구로 번역만).
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { pgError } from "./rental-action-kit";
import type { ReadResult } from "./rental-types";
import type {
  CancelPolicy, CancelQuote, CancelCause, ReceivablesReport, ReceivableRow, DepositsHeld, CollectionLogRow,
  CustomerMoneySummary, FeePolicy, Statement, StatementEntry, AgingBucket, CollectionChannel,
} from "./rental-money-types";
export * from "./rental-money-types";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown): number | null => (v == null ? null : Number(v));
const num = (v: unknown): number => Number(v ?? 0);

function toPolicy(j: J): CancelPolicy {
  return {
    customerTiers: (j.customer_tiers as CancelPolicy["customerTiers"]) ?? [],
    businessTiers: (j.business_tiers as CancelPolicy["businessTiers"]) ?? [],
    contractGraceHours: num(j.contract_grace_hours ?? 24),
    isDefault: Boolean(j.is_default),
    source: String(j.source ?? ""),
  };
}

export function toCancelQuote(j: J): CancelQuote {
  return {
    masked: Boolean(j.masked), cause: j.cause as CancelCause, asOf: j.as_of, useDate: j.use_date, daysBefore: num(j.days_before),
    withinContractGrace: Boolean(j.within_contract_grace), contractGraceHours: num(j.contract_grace_hours), contractedAt: j.contracted_at,
    tier: { min_days: n(j.tier?.min_days), min_months: n(j.tier?.min_months), rate: num(j.tier?.rate), label: j.tier?.label ?? undefined }, rate: num(j.rate),
    policyIsDefault: Boolean(j.policy_is_default),
    baseFee: n(j.base_fee), computedAmount: n(j.computed_amount), overrideAmount: n(j.override_amount), effectiveAmount: n(j.effective_amount),
    limitToPaid: Boolean(j.limit_to_paid), cashReceived: n(j.cash_received), depositBalance: n(j.deposit_balance), depositForfeited: n(j.deposit_forfeited), paidFee: n(j.paid_fee),
    chargesToVoid: n(j.charges_to_void), penalty: n(j.penalty), compensation: n(j.compensation), refundCash: n(j.refund_cash),
    depositReturned: n(j.deposit_returned), receivableLeft: n(j.receivable_left), totalPayout: n(j.total_payout),
  };
}

/** 읽기 RPC 오류 → 사용자 문구. 42501 은 호출별 문구, 그 외는 pgError(hint 매핑, 원문 비노출). "함수 없음"(구 DB, PGRST202) 은 적용 안내. */
function rpcMessage(e: { code?: string; message: string; hint?: string | null }, forbidden: string): string {
  if (e.code === "42501") return forbidden;
  if (e.code === "PGRST202" || /Could not find the function/i.test(e.message ?? "")) return "이 기능은 DB 업데이트(0027) 후에 사용할 수 있습니다.";
  return pgError(e);
}

/** 취소 규정(사업장 값 또는 공정위 기본값). is_member. */
export async function getCancelPolicy(businessId: string): Promise<ReadResult<CancelPolicy>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_get_cancel_policy", { p_business: businessId });
  if (error) return { ok: false, message: rpcMessage(error, "이 사업장의 구성원이 아닙니다."), hint: error.hint ?? undefined };
  return { ok: true, data: toPolicy(data as J) };
}

/** 취소 견적(계산만, 서버 now() 기준). 회원이면 호출 가능, revenue.read 없으면 masked. 실행 시 quote.rate 를 expectedRate 로 넘긴다. */
export async function getCancelQuote(
  reservationId: string, cause: CancelCause, opts?: { overrideAmount?: number | null; limitToPaid?: boolean }
): Promise<ReadResult<CancelQuote>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_cancel_quote", {
    p_reservation: reservationId, p_cause: cause,
    p_override_amount: opts?.overrideAmount ?? null, p_limit_to_paid: opts?.limitToPaid ?? true,
  });
  if (error) return { ok: false, message: rpcMessage(error, "이 사업장의 구성원이 아닙니다."), hint: error.hint ?? undefined };
  return { ok: true, data: toCancelQuote(data as J) };
}

/** 미수 연령 분석(revenue.read). 42501 이면 {masked:true}. */
export async function getReceivables(businessId: string, asOf?: string): Promise<ReadResult<ReceivablesReport | { masked: true }>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_receivables", { p_business: businessId, p_as_of: asOf ?? null });
  if (error) {
    if (error.code === "42501") return { ok: true, data: { masked: true } };
    return { ok: false, message: rpcMessage(error, "") };
  }
  const j = data as J;
  const rows: ReceivableRow[] = ((j.rows as J[]) ?? []).map((r) => ({
    reservationId: r.reservation_id, customerRef: r.customer_ref ?? null, customerName: r.customer_name ?? null, customerPhone: r.customer_phone ?? null,
    status: r.status, periodStart: r.period_start, periodEnd: r.period_end, outstanding: num(r.outstanding), dueDate: r.due_date,
    daysOverdue: num(r.days_overdue), bucket: r.bucket as AgingBucket, lastContactAt: r.last_contact_at ?? null,
    lastContactChannel: (r.last_contact_channel as CollectionChannel) ?? null, promisedPayDate: r.promised_pay_date ?? null,
  }));
  const byBucket: ReceivablesReport["byBucket"] = {};
  for (const [k, v] of Object.entries((j.by_bucket as J) ?? {})) byBucket[k as AgingBucket] = { count: num((v as J).count), total: num((v as J).total) };
  return { ok: true, data: { asOf: j.as_of, total: num(j.total), count: num(j.count), byBucket, rows } };
}

/** 보관 중 보증금 목록·합계(revenue.read). 42501 이면 {masked:true}. */
export async function getDepositsHeld(businessId: string): Promise<ReadResult<DepositsHeld | { masked: true }>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_deposits_held", { p_business: businessId });
  if (error) {
    if (error.code === "42501") return { ok: true, data: { masked: true } };
    return { ok: false, message: rpcMessage(error, "") };
  }
  const j = data as J;
  return {
    ok: true,
    data: {
      count: num(j.count), total: num(j.total),
      rows: ((j.rows as J[]) ?? []).map((r) => ({
        reservationId: r.reservation_id, customerRef: r.customer_ref ?? null, customerName: r.customer_name ?? null, status: r.status,
        periodStart: r.period_start, periodEnd: r.period_end, depositBalance: num(r.deposit_balance), depositRequired: n(r.deposit_required), outstanding: num(r.outstanding),
      })),
    },
  };
}

/** 독촉 기록 목록 — 테이블 RLS(revenue.read)가 적용된다. 권한 없으면 0행(masked 판단은 호출부의 caps 로). */
export async function listCollectionLogs(businessId: string, reservationId: string): Promise<ReadResult<CollectionLogRow[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("rental_collection_logs").select("*")
    .eq("business_id", businessId).eq("reservation_id", reservationId).order("contacted_at", { ascending: false });
  if (error) return { ok: false, message: rpcMessage(error, "독촉 기록 조회 권한(revenue.read)이 없습니다.") };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string, reservationId: r.reservation_id as string, contactedAt: r.contacted_at as string, channel: r.channel as CollectionChannel,
      note: (r.note as string) ?? null, promisedPayDate: (r.promised_pay_date as string) ?? null, createdBy: (r.created_by as string) ?? null,
    })),
  };
}

/** 고객별 미수·보관 보증금 요약. 회원이면 호출 가능 — revenue.read 없으면 여부(has_*)만. 예약 생성 화면의 "미수 있음" 경고에 쓴다. */
export async function getCustomerMoneySummary(customerId: string): Promise<ReadResult<CustomerMoneySummary>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_customer_money_summary", { p_customer: customerId });
  if (error) return { ok: false, message: rpcMessage(error, "이 사업장의 구성원이 아닙니다."), hint: error.hint ?? undefined };
  const j = data as J;
  return {
    ok: true,
    data: {
      customerId: j.customer_id, masked: Boolean(j.masked), hasOutstanding: Boolean(j.has_outstanding), hasDeposit: Boolean(j.has_deposit),
      openReservations: num(j.open_reservations), reservationsWithOutstanding: num(j.reservations_with_outstanding),
      outstandingTotal: n(j.outstanding_total), depositHeldTotal: n(j.deposit_held_total),
    },
  };
}

/** 현재 유효한 연체료 정책(없으면 null). is_member. */
export async function getFeePolicy(businessId: string): Promise<ReadResult<FeePolicy | null>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_get_fee_policy", { p_business: businessId });
  if (error) return { ok: false, message: rpcMessage(error, "이 사업장의 구성원이 아닙니다.") };
  if (!data) return { ok: true, data: null };
  return { ok: true, data: toFeePolicy(data as J) };
}

export function toFeePolicy(j: J): FeePolicy {
  return { id: j.id, name: j.name, graceHours: num(j.grace_hours), lateFeePerDay: num(j.late_fee_per_day), lateFeeRate: n(j.late_fee_rate), damageDefault: num(j.damage_default), effectiveFrom: j.effective_from };
}

/** 거래명세서(revenue.read). 42501 이면 {masked:true}. 전화는 pii.read 없으면 null. */
export async function getStatement(reservationId: string): Promise<ReadResult<Statement | { masked: true }>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_statement", { p_reservation: reservationId });
  if (error) {
    if (error.code === "42501") return { ok: true, data: { masked: true } };
    return { ok: false, message: rpcMessage(error, "") };
  }
  const j = data as J;
  const entries: StatementEntry[] = ((j.entries as J[]) ?? []).map((e) => ({
    id: e.id, entryType: e.entry_type, amount: num(e.amount), direction: e.direction, method: e.method ?? null, stage: e.stage ?? null,
    approvalNo: e.approval_no ?? null, cashReceipt: e.cash_receipt ?? null, reason: e.reason ?? null, occurredAt: e.occurred_at,
    reversesId: e.reverses_id ?? null, reversedBy: e.reversed_by ?? null,
  }));
  return {
    ok: true,
    data: {
      reservation: {
        id: j.reservation.id, no: j.reservation.no, status: j.reservation.status, periodStart: j.reservation.period_start, periodEnd: j.reservation.period_end,
        fittingAt: j.reservation.fitting_at ?? null, confirmedAt: j.reservation.confirmed_at ?? null, depositRequired: n(j.reservation.deposit_required),
        createdAt: j.reservation.created_at, notes: j.reservation.notes ?? null,
      },
      business: { id: j.business.id, name: j.business.name },
      customer: { id: j.customer?.id ?? null, name: j.customer?.name ?? null, phone: j.customer?.phone ?? null },
      items: ((j.items as J[]) ?? []).map((i) => ({
        itemId: i.item_id, productName: i.product_name, productCode: i.product_code, color: i.color ?? null, size: i.size ?? null, unitCode: i.unit_code ?? null,
        qty: num(i.qty), fee: num(i.fee), discount: num(i.discount), depositAmount: num(i.deposit_amount), itemStatus: i.item_status,
      })),
      balance: (j.balance as Record<string, number | string>) ?? {},
      entries,
      claims: ((j.claims as J[]) ?? []).map((c) => ({ claimId: c.claim_id, kind: c.kind, description: c.description, amount: num(c.amount), createdAt: c.created_at })),
      collectionLogs: ((j.collection_logs as J[]) ?? []).map((g) => ({ id: g.id, contactedAt: g.contacted_at, channel: g.channel, note: g.note ?? null, promisedPayDate: g.promised_pay_date ?? null })),
      cancelPolicy: toPolicy((j.cancel_policy as J) ?? {}),
      cancelQuoteNow: j.cancel_quote_now ? toCancelQuote(j.cancel_quote_now as J) : null,
      issuedAt: j.issued_at,
    },
  };
}
