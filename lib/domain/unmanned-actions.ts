/**
 * 무인매장 서버 액션. 재고 수량은 절대 여기서 계산하지 않는다 — 전부 us_inventory_movements
 * 원장 insert 후 DB 트리거(crm.tg_us_movement_apply)가 재계산한다(0010_unmanned.sql).
 *
 * POS 매출 가져오기(CSV)는 "업로드"와 "대사 확정"을 분리한다(명세 §1-4-4, 수용기준 5) —
 * 업로드만으로는 재고가 변하지 않고, 대사 확정을 눌러야 매칭된 상품의 재고가 판매량만큼 차감된다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";
import { toChecklist, type DailyChecklist } from "./unmanned";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (/expiry_required/.test(msg)) return "유통기한 추적 상품은 입고 시 유통기한을 반드시 입력해야 합니다.";
  if (/expiry_invalid/.test(msg)) return "유통기한은 입고일 이후여야 합니다.";
  if (/stock_negative/.test(msg)) return "이 재고를 음수로 만드는 이동은 처리할 수 없습니다.";
  if (/us_moves_reason_ck|reason/.test(msg) && /adjustment|disposal/.test(msg)) return "조정·폐기 이동은 사유를 반드시 입력해야 합니다.";
  if (e.code === "23505" && /barcode/.test(msg)) return "이미 등록된 바코드입니다.";
  if (/us_products_barcode_ck/.test(msg)) return "바코드 형식이 올바르지 않습니다(EAN-13 체크섬 또는 CODE128 형식을 확인하세요).";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  if (/invalid_qty/.test(msg)) return "수량은 1 이상이어야 합니다.";
  if (/invalid_amount/.test(msg)) return "금액은 0 이상의 정수여야 합니다.";
  if (/file_required/.test(msg)) return "파일명이 필요합니다.";
  if (/checklist_not_found/.test(msg)) return "점검표를 찾을 수 없습니다.";
  if (/item_not_found/.test(msg)) return "점검 항목을 찾을 수 없습니다.";
  if (/range lower bound must be less than or equal to range upper bound/.test(msg)) return "종료 시각이 시작 시각보다 빠릅니다.";
  // ponytail: 23514(제약 위반)를 포함해 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부
  // 메시지 노출 금지, 이전엔 여기서 msg를 그대로 이어붙였다) — 서버 콘솔에만 남긴다.
  console.error("[unmanned pgError] unmapped:", e.code, msg);
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

/** 홈 대시보드·캘린더(업무 파생 일정)도 같이 무효화한다(CLICK-PATH-217). */
function reval(businessId: string) {
  for (const seg of ["", "products", "stock", "tasks", "sales", "calendar"]) revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
}

