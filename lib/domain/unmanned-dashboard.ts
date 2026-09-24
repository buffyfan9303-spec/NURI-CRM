/**
 * 무인매장 홈 대시보드 시각화 전용 집계. lib/domain/unmanned.ts(회귀검증된 기존 로직)는
 * 건드리지 않는다.
 *
 * us_sales_records.amount는 이 스키마에서 revenue.read로 게이팅되지 않는 필드지만(0010_unmanned.sql
 * — is_member면 전부 select 가능), 이 화면(홈 대시보드)의 새 금액 차트만큼은 다른 업종과 같은
 * 규칙으로 canReadRevenue를 애플리케이션 레벨에서 확인해 없으면 금액 집계를 아예 만들지 않는다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import { lastNMonthKeys, buildMonthlySeries, foldTopN, type MonthPoint, type DistributionInput, type FoldedDistribution, type BarItem } from "./home-charts";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface UnmannedDashboard {
  /** revenue.read 없으면 null. */
  monthlyAmount: MonthPoint[] | null;
  /** 월별 판매 건수 — 항상 존재. */
  monthlyCount: MonthPoint[];
  revenueVisible: boolean;
  categoryDonut: FoldedDistribution;
  topProducts: BarItem[];
  /** "오늘 보충" KPI 7일 추이(재고 보충형 점검 작업 마감일 기준). 전부 0이면 null. */
  restockTrend: number[] | null;
}

export async function getUnmannedDashboard(businessId: string, tz: string, canReadRevenue: boolean): Promise<ReadResult<UnmannedDashboard>> {
  const sb = getServerSupabase();
  const todayKey = todayKeyInTz(tz);
  const monthKeys = lastNMonthKeys(todayKey, 6);
  const rangeStartMonth = `${monthKeys[0]}-01`;
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i - 6));

  const [salesRes, productsRes, tasksRes] = await Promise.all([
    sb.schema("crm").from("v_us_sales_records").select("product_id,qty,amount,sold_at").eq("business_id", businessId).gte("sold_at", rangeStartMonth).limit(5000),
    sb.schema("crm").from("v_us_products").select("id,name,category,on_hand").eq("business_id", businessId),
    sb
      .schema("crm")
      .from("us_tasks")
      .select("task_type,due_date")
      .eq("business_id", businessId)
      .eq("task_type", "보충")
      .gte("due_date", dayKeys[0])
      .lte("due_date", dayKeys[dayKeys.length - 1])
      .limit(1000),
  ]);

  if (salesRes.error) return { ok: false, message: salesRes.error.message };
  if (productsRes.error) return { ok: false, message: productsRes.error.message };
  if (tasksRes.error) return { ok: false, message: tasksRes.error.message };

  type SaleRow = { product_id: string | null; qty: number; amount: number; sold_at: string };
  const sales = (salesRes.data ?? []) as SaleRow[];
  const products = (productsRes.data ?? []) as { id: string; name: string; category: string | null; on_hand: number }[];

  // ── 영역차트: 월별 판매 건수(+ 권한 있으면 월별 판매 금액) ──
  const countByMonth = new Map<string, number>();
  for (const s of sales) {
    const key = s.sold_at.slice(0, 7);
    if (monthKeys.includes(key)) countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }
  const monthlyCount = buildMonthlySeries(monthKeys, countByMonth);

  let monthlyAmount: MonthPoint[] | null = null;
  if (canReadRevenue) {
    const amountByMonth = new Map<string, number>();
    for (const s of sales) {
      const key = s.sold_at.slice(0, 7);
      if (monthKeys.includes(key)) amountByMonth.set(key, (amountByMonth.get(key) ?? 0) + s.amount);
    }
    monthlyAmount = buildMonthlySeries(monthKeys, amountByMonth);
  }

  // ── 도넛: 카테고리별 재고(현재 보유 수량 합) ──
  const stockByCategory = new Map<string, number>();
  for (const p of products) {
    const cat = p.category?.trim() || "미분류";
    stockByCategory.set(cat, (stockByCategory.get(cat) ?? 0) + Math.max(p.on_hand, 0));
  }
  const catInput: DistributionInput[] = [...stockByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ key: label, label, value }));
  const categoryDonut = foldTopN(catInput, 4);

  // ── 가로막대: 판매 상위 상품 5(수량 기준 — 금액이 아니라 권한 무관하게 항상 보여줄 수 있다) ──
  const qtyByProduct = new Map<string, number>();
  for (const s of sales) {
    if (!s.product_id) continue;
    qtyByProduct.set(s.product_id, (qtyByProduct.get(s.product_id) ?? 0) + s.qty);
  }
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  const topProducts: BarItem[] = [...qtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({ key: id, label: nameById.get(id) ?? "상품", value }));

  // ── "오늘 보충" KPI 7일 추이(재고보충 유형 작업의 마감일 분포) ──
  const restockByDay = new Map<string, number>();
  for (const t of (tasksRes.data ?? []) as { task_type: string; due_date: string }[]) {
    if (dayKeys.includes(t.due_date)) restockByDay.set(t.due_date, (restockByDay.get(t.due_date) ?? 0) + 1);
  }
  const trendPoints = dayKeys.map((k) => restockByDay.get(k) ?? 0);
  const restockTrend = trendPoints.some((v) => v > 0) ? trendPoints : null;

  return { ok: true, data: { monthlyAmount, monthlyCount, revenueVisible: canReadRevenue, categoryDonut, topProducts, restockTrend } };
}
