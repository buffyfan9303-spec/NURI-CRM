/**
 * 무인매장 조회 전용. 쓰기는 unmanned-actions.ts.
 * 원가(cost_price)는 v_us_products_cost(cost.read 게이팅)로만 읽는다 — 일반 뷰(v_us_products)에는
 * 원가 컬럼 자체가 없다(0010_unmanned.sql §9).
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayRangeISO } from "./home";
import { addDaysToKey } from "@/lib/utils/datetime";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface UsProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  barcode: string | null;
  barcodeType: "EAN13" | "CODE128" | "NONE";
  unit: string;
  salePrice: number;
  costPrice?: number;
  lowStockThreshold: number;
  expiryTracked: boolean;
  active: boolean;
  onHand: number;
  lowStock: boolean;
  /** 도매처·발주 메모(선택, 0023 U2). */
  supplierNote: string | null;
}

export interface UsLot {
  id: string;
  productId: string;
  lotNo: string;
  qtyCurrent: number;
  expiryDate: string | null;
  receivedAt: string;
}

export interface UsMovement {
  id: string;
  productId: string;
  lotId: string | null;
  movementType: string;
  qtyDelta: number;
  reason: string | null;
  refNo: string | null;
  occurredAt: string;
}

export interface UsTask {
  id: string;
  taskType: string;
  title: string;
  assigneeId: string | null;
  dueDate: string;
  status: string;
}

export interface UsSalesRecord {
  id: string;
  productId: string | null;
  rawSku: string | null;
  qty: number;
  amount: number;
  soldAt: string;
  source: "manual" | "csv_import";
  fileName: string | null;
  reconciled: boolean;
}

export interface ReconciliationRow {
  productId: string;
  sku: string;
  name: string;
  salesQty: number;
  saleOutQty: number;
  stockTakeDiff: number;
  onHand: number;
  unreconciledQty: number;
}

export async function listProducts(businessId: string, canReadCost: boolean): Promise<ReadResult<UsProduct[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_us_products").select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  let costMap = new Map<string, number>();
  if (canReadCost) {
    const { data: costData } = await sb.schema("crm").from("v_us_products_cost").select("id,cost_price").eq("business_id", businessId);
    costMap = new Map((costData ?? []).map((r) => [r.id as string, r.cost_price as number]));
  }
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, sku: r.sku, name: r.name, category: r.category, barcode: r.barcode, barcodeType: r.barcode_type,
      unit: r.unit, salePrice: r.sale_price, costPrice: costMap.get(r.id), lowStockThreshold: r.low_stock_threshold,
      expiryTracked: r.expiry_tracked, active: r.active, onHand: r.on_hand, lowStock: r.low_stock, supplierNote: r.supplier_note ?? null,
    })),
  };
}

export async function listLots(businessId: string, productId?: string): Promise<ReadResult<UsLot[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("us_inventory_lots").select("*").eq("business_id", businessId).order("expiry_date", { ascending: true, nullsFirst: false });
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, productId: r.product_id, lotNo: r.lot_no, qtyCurrent: r.qty_current, expiryDate: r.expiry_date, receivedAt: r.received_at })) };
}

export async function listMovements(businessId: string, productId?: string, limit = 50): Promise<ReadResult<UsMovement[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("us_inventory_movements").select("*").eq("business_id", businessId).order("occurred_at", { ascending: false }).limit(limit);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, productId: r.product_id, lotId: r.lot_id, movementType: r.movement_type, qtyDelta: r.qty_delta, reason: r.reason, refNo: r.ref_no, occurredAt: r.occurred_at })) };
}

export async function listExpiringLots(businessId: string, days = 7): Promise<ReadResult<(UsLot & { productName: string })[]>> {
  const sb = getServerSupabase();
  const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.schema("crm").from("us_inventory_lots").select("*, us_products(name)").eq("business_id", businessId)
    .not("expiry_date", "is", null).lte("expiry_date", horizon).gt("qty_current", 0).order("expiry_date");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, productId: r.product_id, lotNo: r.lot_no, qtyCurrent: r.qty_current, expiryDate: r.expiry_date, receivedAt: r.received_at, productName: r.us_products?.name ?? "" })) };
}

export async function listTasks(businessId: string): Promise<ReadResult<UsTask[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("us_tasks").select("*").eq("business_id", businessId).order("due_date");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, taskType: r.task_type, title: r.title, assigneeId: r.assignee_id, dueDate: r.due_date, status: r.status })) };
}

export async function listSalesRecords(businessId: string, limit = 100): Promise<ReadResult<UsSalesRecord[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_us_sales_records").select("*").eq("business_id", businessId).order("sold_at", { ascending: false }).limit(limit);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, productId: r.product_id, rawSku: r.raw_sku, qty: r.qty, amount: r.amount, soldAt: r.sold_at, source: r.source, fileName: r.file_name, reconciled: r.reconciled })) };
}

