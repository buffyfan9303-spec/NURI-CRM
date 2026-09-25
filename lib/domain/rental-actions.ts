/**
 * 렌탈 도메인 서버 액션. 모든 함수가 시작에서 requireCap을 다시 부른다(계약 §5) —
 * 화면에서 이미 caps를 확인했더라도 여기서 다시 확인하지 않으면 이 규칙은 장식일 뿐이다.
 *
 * 가용성·금액·상태 전이는 절대 여기서 판정하지 않는다. 전부 0003/0004의 RPC 또는
 * DB 제약(EXCLUDE, CHECK)에 넘긴다 — 이 파일은 "호출하고 오류를 한국어로 번역"만 한다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { mustAffect, NO_ROWS_MESSAGE } from "@/lib/db/mustAffect";
import { HINT_MESSAGE, pgError, failFrom, withCap, revalRental, type ActionResult } from "./rental-action-kit";
import type { ReservationRow, SwapCandidateRow, ClaimKind, SettlementResult } from "./rental-types";
import { getReservation, getSwapCandidates } from "./rental";

export type { ActionResult };

// ── 고객 ──────────────────────────────────────────────────────────

export async function createCustomer(
  businessId: string,
  input: { name: string; phone?: string; email?: string; birth?: string; address?: string; memo?: string }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("customers")
      .insert({
        business_id: businessId,
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        birth: input.birth || null,
        address: input.address || null,
        memo: input.memo || null,
      })
      .select("id")
      .single();
    if (error) return failFrom(error);
    revalidatePath(`/w/${businessId}/customers`);
    return { ok: true, data: { id: data.id as string } };
  });
}

// ── 상품 / SKU / 개체 / 구성품 ───────────────────────────────────────

export async function createProduct(
  businessId: string,
  input: { code: string; name: string; category: string; baseFee: number; depositAmount: number; careBufferHours: number }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("rental_products")
      .insert({
        business_id: businessId,
        code: input.code,
        name: input.name,
        category: input.category,
        base_fee: input.baseFee,
        deposit_amount: input.depositAmount,
        care_buffer_hours: input.careBufferHours,
      })
      .select("id")
      .single();
    if (error) return failFrom(error);
    revalidatePath(`/w/${businessId}/catalog`);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function createSku(
  businessId: string,
  productId: string,
  input: { color: string; size: string; barcode?: string }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("rental_skus")
      .insert({ product_id: productId, color: input.color, size: input.size, barcode: input.barcode || null })
      .select("id")
      .single();
    if (error) return failFrom(error);
    revalidatePath(`/w/${businessId}/catalog`);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function createUnit(
  businessId: string,
  skuId: string,
  input: { unitCode: string; location?: string; qrPayload?: string; purchaseCost?: number; acquiredOn?: string; measurements?: Record<string, unknown> }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("rental_units")
      .insert({
        sku_id: skuId,
        unit_code: input.unitCode,
        location: input.location || null,
        qr_payload: input.qrPayload || skuId + ":" + input.unitCode,
        purchase_cost: input.purchaseCost ?? null,
        acquired_on: input.acquiredOn || null,
        measurements: input.measurements ?? {},
      })
      .select("id")
      .single();
    if (error) return failFrom(error);
    revalidatePath(`/w/${businessId}/catalog`);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 개체 편집 — 위치/사진/메모/실측만. 상태 전이는 setUnitStatus/케어작업이 전담한다. */
export async function updateUnitAction(
  businessId: string,
  unitId: string,
  input: { location?: string | null; photoUrl?: string | null; notes?: string | null; measurements?: Record<string, unknown> }
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const patch: Record<string, unknown> = {};
    if ("location" in input) patch.location = input.location || null;
    if ("photoUrl" in input) patch.photo_url = input.photoUrl || null;
    if ("notes" in input) patch.notes = input.notes || null;
    if ("measurements" in input) patch.measurements = input.measurements ?? {};
    const r = await mustAffect(sb.schema("crm").from("rental_units").update(patch).eq("id", unitId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : NO_ROWS_MESSAGE };
    revalidatePath(`/w/${businessId}/catalog`);
    return { ok: true, data: undefined };
  });
}

