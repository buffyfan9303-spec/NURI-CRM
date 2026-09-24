/**
 * 자재/교재·교구 조회 — 공장·학원 공용(0007_factory.sql crm.materials/material_moves).
 * 코디네이터 지시에 따라 학원도 이 표를 그대로 쓴다(0012_academy.sql의 acad_materials는
 * 여기서 쓰지 않는다 — 컴포넌트/테이블 재사용을 우선한 결정, 미해결 사항에 기록).
 * kind CHECK 제약이 fabric/lining/button/기타로 고정돼 있어 학원 물품은 '기타'로 등록한다.
 */
import { getServerSupabase } from "@/lib/supabase/server";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface Material {
  id: string;
  kind: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  unitCost?: number | null;
  vendor: string | null;
  active: boolean;
}

export interface MaterialMove {
  id: string;
  materialId: string;
  kind: "in" | "out" | "adjust";
  qty: number;
  reason: string | null;
  at: string;
}

export async function listMaterials(businessId: string, canReadCost: boolean): Promise<ReadResult<Material[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_materials").select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  let costMap = new Map<string, number>();
  if (canReadCost) {
    const { data: costData } = await sb.schema("crm").from("v_materials_cost").select("id,unit_cost").eq("business_id", businessId);
    costMap = new Map((costData ?? []).map((r) => [r.id as string, r.unit_cost as number]));
  }
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, kind: r.kind, code: r.code, name: r.name, unit: r.unit, stock: r.stock, minStock: r.min_stock,
      unitCost: canReadCost ? costMap.get(r.id) ?? null : undefined, vendor: r.vendor, active: r.active,
    })),
  };
}

export async function listMaterialMoves(businessId: string, materialId?: string, limit = 50): Promise<ReadResult<MaterialMove[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("material_moves").select("*").eq("business_id", businessId).order("at", { ascending: false }).limit(limit);
  if (materialId) q = q.eq("material_id", materialId);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, materialId: r.material_id, kind: r.kind, qty: r.qty, reason: r.reason, at: r.at })) };
}
