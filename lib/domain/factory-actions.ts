/**
 * 의류공장 도메인 서버 액션. 모든 함수가 시작에서 requireCap을 다시 부른다(계약 §5) —
 * 화면에서 이미 caps를 확인했더라도 여기서 다시 확인하지 않으면 이 규칙은 장식일 뿐이다.
 *
 * 금액은 절대 여기서 계산하지 않는다. crm.create_factory_order RPC가 사업장 vat_rate로
 * 서버에서 계산하고, supply+vat=total CHECK가 DB에서 강제한다(기준본 H-3 재발 방지).
 * 생성 이후 화면에서 금액을 다시 고칠 수 있는 액션은 의도적으로 만들지 않았다 — 필요하면
 * 새 마이그레이션(정정 RPC)이 있어야 하며 이 에이전트 소유 범위가 아니다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";
import { validateFactoryOptions } from "./factory-options";
import type { FactoryOrderType, FactoryProcessStage, FactoryProcessStatus } from "./factory";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

/** hint → 한국어 안내. 0021_factory_process_fixes.sql 이후 서버가 안정적인 hint를 준다 — 1순위 근거. */
const HINT_MESSAGE: Record<string, string> = {
  customer_not_found: "이 사업장의 고객이 아닙니다. 고객을 다시 선택하세요.",
  order_not_found: "주문을 찾을 수 없습니다.",
  order_cancelled: "취소된 주문의 공정은 기록할 수 없습니다.",
  order_completed: "이미 완료된 주문입니다. 완료 취소(재개) 후 진행하세요.",
  not_completed: "완료 상태의 주문만 재개할 수 있습니다.",
  invalid_stage: "알 수 없는 공정 단계입니다.",
  first_stage: "첫 단계입니다.",
  forbidden: "이 작업을 수행할 권한이 없습니다.",
};

function pgError(e: { code?: string; message: string; hint?: string | null }): string {
  const msg = e.message ?? "";
  if (e.hint && HINT_MESSAGE[e.hint]) return HINT_MESSAGE[e.hint];
  if (/customer_not_found/.test(msg)) return HINT_MESSAGE.customer_not_found;
  if (/invalid_amount/.test(msg)) return "공급가는 0 이상의 정수여야 합니다.";
  if (/order_not_found/.test(msg)) return "주문을 찾을 수 없습니다.";
  if (/material_not_found/.test(msg)) return "자재를 찾을 수 없습니다.";
  if (/factory_orders_amount_ck/.test(msg)) return "공급가+부가세가 합계와 일치하지 않습니다.";
  if (/fitting_logs_no_base64_ck/.test(msg)) return "사진은 Storage 경로로만 저장할 수 있습니다(base64 금지).";
  if (/material_moves_adjust_reason_ck/.test(msg)) return "재고 조정에는 사유가 필요합니다.";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  if (e.code === "23505") return "이미 존재하는 값입니다.";
  if (/range lower bound must be less than or equal to range upper bound/.test(msg)) return "종료 시각이 시작 시각보다 빠릅니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[factory pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요.";
}

