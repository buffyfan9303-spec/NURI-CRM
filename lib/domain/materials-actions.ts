"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
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
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function recordMaterialMove(businessId: string, input: { materialId: string; kind: "in" | "out" | "adjust"; qty: number; reason?: string }): Promise<ActionResult> {
  const cap: Cap = input.kind === "adjust" ? "inventory.adjust" : "write";
  return withCap(businessId, cap, async () => {
    if (input.kind === "adjust" && !input.reason?.trim()) return { ok: false, message: "조정 사유를 입력하세요." };
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("material_moves").insert({
      material_id: input.materialId, kind: input.kind, qty: input.qty, reason: input.reason?.trim() || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