export async function createProductPart(
  businessId: string,
  productId: string,
  input: { partName: string; required: boolean; sort: number }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("rental_product_parts")
      .insert({ product_id: productId, part_name: input.partName, required: input.required, sort: input.sort })
      .select("id")
      .single();
    if (error) return failFrom(error);
    revalidatePath(`/w/${businessId}/catalog`);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 검수/폐기/분실 등 개체 상태를 수동으로 바꿀 때만 사용. 세탁·수선은 care job이 자동으로 처리한다. */
export async function setUnitStatus(
  businessId: string,
  unitId: string,
  status: "available" | "inspect" | "lost" | "retired",
  notes?: string
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb
        .schema("crm")
        .from("rental_units")
        .update({ status, ...(notes ? { notes } : {}) })
        .eq("id", unitId)
        .eq("business_id", businessId)
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : NO_ROWS_MESSAGE };
    revalidatePath(`/w/${businessId}/catalog`);
    return { ok: true, data: undefined };
  });
}

// ── 세탁·수선 ─────────────────────────────────────────────────────

/** 작업 생성 + 개체 상태 전이를 crm.create_care_job(0022) 한 트랜잭션으로 — 전이가 막히면 작업도 안 생긴다. */
export async function createCareJob(
  businessId: string,
  unitId: string,
  input: { kind: "wash" | "repair" | "inspect"; notes?: string }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("create_care_job", {
      p_unit: unitId,
      p_kind: input.kind,
      p_notes: input.notes || null,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: { id: data as string } };
  });
}

/** 작업 종료 + 개체 available 복귀를 crm.complete_care_job(0022) 한 트랜잭션으로. */
export async function completeCareJob(
  businessId: string,
  jobId: string,
  input: { cost: number; notes?: string }
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("complete_care_job", {
      p_job: jobId,
      p_cost: input.cost,
      p_notes: input.notes || null,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

/** 확정 전 화면에 보여줄 참고용 가용 수량. 최종 판정은 항상 confirm_reservation의 서버 재검사다. */
export async function checkAvailabilityAction(
  businessId: string,
  skuId: string,
  start: string,
  end: string,
  excludeReservationId?: string
): Promise<ActionResult<{ remaining: number }>> {
  return withCap(businessId, "view", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("check_sku_availability", {
      p_sku: skuId,
      p_period: `[${start},${end})`,
      p_exclude_reservation: excludeReservationId ?? null,
    });
    if (error) return failFrom(error);
    return { ok: true, data: { remaining: data as number } };
  });
}

// ── 예약 ──────────────────────────────────────────────────────────

export interface ReservationItemInput {
  productId: string;
  skuId?: string;
  unitId?: string;
  qty?: number;
  fee?: number;
  discount?: number;
}

export async function createReservationDraft(
  businessId: string,
  input: {
    start: string; // ISO
    end: string; // ISO
    items: ReservationItemInput[];
    customerName?: string;
    customerPhone?: string;
    /** crm.customers.id — 0027 이후 서버가 같은 사업장 소속을 검증하고 customer_ref 로 저장한다(구 DB 에서는 인자를 보내지 않는다). */
    customerId?: string;
    fittingAt?: string;
    notes?: string;
    idempotencyKey: string;
  }
): Promise<ActionResult<ReservationRow>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("create_reservation", {
      p_business: businessId,
      p_start: input.start,
      p_end: input.end,
      p_items: input.items.map((i) => ({
        product_id: i.productId,
        sku_id: i.skuId ?? null,
        unit_id: i.unitId ?? null,
        qty: i.qty ?? 1,
        fee: i.fee ?? null,
        discount: i.discount ?? 0,
      })),
      p_customer_name: input.customerName || null,
      p_customer_phone: input.customerPhone || null,
      p_fitting_at: input.fittingAt || null,
      p_notes: input.notes || null,
      p_idempotency_key: input.idempotencyKey,
      // p_customer 는 0027 에서 추가된 기본값 인자 — 값이 있을 때만 보내 구 DB(9인자)와도 호환.
      ...(input.customerId ? { p_customer: input.customerId } : {}),
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    const full = await getReservation(businessId, (data as { id: string }).id);
    if (!full.ok) return { ok: false, message: full.message };
    return { ok: true, data: full.data };
  });
}

export async function confirmReservationAction(
  businessId: string,
  reservationId: string
): Promise<ActionResult<ReservationRow>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("confirm_reservation", { p_reservation: reservationId });
    if (error) return failFrom(error);
    revalRental(businessId);
    const full = await getReservation(businessId, reservationId);
    if (!full.ok) return { ok: false, message: full.message };
    return { ok: true, data: full.data };
  });
}

