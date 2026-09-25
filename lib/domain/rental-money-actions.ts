/**
 * 렌탈 돈 흐름 서버 액션(0027_rental_money.sql). 모든 함수가 시작에서 requireCap 을 다시 부른다(계약 §5).
 * 금액·상태 전이·한도는 여기서 판정하지 않는다 — 전부 RPC(서버)가 하고 이 파일은 "호출하고 오류를 한국어로 번역"만 한다.
 * 결과는 {ok:true,data}|{ok:false,message}. "use server" 파일이라 async 함수만 export 한다.
 */
"use server";

import { getServerSupabase } from "@/lib/supabase/server";
import { HINT_MESSAGE, failFrom, withCap, revalRental, type ActionResult } from "./rental-action-kit";
import type { ReservationBalance } from "./rental-types";
import type { CancelCause, CancelQuote, CancelTier, CancelPolicy, CloseResult, CollectionChannel, CollectionLogRow, FeePolicy, PayMethod, PayStage } from "./rental-money-types";
import { toCancelQuote, toFeePolicy } from "./rental-money";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** RPC 가 돌려주는 mask_balance(revenue.read 없으면 {masked:true}) → 화면용. */
function toBalance(j: J | null): ReservationBalance | { masked: true } {
  if (!j || j.masked) return { masked: true };
  return {
    cashReceived: Number(j.cash_received ?? 0), rentalRevenue: Number(j.rental_revenue ?? 0), depositBalance: Number(j.deposit_balance ?? 0),
    lateFee: Number(j.late_fee ?? 0), damageCharge: Number(j.damage_charge ?? 0), discount: Number(j.discount ?? 0), outstanding: Number(j.outstanding ?? 0),
    paymentStatus: j.payment_status ?? "unpaid", depositForfeited: Number(j.deposit_forfeited ?? 0), writtenOff: Number(j.written_off ?? 0),
    cancelPenalty: Number(j.cancel_penalty ?? 0), compensation: Number(j.compensation ?? 0),
  };
}

const isKRW = (v: number) => Number.isInteger(v) && v > 0 && v <= 100_000_000;

// ── 1. 확정 + 자동 청구 ─────────────────────────────────────────

/** 확정과 동시에 항목 순대여료를 원장에 청구(rental_revenue+discount). 재호출 안전(확정 no-op, 청구는 차액만). 권한 write. */
export async function confirmAndChargeAction(
  businessId: string, reservationId: string
): Promise<ActionResult<{ status: string; confirmedAt: string | null; depositRequired: number | null; chargedFee: number; chargedDiscount: number; balance: ReservationBalance | { masked: true } }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_confirm_and_charge", { p_reservation: reservationId });
    if (error) return failFrom(error);
    const j = data as J;
    revalRental(businessId);
    return { ok: true, data: { status: j.status, confirmedAt: j.confirmed_at ?? null, depositRequired: j.deposit_required == null ? null : Number(j.deposit_required), chargedFee: Number(j.charged_fee ?? 0), chargedDiscount: Number(j.charged_discount ?? 0), balance: toBalance(j.balance) } };
  });
}

/** 구예약용: 원장에 아직 청구되지 않은 대여료·할인 차액만 청구(음수면 아무것도 안 함). 권한 write. */
export async function chargeUnbilledFeeAction(
  businessId: string, reservationId: string
): Promise<ActionResult<{ chargedFee: number; chargedDiscount: number; balance: ReservationBalance | { masked: true } }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_charge_unbilled_fee", { p_reservation: reservationId });
    if (error) return failFrom(error);
    const j = data as J;
    revalRental(businessId);
    return { ok: true, data: { chargedFee: Number(j.charged_fee ?? 0), chargedDiscount: Number(j.charged_discount ?? 0), balance: toBalance(j.balance) } };
  });
}

// ── 2. 수납 / 보증금 수령 ───────────────────────────────────────