async function withCap<T>(
  businessId: string,
  cap: Cap,
  fn: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  try {
    await requireCap(businessId, cap);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  return fn();
}

function revalFactory(businessId: string, orderId?: string) {
  revalidatePath(`/w/${businessId}/orders`);
  revalidatePath(`/w/${businessId}/production`);
  revalidatePath(`/w/${businessId}/calendar`);
  revalidatePath(`/w/${businessId}`);
  if (orderId) revalidatePath(`/w/${businessId}/orders/${orderId}`);
}

// ── 주문 ────────────────────────────────────────────────────────────

export interface CreateFactoryOrderInput {
  customerId: string;
  type: FactoryOrderType;
  supply: number;
  options?: Record<string, unknown>;
  qty?: Record<string, number>;
  orderDate?: string;
  fittingDate?: string;
  dueDate?: string;
  memo?: string;
}

export async function createFactoryOrder(
  businessId: string,
  input: CreateFactoryOrderInput
): Promise<ActionResult<{ id: string; orderNo: string }>> {
  return withCap(businessId, "write", async () => {
    if (!input.customerId) return { ok: false, message: "고객을 선택하세요." };
    if (!Number.isInteger(input.supply) || input.supply < 0) {
      return { ok: false, message: "공급가는 0 이상의 정수여야 합니다." };
    }
    if (input.type === "suit" && input.options) {
      const v = validateFactoryOptions(input.options);
      if (!v.ok) return { ok: false, message: v.errors.join(" / ") };
    }
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("create_factory_order", {
      p_business: businessId,
      p_customer: input.customerId,
      p_type: input.type,
      p_supply: input.supply,
      p_options: input.options ?? {},
      p_qty: input.qty ?? {},
      p_order_date: input.orderDate ?? null,
      p_fitting_date: input.fittingDate || null,
      p_due_date: input.dueDate || null,
      p_memo: input.memo || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    const row = data as { id: string; order_no: string };
    revalFactory(businessId);
    return { ok: true, data: { id: row.id, orderNo: row.order_no } };
  });
}

export interface UpdateFactoryOrderScheduleInput {
  fittingDate?: string | null;
  dueDate?: string | null;
  deliveredDate?: string | null;
  memo?: string | null;
}

/** 일정/메모만 수정한다. 금액·옵션은 건드리지 않는다(옵션 수정은 updateFactoryOrderOptions). */
export async function updateFactoryOrderSchedule(
  businessId: string,
  orderId: string,
  input: UpdateFactoryOrderScheduleInput
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const patch: Record<string, unknown> = {};
    if ("fittingDate" in input) patch.fitting_date = input.fittingDate || null;
    if ("dueDate" in input) patch.due_date = input.dueDate || null;
    if ("deliveredDate" in input) patch.delivered_date = input.deliveredDate || null;
    if ("memo" in input) patch.memo = input.memo || null;
    const r = await mustAffect(sb.schema("crm").from("factory_orders").update(patch).eq("business_id", businessId).eq("id", orderId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 주문을 찾을 수 없습니다." };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

/** 정장 옵션 41항목 + 수량 수정(작지 발행 전 스펙 정정용). */
export async function updateFactoryOrderOptions(
  businessId: string,
  orderId: string,
  input: { options: Record<string, unknown>; qty: Record<string, number> }
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const v = validateFactoryOptions(input.options);
    if (!v.ok) return { ok: false, message: v.errors.join(" / ") };
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb.schema("crm").from("factory_orders").update({ options: input.options, qty: input.qty }).eq("business_id", businessId).eq("id", orderId)
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 주문을 찾을 수 없습니다." };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

export async function cancelFactoryOrder(businessId: string, orderId: string): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("factory_orders").update({ status: "취소" }).eq("business_id", businessId).eq("id", orderId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 주문을 찾을 수 없습니다." };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

// ── 공정 ────────────────────────────────────────────────────────────

export async function advanceFactoryProcess(
  businessId: string,
  orderId: string,
  stage: FactoryProcessStage,
  status: FactoryProcessStatus = "done",
  actualMinutes?: number
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("advance_factory_process", {
      p_order: orderId,
      p_stage: stage,
      p_status: status,
      p_actual_minutes: actualMinutes ?? null,
    });
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

/**
 * "다음": 현재 단계 done + 다음 단계 doing 을 한 트랜잭션 RPC 로. 출고 단계면 주문이 '완료'로 확정된다 —
 * 확인 대화상자는 화면 책임(ProductionBoard), 원자성·권한·사업장 일치는 RPC 책임.
 */
export async function advanceFactoryProcessNext(
  businessId: string,
  orderId: string,
  stage: FactoryProcessStage,
  actualMinutes?: number
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("advance_factory_process_next", {
      p_business: businessId,
      p_order: orderId,
      p_stage: stage,
      p_actual_minutes: actualMinutes ?? null,
    });
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

/** "이전": 현재 단계 todo(finished_at/started_at 리셋) + 이전 단계 doing 을 한 트랜잭션 RPC 로. */
export async function rewindFactoryProcess(
  businessId: string,
  orderId: string,
  stage: FactoryProcessStage
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("rewind_factory_process", {
      p_business: businessId,
      p_order: orderId,
      p_stage: stage,
    });
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

/** 완료 취소(재개): 완료 → 진행중, delivered_date 해제, 출고 공정 doing, audit_log 기록. RPC 가 write 권한을 재검증한다. */
export async function reopenFactoryOrder(businessId: string, orderId: string): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("reopen_factory_order", { p_business: businessId, p_order: orderId });
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

/**
 * 예정 작업시간(분)·담당자 배정. advance_factory_process RPC는 담당자가 비어 있을 때만
 * 호출자(auth.uid())를 채우고 기존 배정은 보존한다(0021). 관리자가 "남에게 배정"하려면 이 직접 upsert가 필요하다.
 */
export async function planFactoryProcess(
  businessId: string,
  orderId: string,
  stage: FactoryProcessStage,
  input: { plannedMinutes?: number | null; assignee?: string | null }
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const patch: Record<string, unknown> = { business_id: businessId, order_id: orderId, stage };
    if ("plannedMinutes" in input) patch.planned_minutes = input.plannedMinutes ?? null;
    if ("assignee" in input) patch.assignee = input.assignee ?? null;
    const { error } = await sb
      .schema("crm")
      .from("factory_processes")
      .upsert(patch, { onConflict: "order_id,stage" });
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    return { ok: true, data: undefined };
  });
}

// ── 자재 소비 ─────────────────────────────────────────────────────────

export async function consumeMaterial(
  businessId: string,
  orderId: string,
  materialId: string,
  qty: number,
  unit = "ea",
  note?: string
): Promise<ActionResult<undefined>> {
  return withCap(businessId, "inventory.adjust", async () => {
    if (!(qty > 0)) return { ok: false, message: "수량은 0보다 커야 합니다." };
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("consume_material", {
      p_order: orderId,
      p_material: materialId,
      p_qty: qty,
      p_unit: unit,
      p_note: note ?? null,
    });
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    revalidatePath(`/w/${businessId}/materials`);
    return { ok: true, data: undefined };
  });
}

// ── 가봉 기록 ─────────────────────────────────────────────────────────

/** photoPaths는 반드시 Storage 경로여야 한다(base64 dataURL 금지, DB CHECK가 재차 막는다). */
export async function addFittingLog(
  businessId: string,
  orderId: string,
  input: { notes?: string; photoPaths?: string[] }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const photoPaths = input.photoPaths ?? [];
    if (photoPaths.some((p) => p.startsWith("data:"))) {
      return { ok: false, message: "사진은 Storage 경로로만 저장할 수 있습니다." };
    }
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("fitting_logs")
      .insert({ business_id: businessId, order_id: orderId, notes: input.notes || null, photo_paths: photoPaths })
      .select("id")
      .single();
    if (error) return { ok: false, message: pgError(error) };
    revalFactory(businessId, orderId);
    return { ok: true, data: { id: data.id as string } };
  });
}