export async function cancelReservationDraft(businessId: string, reservationId: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb
        .schema("crm")
        .from("rental_reservations")
        .update({ status: "cancelled" })
        .eq("id", reservationId)
        .eq("business_id", businessId)
        .eq("status", "draft")
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 이미 초안이 아닌 예약입니다(확정·취소된 예약은 예약 상세에서 처리하세요)." };
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

/**
 * 기간 변경 — crm.update_reservation_period(0022). draft·confirmed 만 허용하고, 확정 예약은
 * confirm_reservation 과 같은 검사(개체 상태·겹침, SKU 잠금+수량)를 새 기간으로 다시 통과해야 한다.
 */
export async function updateReservationPeriod(
  businessId: string,
  reservationId: string,
  start: string,
  end: string
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      return { ok: false, message: HINT_MESSAGE.invalid_period };
    }
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("update_reservation_period", {
      p_reservation: reservationId,
      p_start: start,
      p_end: end,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

export async function markItemsOutAction(
  businessId: string,
  reservationId: string,
  itemIds: string[]
): Promise<ActionResult<ReservationRow>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("mark_items_out", { p_reservation: reservationId, p_item_ids: itemIds });
    if (error) return failFrom(error);
    revalRental(businessId);
    const full = await getReservation(businessId, reservationId);
    if (!full.ok) return { ok: false, message: full.message };
    return { ok: true, data: full.data };
  });
}

export async function markItemsReturnedAction(
  businessId: string,
  reservationId: string,
  itemIds: string[]
): Promise<ActionResult<ReservationRow>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("mark_items_returned", { p_reservation: reservationId, p_item_ids: itemIds });
    if (error) return failFrom(error);

    // 반납된 개체는 "returning"(회수 접수) 상태다 — 검수 없이 바로 available로 되돌리지 않는다.
    // 손상/누락 판정이 필요하면 setUnitStatus 또는 세탁/수선 등록(createCareJob)으로 전이시킨다.
    revalRental(businessId);
    const full = await getReservation(businessId, reservationId);
    if (!full.ok) return { ok: false, message: full.message };
    return { ok: true, data: full.data };
  });
}

/** 반납 검수: 정상 회수 확인 → 대여가능 복귀(세탁 불필요 시). */
export async function inspectReturnedUnit(
  businessId: string,
  unitId: string
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb
        .schema("crm")
        .from("rental_units")
        .update({ status: "available" })
        .eq("id", unitId)
        .eq("business_id", businessId)
        .eq("status", "returning")
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 반납 검수 대기 상태가 아닌 개체입니다." };
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

export async function markItemMissingOrDamaged(
  businessId: string,
  reservationId: string,
  itemId: string,
  unitId: string | null,
  kind: "missing" | "damaged"
): Promise<ActionResult<ReservationRow>> {
  // 항목·개체·예약 상태를 crm.mark_item_missing_or_damaged(0022) 한 트랜잭션으로. 개체는 항목에서
  // 서버가 찾으므로 unitId 인자는 호환용으로만 남긴다(호출부 시그니처 유지).
  void unitId;
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("mark_item_missing_or_damaged", { p_item: itemId, p_kind: kind });
    if (error) return failFrom(error);

    revalRental(businessId);
    const full = await getReservation(businessId, reservationId);
    if (!full.ok) return { ok: false, message: full.message };
    return { ok: true, data: full.data };
  });
}

// ── 정산 ──────────────────────────────────────────────────────────

export interface PaymentLineInput {
  entryType: "rental_revenue" | "deposit_in" | "late_fee" | "damage_charge" | "discount";
  amount: number;
  reason?: string;
}