export interface ReceivePaymentInput {
  amount: number;
  method: PayMethod;
  /** payment=계약금·잔금·미수회수(payment_in 만), deposit=보증금 수령(deposit_in+payment_in, 단계 'deposit' 고정) */
  kind?: "payment" | "deposit";
  stage?: Exclude<PayStage, "deposit">;
  approvalNo?: string;
  cashReceipt?: boolean | null;
  memo?: string;
  idempotencyKey: string;
}

/** 수납 1건. payment 는 미수 초과 시 exceeds_outstanding(먼저 chargeUnbilledFeeAction). 권한 write. */
export async function receivePaymentAction(
  businessId: string, reservationId: string, input: ReceivePaymentInput
): Promise<ActionResult<{ entryId: string | null; balance: ReservationBalance | { masked: true } }>> {
  return withCap(businessId, "write", async () => {
    if (!isKRW(input.amount)) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_receive_payment", {
      p_reservation: reservationId, p_amount: input.amount, p_idempotency_key: input.idempotencyKey, p_method: input.method,
      p_stage: input.stage ?? "other", p_kind: input.kind ?? "payment", p_approval_no: input.approvalNo?.trim() || null,
      p_cash_receipt: input.cashReceipt ?? null, p_memo: input.memo?.trim() || null,
    });
    if (error) return failFrom(error);
    const j = data as J;
    revalRental(businessId);
    return { ok: true, data: { entryId: (j.entry_id as string) ?? null, balance: toBalance(j) } };
  });
}

// ── 3. 보증금 반환 / 몰수 ──────────────────────────────────────

/** 보증금 현금 반환(수단 선택). 반납·종결·취소 상태에서만(not_returned). 권한 refund. */
export async function refundDepositWithMethodAction(
  businessId: string, reservationId: string, input: { amount: number; method: PayMethod; reason?: string; idempotencyKey: string }
): Promise<ActionResult<ReservationBalance | { masked: true }>> {
  return withCap(businessId, "refund", async () => {
    if (!isKRW(input.amount)) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_refund_deposit", {
      p_reservation: reservationId, p_amount: input.amount, p_method: input.method, p_reason: input.reason?.trim() || null, p_idempotency_key: input.idempotencyKey,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: toBalance(data as J) };
  });
}

/** 보증금 몰수(사유 필수, 잔액 한도). 현금 이동 없음 — 잔액이 줄고 deposit_forfeited 수익으로 집계. 권한 refund. */
export async function forfeitDepositAction(
  businessId: string, reservationId: string, input: { amount: number; reason: string; idempotencyKey: string }
): Promise<ActionResult<ReservationBalance | { masked: true }>> {
  return withCap(businessId, "refund", async () => {
    if (!isKRW(input.amount)) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    if (!input.reason?.trim()) return { ok: false, message: HINT_MESSAGE.reason_required };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_forfeit_deposit", {
      p_reservation: reservationId, p_amount: input.amount, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: toBalance(data as J) };
  });
}

// ── 4. 미수금: 독촉 / 대손 ───────────────────────────────────────

/** 독촉 기록 추가. 권한 write(조회는 revenue.read). */
export async function logCollectionAction(
  businessId: string, reservationId: string, input: { channel: CollectionChannel; note?: string; contactedAt?: string; promisedPayDate?: string | null }
): Promise<ActionResult<CollectionLogRow>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_log_collection", {
      p_reservation: reservationId, p_channel: input.channel, p_note: input.note?.trim() || null,
      p_contacted_at: input.contactedAt ?? new Date().toISOString(), p_promised_pay_date: input.promisedPayDate ?? null,
    });
    if (error) return failFrom(error);
    const r = data as J;
    revalRental(businessId);
    return { ok: true, data: { id: r.id, reservationId: r.reservation_id, contactedAt: r.contacted_at, channel: r.channel, note: r.note ?? null, promisedPayDate: r.promised_pay_date ?? null, createdBy: r.created_by ?? null } };
  });
}