export async function listReconciliation(businessId: string): Promise<ReadResult<ReconciliationRow[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_us_reconciliation").select("*").eq("business_id", businessId);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      productId: r.product_id, sku: r.sku, name: r.name, salesQty: r.sales_qty, saleOutQty: r.sale_out_qty,
      stockTakeDiff: r.stock_take_diff, onHand: r.on_hand, unreconciledQty: r.unreconciled_qty,
    })),
  };
}

export interface UsStockTake {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}
export interface UsStockTakeLine {
  id: string;
  productId: string;
  productName: string;
  expectedQty: number;
  countedQty: number | null;
  diffQty: number;
}

export async function listStockTakes(businessId: string): Promise<ReadResult<UsStockTake[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("us_stock_takes").select("*").eq("business_id", businessId).order("started_at", { ascending: false }).limit(20);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, status: r.status, startedAt: r.started_at, completedAt: r.completed_at })) };
}

export async function listStockTakeLines(stockTakeId: string): Promise<ReadResult<UsStockTakeLine[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("us_stock_take_lines").select("*, us_products(name)").eq("stock_take_id", stockTakeId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, productId: r.product_id, productName: r.us_products?.name ?? "", expectedQty: r.expected_qty, countedQty: r.counted_qty, diffQty: r.diff_qty })) };
}

export interface UnmannedToday {
  todayKey: string;
  lowStock: UsProduct[];
  /** taskType "보충"이고 오늘이 마감이며 아직 처리 전(예정)인 작업. */
  restockToday: UsTask[];
  /** 오늘 이하 마감인데 아직 처리 전인 모든 점검·업무(밀린 것 포함). */
  checksIncomplete: UsTask[];
  /** 오늘보다 뒤, 7일 이내 마감인 예정 업무 — 홈 보조영역 "점검 일정". */
  upcomingTasks: UsTask[];
  expiringSoon: (UsLot & { productName: string })[];
  recentMovements: UsMovement[];
  /** 대사에서 수량이 안 맞는 상품 수(실사 차이). */
  stockDiffCount: number;
}

/** 홈 대시보드용 "오늘 현황". 가짜 지표 없음 — 전부 실제 쿼리 결과. */
export async function getUnmannedToday(businessId: string, tz: string): Promise<ReadResult<UnmannedToday>> {
  const { todayKey } = todayRangeISO(tz);
  const weekEnd = addDaysToKey(todayKey, 7);
  const [productsRes, tasksRes, expiringRes, reconRes, movementsRes] = await Promise.all([
    listProducts(businessId, false),
    listTasks(businessId),
    listExpiringLots(businessId, 7),
    listReconciliation(businessId),
    listMovements(businessId, undefined, 5),
  ]);
  if (!productsRes.ok) return productsRes;
  if (!tasksRes.ok) return tasksRes;
  if (!expiringRes.ok) return expiringRes;
  if (!reconRes.ok) return reconRes;
  if (!movementsRes.ok) return movementsRes;

  const lowStock = productsRes.data.filter((p) => p.lowStock);
  const pending = tasksRes.data.filter((t) => t.status === "예정");
  const restockToday = pending.filter((t) => t.taskType === "보충" && t.dueDate === todayKey);
  const checksIncomplete = pending.filter((t) => t.dueDate <= todayKey);
  const upcomingTasks = pending.filter((t) => t.dueDate > todayKey && t.dueDate <= weekEnd);
  const stockDiffCount = reconRes.data.filter((r) => r.unreconciledQty !== 0).length;

  return {
    ok: true,
    data: {
      todayKey,
      lowStock,
      restockToday,
      checksIncomplete,
      upcomingTasks,
      expiringSoon: expiringRes.data,
      recentMovements: movementsRes.data,
      stockDiffCount,
    },
  };
}

// ── 일일 점검표(0023 U1) ──────────────────────────────────────────
export interface ChecklistItem {
  key: string;
  label: string;
  kind: "fixed" | "low_stock" | "expiry";
  done: boolean;
  memo: string | null;
  refId?: string | null;
}
export interface DailyChecklist {
  id: string;
  checkDate: string;
  items: ChecklistItem[];
  total: number;
  done: number;
  /** 0~100 정수 */
  rate: number;
  updatedAt: string;
}