export async function recordPaymentAction(
  businessId: string,
  reservationId: string,
  lines: PaymentLineInput[],
  idempotencyKey: string,
  method: "cash" | "card" | "transfer" | "other" = "cash"
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("record_payment", {
      p_reservation: reservationId,
      p_lines: lines.map((l) => ({ entry_type: l.entryType, amount: l.amount, reason: l.reason ?? null })),
      p_idempotency_key: idempotencyKey,
      p_method: method,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

export async function refundDepositAction(
  businessId: string,
  reservationId: string,
  amount: number,
  reason: string,
  idempotencyKey: string
): Promise<ActionResult> {
  return withCap(businessId, "refund", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("refund_deposit", {
      p_reservation: reservationId,
      p_amount: amount,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

export interface LateFeeQuote {
  amount: number;
  lateDays: number;
  lateFeePerDay: number;
  lateFeeRate: number | null;
  graceHours: number;
  baseFee: number;
}

export async function calcLateFeeAction(
  businessId: string,
  reservationId: string
): Promise<ActionResult<LateFeeQuote>> {
  return withCap(businessId, "view", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("calc_late_fee", { p_reservation: reservationId });
    if (error) return failFrom(error);
    const d = data as { amount: number; basis: Record<string, unknown> };
    return {
      ok: true,
      data: {
        amount: d.amount,
        lateDays: d.basis.late_days as number,
        lateFeePerDay: d.basis.late_fee_per_day as number,
        lateFeeRate: (d.basis.late_fee_rate as number) ?? null,
        graceHours: d.basis.grace_hours as number,
        baseFee: d.basis.base_fee as number,
      },
    };
  });
}

/**
 * 연체료 확정. 0009_rental_hardening이 추가한 전용 RPC crm.charge_late_fee를 쓴다
 * (write + revenue.read 둘 다 요구 — 액션 게이트도 동일, CLICK-PATH-218). 청구만 하고 현금 수납은 별도.
 */
export async function chargeLateFeeAction(
  businessId: string,
  reservationId: string,
  amount: number,
  idempotencyKey: string
): Promise<ActionResult> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("charge_late_fee", {
      p_reservation: reservationId,
      p_amount: amount,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

/**
 * 미수금 즉시 수납. record_payment의 p_settle(0017 이후 시그니처)만 채우고
 * p_lines는 비운다 — "새 청구 없이 현금만 받는다"를 코드 모양으로도 분리해 둔다.
 * 새 청구를 만들고 싶으면 recordPaymentAction(entryType 라인)을 쓰지 이 함수를 쓰지 않는다.
 */
export async function settleOutstandingAction(
  businessId: string,
  reservationId: string,
  amount: number,
  idempotencyKey: string,
  method: "cash" | "card" | "transfer" | "other" = "cash"
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, message: "수납액은 0보다 큰 정수여야 합니다." };
    }
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("record_payment", {
      p_reservation: reservationId,
      p_lines: [],
      p_idempotency_key: idempotencyKey,
      p_method: method,
      p_settle: amount,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: undefined };
  });
}

// ── 개체 교환 ────────────────────────────────────────────────────────

/** 클라이언트 컴포넌트가 개체 교환 모달을 열 때 후보 목록을 조회하는 용도(읽기 전용). */
export async function getSwapCandidatesAction(
  businessId: string,
  skuId: string,
  excludeUnitId: string
): Promise<ActionResult<SwapCandidateRow[]>> {
  return withCap(businessId, "view", async () => getSwapCandidates(businessId, skuId, excludeUnitId));
}

export interface SwapResult {
  fromUnitId: string;
  fromUnitCode: string;
  /** 'returning'이면 세탁·검수를 건너뛴 게 아니라 정말 회수된 것 — 화면에서 /care 안내가 필요하다. */
  fromStatus: string;
  toUnitCode: string;
}

/**
 * 개체 교환(crm.swap_reservation_unit, 0017_swap_unit.sql). 같은 SKU 안에서만 가능하고
 * 사유가 필수다 — 서버가 강제하므로 여기서는 빈 사유를 미리 걸러 헛된 요청을 줄이는 정도만 한다.
 * 교환으로 이전 개체가 'returning'이 되어도 정비 작업이 자동 생성되지는 않는다 — 화면이
 * fromStatus를 보고 세탁·수선 등록 안내를 직접 띄운다.
 */
export async function swapReservationUnitAction(
  businessId: string,
  itemId: string,
  newUnitId: string,
  reason: string,
  idempotencyKey: string
): Promise<ActionResult<SwapResult>> {
  return withCap(businessId, "write", async () => {
    if (!reason.trim()) return { ok: false, message: "교환 사유를 입력하세요." };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("swap_reservation_unit", {
      p_item: itemId,
      p_new_unit: newUnitId,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey,
    });
    if (error) return failFrom(error);
    const d = data as { from: { unit_id: string; unit_code: string; status: string }; to: { unit_code: string } };
    revalRental(businessId);
    return {
      ok: true,
      data: { fromUnitId: d.from.unit_id, fromUnitCode: d.from.unit_code, fromStatus: d.from.status, toUnitCode: d.to.unit_code },
    };
  });
}

// ── 고객 신체 치수 ────────────────────────────────────────────────────
// 개체 실측(rental_units.measurements)과는 완전히 다른 테이블·경로다. 절대 합치지 않는다.

/**
 * 주의: 0006_customers.sql이 crm.customer_measurements에 SELECT GRANT를 빼먹었다
 * (INSERT/UPDATE/DELETE만 authenticated에게 부여됨). PostgREST는 insert 뒤 기본적으로
 * RETURNING을 위해 SELECT 권한을 요구하므로, .select()를 붙이면 grant가 고쳐지기 전까지
 * "permission denied for table customer_measurements"로 실패한다. 그래서 여기서는
 * 반환값 없이(return=minimal) insert만 한다 — 목록은 router.refresh()가 다시 읽는다.
 * 스키마 담당에게 `grant select on crm.customer_measurements to authenticated;` 추가를
 * 요청했다(미해결 사항 참고). grant가 추가되면 이 우회는 필요 없어진다.
 */
export async function addCustomerMeasurement(
  businessId: string,
  customerId: string,
  values: Record<string, number | string>,
  note?: string
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb
      .schema("crm")
      .from("customer_measurements")
      .insert({ customer_id: customerId, values, note: note || null });
    if (error) return failFrom(error);
    revalidatePath(`/w/${businessId}/customers/${customerId}`);
    return { ok: true, data: undefined };
  });
}

// ── 손상·분실 청구 → 보증금 차감 정산 → 환불/추가 청구(0023) ───────

export interface DamageClaimInput {
  kind: ClaimKind;
  description: string;
  amount: number;
  itemId?: string | null;
  reason?: string;
  /** crm-files 버킷 경로 {business_id}/rental_damage_claims/{...}. 서버가 사업장 소속을 검증. */
  photoPaths?: string[];
}

function toSettlement(j: Record<string, unknown>): SettlementResult {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { masked: Boolean(j.masked), applied: n(j.applied), refunded: n(j.refunded), remainingDeposit: n(j.remaining_deposit), additionalDue: n(j.additional_due) };
}

/** 청구 1건 = damage_charge 원장 1행 + 청구 기록. 항목이 있으면 분실·손상 표시까지 같이. 권한 write+revenue.read(RPC 재검사). */
export async function claimDamageAction(
  businessId: string, reservationId: string, input: DamageClaimInput, idempotencyKey: string
): Promise<ActionResult<{ claimId: string }>> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    if (!Number.isInteger(input.amount) || input.amount <= 0) return { ok: false, message: HINT_MESSAGE.invalid_amount };
    if (!input.description?.trim()) return { ok: false, message: HINT_MESSAGE.description_required };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_claim_damage", {
      p_reservation: reservationId, p_kind: input.kind, p_description: input.description.trim(), p_amount: input.amount,
      p_idempotency_key: idempotencyKey, p_item: input.itemId ?? null, p_reason: input.reason?.trim() || null, p_photo_paths: input.photoPaths ?? [],
    });
    if (error) return failFrom(error);
    const claimId = (data as { claim_id: string | null } | null)?.claim_id ?? null;
    if (!claimId) return { ok: false, message: HINT_MESSAGE.idempotency_key_conflict }; // F9: 무음 성공 금지
    revalRental(businessId);
    return { ok: true, data: { claimId } };
  });
}