export async function createProduct(
  businessId: string,
  input: { sku: string; name: string; category?: string; barcode?: string; barcodeType: "EAN13" | "CODE128" | "NONE"; salePrice: number; costPrice: number; lowStockThreshold: number; expiryTracked: boolean }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("us_products").insert({
      business_id: businessId, sku: input.sku, name: input.name, category: input.category || null,
      barcode: input.barcode || null, barcode_type: input.barcodeType, sale_price: input.salePrice,
      cost_price: input.costPrice, low_stock_threshold: input.lowStockThreshold, expiry_tracked: input.expiryTracked,
    }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 로트 생성 + inbound 이동을 crm.us_receive_inbound(0022) 한 트랜잭션으로 — 이동이 실패하면 빈 로트도 남지 않는다. */
export async function receiveInbound(businessId: string, input: { productId: string; qty: number; expiryDate?: string }): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("us_receive_inbound", {
      p_product: input.productId, p_qty: input.qty, p_expiry: input.expiryDate || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** 재고 조정·폐기 — 사유 필수(서버가 CHECK로 재확인). FIFO로 로트를 고른다. */
export async function adjustStock(businessId: string, input: { productId: string; qtyDelta: number; reason: string; disposal?: boolean }): Promise<ActionResult> {
  return withCap(businessId, "inventory.adjust", async () => {
    if (!input.reason.trim()) return { ok: false, message: "조정 사유를 입력하세요." };
    const sb = getServerSupabase();
    const { data: lot } = await sb.schema("crm").from("us_inventory_lots").select("id").eq("product_id", input.productId)
      .order("expiry_date", { ascending: true, nullsFirst: false }).order("received_at", { ascending: true }).limit(1).maybeSingle();
    if (!lot) return { ok: false, message: "이 상품은 아직 입고 로트가 없어 조정할 수 없습니다." };
    const { error } = await sb.schema("crm").from("us_inventory_movements").insert({
      product_id: input.productId, lot_id: lot.id, movement_type: input.disposal ? "disposal" : "adjustment",
      qty_delta: input.qtyDelta, reason: input.reason.trim(),
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** 직접 입력한 판매 — crm.us_record_manual_sale(0022). 재고 차감이 거부되면 판매 기록도 남지 않는다. */
export async function recordManualSale(businessId: string, input: { productId: string; qty: number; amount: number; soldAt: string }): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("us_record_manual_sale", {
      p_business: businessId, p_product: input.productId, p_qty: input.qty, p_amount: input.amount, p_sold_at: input.soldAt || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** CSV 업로드 — 재고에는 아무 영향도 주지 않는다. 대사 확정 전까지 "가져오기 대기"로만 표시. */
export async function importSalesCsv(
  businessId: string,
  fileName: string,
  rows: { sku: string; qty: number; amount: number; soldAt: string }[]
): Promise<ActionResult<{ inserted: number }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data: products } = await sb.schema("crm").from("us_products").select("id,sku").eq("business_id", businessId);
    const bySku = new Map((products ?? []).map((p) => [p.sku, p.id as string]));
    const payload = rows.map((r) => ({
      business_id: businessId, product_id: bySku.get(r.sku) ?? null, raw_sku: r.sku, qty: r.qty, amount: r.amount,
      sold_at: r.soldAt, source: "csv_import" as const, file_name: fileName, reconciled: false,
    }));
    const { error } = await sb.schema("crm").from("us_sales_records").insert(payload);
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { inserted: payload.length } };
  });
}

// "use server" 모듈은 async 함수만 export 할 수 있어 상수는 내부에 둔다. 사유 코드: no_lot | stock_negative | error.
const RECONCILE_SKIP_REASON: Record<string, string> = {
  no_lot: "입고 로트가 없어 차감할 수 없습니다.",
  stock_negative: "재고가 판매량보다 적습니다.",
  error: "처리 중 오류",
};

/**
 * 대사 확정 — crm.us_confirm_reconciliation(0022). 매칭된 미확정 행을 행마다 서브트랜잭션으로
 * 차감+확정하고, 차감이 거부된 행은 **미확정으로 남긴 채** 사유를 돌려준다(이전엔 insert 결과를 안 봤다).
 */
export async function confirmReconciliation(
  businessId: string,
  fileName: string
): Promise<ActionResult<{ affected: number; skipped: { id: string; reason: string }[] }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("us_confirm_reconciliation", { p_business: businessId, p_file_name: fileName });
    if (error) return { ok: false, message: pgError(error) };
    const d = data as { confirmed: number; skipped: { id: string; reason: string }[] };
    reval(businessId);
    if (d.confirmed === 0 && d.skipped.length > 0) {
      const reasons = Array.from(new Set(d.skipped.map((s) => RECONCILE_SKIP_REASON[s.reason] ?? s.reason)));
      return { ok: false, message: `확정된 행이 없습니다(${d.skipped.length}건 보류: ${reasons.join(", ")}).` };
    }
    return { ok: true, data: { affected: d.confirmed, skipped: d.skipped } };
  });
}

export async function matchSalesRow(businessId: string, salesRecordId: string, productId: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("us_sales_records").update({ product_id: productId }).eq("id", salesRecordId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 매출 행을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function createTask(businessId: string, input: { taskType: string; title: string; dueDate: string; assigneeId?: string }): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("us_tasks").insert({
      business_id: businessId, task_type: input.taskType, title: input.title, due_date: input.dueDate, assignee_id: input.assigneeId || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function updateTaskStatus(businessId: string, taskId: string, status: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("us_tasks").update({ status }).eq("id", taskId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 작업을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function generateExpiryTasks(businessId: string): Promise<ActionResult<{ created: number }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("us_generate_expiry_tasks", { p_business: businessId, p_days: 7 });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { created: (data as number) ?? 0 } };
  });
}

/** 실사 헤더 + 활성 상품 라인 전개를 crm.us_start_stock_take(0022) 한 트랜잭션으로. */
export async function startStockTake(businessId: string): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "inventory.adjust", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("us_start_stock_take", { p_business: businessId });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data as string } };
  });
}

export async function setStockTakeCount(businessId: string, lineId: string, countedQty: number): Promise<ActionResult> {
  return withCap(businessId, "inventory.adjust", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("us_stock_take_lines").update({ counted_qty: countedQty }).eq("id", lineId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 실사 행을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function completeStockTake(businessId: string, stockTakeId: string): Promise<ActionResult<{ diffLines: number }>> {
  return withCap(businessId, "inventory.adjust", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("us_complete_stock_take", { p_take: stockTakeId });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { diffLines: (data as number) ?? 0 } };
  });
}

// ── 일일 점검표(0023 U1) ──────────────────────────────────────────
/** 하루 1회(멱등). 같은 날 다시 눌러도 기존 점검표를 돌려준다. 재고 부족·유통기한 임박(7일) 항목이 자동 포함된다. */
export async function generateDailyChecklist(businessId: string, dateKey?: string): Promise<ActionResult<DailyChecklist>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("us_generate_daily_checklist", { p_business: businessId, p_date: dateKey ?? null, p_days: 7 });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: toChecklist(data as Record<string, unknown>) };
  });
}

export async function setChecklistItem(businessId: string, checklistId: string, key: string, done: boolean, memo?: string): Promise<ActionResult<DailyChecklist>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("us_set_checklist_item", { p_checklist: checklistId, p_key: key, p_done: done, p_memo: memo ?? null });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: toChecklist(data as Record<string, unknown>) };
  });
}

/** 도매처·발주 메모(0023 U2). */
export async function setSupplierNote(businessId: string, productId: string, note: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("us_products").update({ supplier_note: note.trim() || null }).eq("id", productId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 상품을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