/** 대손(회수 불능) 처리 — owner 만(RPC 가 memberships.role 로 재검사). 사유 필수, 한도 = 미수금. 매출은 그대로, 미수만 줄어든다. */
export async function writeOffAction(
  businessId: string, reservationId: string, input: { amount: number; reason: string; idempotencyKey: string }
): Promise<ActionResult<ReservationBalance | { masked: true }>> {
  return withCap(businessId, ["refund", "revenue.read"], async () => {
    if (!isKRW(input.amount)) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    if (!input.reason?.trim()) return { ok: false, message: HINT_MESSAGE.reason_required };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_write_off", {
      p_reservation: reservationId, p_amount: input.amount, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: toBalance(data as J) };
  });
}

// ── 5. 취소 위약금 ─────────────────────────────────────────────

/** 취소 규정 저장(사업장별, 공정위 표가 기본). 권한 staff.manage. */
export async function setCancelPolicyAction(
  businessId: string, input: { customerTiers: CancelTier[]; businessTiers: CancelTier[]; contractGraceHours?: number }
): Promise<ActionResult<CancelPolicy>> {
  return withCap(businessId, "staff.manage", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_set_cancel_policy", {
      p_business: businessId, p_customer_tiers: input.customerTiers, p_business_tiers: input.businessTiers, p_contract_grace_hours: input.contractGraceHours ?? 24,
    });
    if (error) return failFrom(error);
    const j = data as J;
    revalRental(businessId);
    return { ok: true, data: { customerTiers: j.customer_tiers ?? [], businessTiers: j.business_tiers ?? [], contractGraceHours: Number(j.contract_grace_hours ?? 24), isDefault: Boolean(j.is_default), source: String(j.source ?? "") } };
  });
}

export interface CancelWithPenaltyInput {
  cause: CancelCause;
  idempotencyKey: string;
  /**
   * 직전 견적(getCancelQuote)의 rate — 사실상 필수. 없으면 서버가 quote_required 로 거부하고, 지금 단계와 다르면 quote_stale 로 거부한다
   * (H2 — 브라우저 시각은 보내지 않는다). 타입만 선택으로 둔 것은 화면 담당 파일을 깨지 않기 위해서다.
   */
  expectedRate?: number;
  /** 선택: 직전 견적의 refundCash. 보내면 서버가 지금 계산과 다를 때(그 사이 수납·몰수·정정) quote_stale 로 거부한다. */
  expectedRefund?: number | null;
  /** 위약금/배상금 직접 입력(원). 주면 reason 필수. 소비자는 계약 대여료 이하, 사업자가 대여료를 넘기면 owner 만. */
  overrideAmount?: number | null;
  /** 소비자 귀책: 받은 돈(보증금 제외) 한도까지만 공제(기본 true). false 면 부족분이 미수로 남는다. */
  limitToPaid?: boolean;
  method?: PayMethod;
  reason?: string;
}

/**
 * 정책 기반 취소(confirmed 만). 위약금·배상·환급을 원장에 기록하고 예약 cancelled, 점유 해제.
 * 권한 write + (돈이 움직이면) refund — 기존 cancel_confirmed_reservation 과 같은 기준. revenue.read 없으면 결과 금액 masked.
 */
export async function cancelWithPenaltyAction(
  businessId: string, reservationId: string, input: CancelWithPenaltyInput
): Promise<ActionResult<{ masked: boolean; quote: CancelQuote | null; balance: ReservationBalance | { masked: true } }>> {
  type Out = { masked: boolean; quote: CancelQuote | null; balance: ReservationBalance | { masked: true } };
  return withCap<Out>(businessId, "write", async () => {
    if (input.overrideAmount != null && !input.reason?.trim()) return { ok: false, message: HINT_MESSAGE.reason_required };
    if (input.overrideAmount != null && (!Number.isInteger(input.overrideAmount) || input.overrideAmount < 0 || input.overrideAmount > 100_000_000)) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_cancel_with_penalty", {
      p_reservation: reservationId, p_idempotency_key: input.idempotencyKey, p_cause: input.cause, p_expected_rate: input.expectedRate ?? null, p_expected_refund: input.expectedRefund ?? null,
      p_override_amount: input.overrideAmount ?? null, p_limit_to_paid: input.limitToPaid ?? true, p_method: input.method ?? "cash", p_reason: input.reason?.trim() || null,
    });
    if (error) return failFrom(error);
    const j = data as J;
    revalRental(businessId);
    if (j.masked) return { ok: true, data: { masked: true, quote: null, balance: { masked: true } } };
    return { ok: true, data: { masked: false, quote: j.quote ? toCancelQuote(j.quote as J) : null, balance: toBalance(j.balance) } };
  });
}