/**
 * 보증금 정산(원자, refund 권한): 반납 완료(returned/closed) 후에만. partial_return 은 차감만 하고 현금 반환은 하지 않는다(0025 F12).
 * 미수금(손상·연체·대여료)만큼 보증금에서 차감 → 남은 보증금은 refundRemaining 이면 현금 반환.
 * additionalDue > 0 이면 보증금으로 부족한 금액 — settleOutstandingAction 으로 수납한다. 같은 키 재호출은 무변경.
 */
export async function settleDepositAction(
  businessId: string, reservationId: string, idempotencyKey: string,
  opts?: { refundRemaining?: boolean; method?: "cash" | "card" | "transfer" | "other"; reason?: string }
): Promise<ActionResult<SettlementResult>> {
  return withCap(businessId, "refund", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_settle_deposit", {
      p_reservation: reservationId, p_idempotency_key: idempotencyKey, p_refund_remaining: opts?.refundRemaining ?? true,
      p_method: opts?.method ?? "cash", p_reason: opts?.reason ?? null,
    });
    if (error) return failFrom(error);
    revalRental(businessId);
    return { ok: true, data: toSettlement(data as Record<string, unknown>) };
  });
}

/**
 * 반납 검수 한 화면(R3): 반납 표시 → 청구 N건 → 보증금 차감 → 잔액 환불을 한 트랜잭션(crm.rental_inspect_return).
 * 권한: write(반납) + 청구가 있으면 revenue.read + 정산은 refund — 하나라도 없으면 전부 롤백된다.
 */
