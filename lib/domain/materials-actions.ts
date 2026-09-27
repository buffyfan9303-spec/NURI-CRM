"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string; hint?: string };

/** hint → 한국어(0028_factory_fixes.sql). hint 가 있으면 문구 매칭보다 우선한다. */
const HINT_MESSAGE: Record<string, string> = {
  material_not_found: "자재를 찾을 수 없습니다.",
  forbidden: "이 작업을 수행할 권한이 없습니다.",
  invalid_qty: "수량은 0 이상이어야 합니다.",
  reason_required: "조정 사유를 입력하세요.",
  insufficient_stock: "재고가 부족합니다. 현재 재고를 넘는 출고는 할 수 없습니다.",
  negative_stock: "이 변경으로 재고가 음수가 됩니다.",
};

function pgError(e: { code?: string; message: string; hint?: string | null }): string {
  const msg = e.message ?? "";
  if (e.hint && HINT_MESSAGE[e.hint]) return HINT_MESSAGE[e.hint];
  if (/material_moves_adjust_reason_ck/.test(msg)) return "조정(adjust) 이동은 사유를 반드시 입력해야 합니다.";
  if (/material_moves_qty_ck/.test(msg)) return "입고·출고 수량은 0보다 커야 합니다.";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (e.code === "23503") return "자재를 찾을 수 없습니다.";
  // QA2-A01: 같은 사업장·종류에 이미 있는 코드로 등록하면 원본 DB 메시지가 그대로 노출됐다.
  if (e.code === "23505" || /materials_business_id_kind_code_key|duplicate key value/.test(msg)) return "이미 같은 코드가 있습니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[materials pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요.";
}

function fail(e: { code?: string; message: string; hint?: string | null }): { ok: false; message: string; hint?: string } {
  return { ok: false, message: pgError(e), ...(e.hint ? { hint: e.hint } : {}) };
}

async function withCap<T>(businessId: string, cap: Cap, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireCap(businessId, cap);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  return fn();
}

function reval(businessId: string) {
  revalidatePath(`/w/${businessId}/materials`);
  // 결함 CLICK-PATH-113: 공장 홈(부족자재·자재소비)도 자재 이동에서 파생된 값을 보여준다 —
  // materials 경로만 무효화하면 홈은 이전 서버 캐시를 계속 보여줬다.
  revalidatePath(`/w/${businessId}`);
}

export async function createMaterial(businessId: string, input: { kind: string; code: string; name: string; unit: string; minStock: number; unitCost?: number; vendor?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("materials").insert({
      business_id: businessId, kind: input.kind, code: input.code, name: input.name, unit: input.unit,
      min_stock: input.minStock, unit_cost: input.unitCost ?? null, vendor: input.vendor || null,
    }).select("id").single();
    if (error) return fail(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/**
 * 입고/출고/조정 한 건.
 *  - in/out: write. qty > 0. out 은 현재 재고를 넘으면 hint `insufficient_stock`(0028 F06, DB 트리거).
 *  - adjust: inventory.adjust. **qty = 실사 후 실제 수량**(화면 라벨 "실제 수량"과 같은 뜻). 서버(adjust_material_to RPC)가
 *    잠금 후 차이를 계산해 material_moves.adjust.qty(부호 있는 차이값)로 기록한다(0028 F05). 차이가 0 이면 행을 만들지 않는다.
 */
export async function recordMaterialMove(businessId: string, input: { materialId: string; kind: "in" | "out" | "adjust"; qty: number; reason?: string }): Promise<ActionResult> {
  const cap: Cap = input.kind === "adjust" ? "inventory.adjust" : "write";
  return withCap(businessId, cap, async () => {
    if (input.kind === "adjust") {
      const r = await adjustMaterialTo(businessId, { materialId: input.materialId, actualQty: input.qty, reason: input.reason ?? "" });
      return r.ok ? { ok: true, data: undefined } : r;
    }
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("material_moves").insert({
      material_id: input.materialId, kind: input.kind, qty: input.qty, reason: input.reason?.trim() || null,
    });
    if (error) return fail(error);
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export interface AdjustMaterialResult { before: number; after: number; delta: number; moveId: string | null }

/** 실사 수량으로 맞추기(0028 F05): crm.adjust_material_to. inventory.adjust. actualQty ≥ 0, reason 필수. 차이 0 이면 moveId null. */
export async function adjustMaterialTo(businessId: string, input: { materialId: string; actualQty: number; reason: string }): Promise<ActionResult<AdjustMaterialResult>> {
  return withCap(businessId, "inventory.adjust", async () => {
    if (!input.reason?.trim()) return { ok: false, message: HINT_MESSAGE.reason_required, hint: "reason_required" };
    if (!Number.isFinite(input.actualQty) || input.actualQty < 0) return { ok: false, message: HINT_MESSAGE.invalid_qty, hint: "invalid_qty" };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("adjust_material_to", { p_material: input.materialId, p_actual_qty: input.actualQty, p_reason: input.reason.trim() });
    if (error) return fail(error);
    const r = data as { before: number | string; after: number | string; delta: number | string; move_id: string | null };
    reval(businessId);
    return { ok: true, data: { before: Number(r.before), after: Number(r.after), delta: Number(r.delta), moveId: r.move_id } };
  });
}