// ── 6. 연체료 정책 / 직접 입력 청구 ─────────────────────────────

/** 연체료 정책 저장 = 새 버전 행(과거 예약 스냅샷 불변). 권한 staff.manage. */
export async function setFeePolicyAction(
  businessId: string, input: { name: string; graceHours: number; lateFeePerDay: number; lateFeeRate?: number | null; damageDefault?: number }
): Promise<ActionResult<FeePolicy>> {
  return withCap(businessId, "staff.manage", async () => {
    if (!input.name?.trim()) return { ok: false, message: HINT_MESSAGE.name_required };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_set_fee_policy", {
      p_business: businessId, p_name: input.name.trim(), p_grace_hours: input.graceHours, p_late_fee_per_day: input.lateFeePerDay,
      p_late_fee_rate: input.lateFeeRate ?? null, p_damage_default: input.damageDefault ?? 0,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: toFeePolicy(data as J) };
  });
}

/** 산출값과 다른 연체료를 청구(사유 필수, 감사에 산출 근거·override 표시). 권한 write + revenue.read. */
export async function chargeLateFeeOverrideAction(
  businessId: string, reservationId: string, input: { amount: number; reason: string; idempotencyKey: string }
): Promise<ActionResult<ReservationBalance | { masked: true }>> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    if (!isKRW(input.amount)) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    if (!input.reason?.trim()) return { ok: false, message: HINT_MESSAGE.reason_required };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_charge_late_fee_override", {
      p_reservation: reservationId, p_amount: input.amount, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: toBalance(data as J) };
  });
}

// ── 7. 정정 ───────────────────────────────────────────────────

/** 원장 행 정정 = 같은 계정·반대 방향의 상계 행(reverses_id). 같은 행 두 번 불가. 권한 refund + revenue.read. 사유 필수. */
export async function reverseLedgerEntryAction(
  businessId: string, entryId: string, reason: string
): Promise<ActionResult<{ reversalId: string; reservationId: string | null; balance: ReservationBalance | { masked: true } | null }>> {
  return withCap(businessId, ["refund", "revenue.read"], async () => {
    if (!reason?.trim()) return { ok: false, message: HINT_MESSAGE.reason_required };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("ledger_reverse", { p_entry: entryId, p_reason: reason.trim() });
    if (error) return failFrom(error);
    const j = data as J;
    revalRental(businessId);
    return { ok: true, data: { reversalId: j.reversal_id, reservationId: j.reservation_id ?? null, balance: j.balance ? toBalance(j.balance) : null } };
  });
}

// ── 8. 종결 ───────────────────────────────────────────────────

/** 모든 항목 반납/처리 + 미수 0 + 보증금 0 일 때만 closed. 아니면 closed=false 와 reasons(예외 아님). 권한 write. */
export async function closeReservationAction(businessId: string, reservationId: string): Promise<ActionResult<CloseResult>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_close_reservation", { p_reservation: reservationId });
    if (error) return failFrom(error);
    const j = data as J;
    if (j.closed) revalRental(businessId);
    return { ok: true, data: { closed: Boolean(j.closed), status: String(j.status), reasons: (j.reasons as CloseResult["reasons"]) ?? [] } };
  });
}