export async function inspectReturnAction(
  businessId: string, reservationId: string, idempotencyKey: string,
  input: { returnedItemIds: string[]; claims: DamageClaimInput[]; refundRemaining?: boolean; method?: "cash" | "card" | "transfer" | "other"; reason?: string }
): Promise<ActionResult<{ returned: number; claimIds: string[]; settlement: SettlementResult; reservationStatus: string }>> {
  return withCap(businessId, "write", async () => {
    for (const c of input.claims) {
      if (!Number.isInteger(c.amount) || c.amount <= 0) return { ok: false, message: HINT_MESSAGE.invalid_amount };
      if (!c.description?.trim()) return { ok: false, message: HINT_MESSAGE.description_required };
    }
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("rental_inspect_return", {
      p_reservation: reservationId, p_idempotency_key: idempotencyKey, p_returned_item_ids: input.returnedItemIds,
      p_claims: input.claims.map((c) => ({ item_id: c.itemId ?? null, kind: c.kind, description: c.description.trim(), amount: c.amount, reason: c.reason?.trim() || null, photo_paths: c.photoPaths ?? [] })),
      p_refund_remaining: input.refundRemaining ?? true, p_method: input.method ?? "cash", p_reason: input.reason ?? null,
    });
    if (error) return failFrom(error);
    const j = data as Record<string, unknown>;
    revalRental(businessId);
    return {
      ok: true,
      data: { returned: Number(j.returned ?? 0), claimIds: (j.claims as string[]) ?? [], settlement: toSettlement((j.settlement as Record<string, unknown>) ?? {}), reservationStatus: String(j.reservation_status ?? "") },
    };
  });
}

// ── 확정 예약 취소(CP-219a) ───────────────────────────────────────
/**
 * confirmed 만(출고 전). 수납·보증금이 있으면 refund=true(+refund 권한)로 전액 환급까지 한 트랜잭션, 아니면 refund_required 로 거부.
 * 개체 reserved→available, 항목 cancelled(점유 해제).
 */
export async function cancelConfirmedReservation(
  businessId: string, reservationId: string, idempotencyKey: string,
  opts?: { reason?: string; refund?: boolean; method?: "cash" | "card" | "transfer" | "other" }
): Promise<ActionResult<{ masked: boolean; refundedCash: number | null; depositReturned: number | null }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("cancel_confirmed_reservation", {
      p_reservation: reservationId, p_idempotency_key: idempotencyKey, p_reason: opts?.reason ?? null, p_refund: opts?.refund ?? false, p_method: opts?.method ?? "cash",
    });
    if (error) return failFrom(error);
    const j = data as Record<string, unknown>;
    revalRental(businessId);
    return { ok: true, data: { masked: Boolean(j.masked), refundedCash: j.refunded_cash == null ? null : Number(j.refunded_cash), depositReturned: j.deposit_returned == null ? null : Number(j.deposit_returned) } };
  });
}