export function toChecklist(j: Record<string, unknown>): DailyChecklist {
  const items = ((j.items as Record<string, unknown>[]) ?? []).map((i) => ({
    key: String(i.key), label: String(i.label), kind: (i.kind as ChecklistItem["kind"]) ?? "fixed", done: Boolean(i.done),
    memo: (i.memo as string | null) ?? null, refId: (i.ref_id as string | null) ?? null,
  }));
  const done = items.filter((i) => i.done).length;
  return { id: j.id as string, checkDate: j.check_date as string, items, total: items.length, done, rate: items.length === 0 ? 100 : Math.round((done * 100) / items.length), updatedAt: j.updated_at as string };
}

/** 특정 날짜 점검표(없으면 null). 생성은 unmanned-actions.generateDailyChecklist. */
export async function getDailyChecklist(businessId: string, dateKey: string): Promise<ReadResult<DailyChecklist | null>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("us_daily_checklists").select("*").eq("business_id", businessId).eq("check_date", dateKey).maybeSingle();
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data ? toChecklist(data as Record<string, unknown>) : null };
}

export interface ChecklistStatus { exists: boolean; checklistId: string | null; total: number; done: number; rate: number; complete: boolean; /** 홈 배지: 없거나 100% 미만 */ warn: boolean }

/** 오늘(Asia/Seoul) 점검표 상태 — 홈 배지용(crm.us_checklist_status). */
export async function getChecklistStatus(businessId: string, dateKey?: string): Promise<ReadResult<ChecklistStatus>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("us_checklist_status", { p_business: businessId, p_date: dateKey ?? null });
  if (error) return { ok: false, message: error.message };
  const j = (data ?? {}) as Record<string, unknown>;
  const exists = Boolean(j.exists), complete = Boolean(j.complete);
  return { ok: true, data: { exists, checklistId: (j.checklist_id as string | null) ?? null, total: Number(j.total ?? 0), done: Number(j.done ?? 0), rate: Number(j.rate ?? 0), complete, warn: !exists || !complete } };
}

// ── 추정 손실(도난) 리포트(0023 U4) ───────────────────────────────
export interface LossReport {
  from: string; to: string;
  /** revenue.read 없음 → saleAmount null. cost.read 없음 → costAmount null. */
  masked: boolean;
  totalQty: number;
  costAmount: number | null;
  saleAmount: number | null;
  byProduct: { productId: string; sku: string; name: string; lossQty: number; costAmount: number | null; saleAmount: number | null }[];
  byWeekday: { isodow: number; lossQty: number; costAmount: number | null }[];
}

export async function getLossReport(businessId: string, from: string, to: string): Promise<ReadResult<LossReport>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("us_loss_report", { p_business: businessId, p_from: from, p_to: to });
  if (error) return { ok: false, message: error.message };
  const j = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    ok: true,
    data: {
      from, to, masked: Boolean(j.masked), totalQty: Number(j.total_qty ?? 0), costAmount: n(j.cost_amount), saleAmount: n(j.sale_amount),
      byProduct: ((j.by_product as Record<string, unknown>[]) ?? []).map((r) => ({ productId: String(r.product_id), sku: String(r.sku), name: String(r.name), lossQty: Number(r.loss_qty), costAmount: n(r.cost_amount), saleAmount: n(r.sale_amount) })),
      byWeekday: ((j.by_weekday as Record<string, unknown>[]) ?? []).map((r) => ({ isodow: Number(r.isodow), lossQty: Number(r.loss_qty), costAmount: n(r.cost_amount) })),
    },
  };
}

// ── 보충 발주 추천(0023 U2) ───────────────────────────────────────
export interface ReorderSuggestion { productId: string; sku: string; name: string; unit: string; supplierNote: string | null; onHand: number; soldQty: number; dailyRate: number; suggestedQty: number }

/** 최근 days 판매속도 × horizonDays(다음 방문까지) + 저재고 임계 − 현재고. 0 이하는 제외돼서 온다. */
export async function getReorderSuggestions(businessId: string, days = 14, horizonDays = 7): Promise<ReadResult<ReorderSuggestion[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("us_reorder_suggestions", { p_business: businessId, p_days: days, p_horizon_days: horizonDays });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      productId: String(r.product_id), sku: String(r.sku), name: String(r.name), unit: String(r.unit ?? "개"), supplierNote: (r.supplier_note as string | null) ?? null,
      onHand: Number(r.on_hand), soldQty: Number(r.sold_qty), dailyRate: Number(r.daily_rate), suggestedQty: Number(r.suggested_qty),
    })),
  };
}

/** 발주 문구(복사용). 순수 함수. */
export function reorderMessage(businessName: string, rows: ReorderSuggestion[]): string {
  if (rows.length === 0) return `[${businessName}] 발주 필요 품목이 없습니다.`;
  return [`[${businessName}] 발주 요청`, ...rows.map((r) => `· ${r.name} (${r.sku}) ${r.suggestedQty}${r.unit}${r.supplierNote ? ` — ${r.supplierNote}` : ""}`)].join("\n");
}
