/**
 * 렌탈 홈 대시보드 시각화(KPI 스파크라인·영역차트·도넛·가로막대) 전용 집계.
 * lib/domain/rental.ts(회귀검증된 기존 로직)는 건드리지 않고 이 파일에서 새로 조회한다.
 *
 * canReadRevenue=false면 ledger_entries(금액)를 애초에 요청하지 않는다 — salon.ts/academy.ts의
 * "revenue.read 없으면 아예 안 부른다" 관례와 동일(§5.8, "권한 없는 지표는 0이 아니라 자리 자체를 뺀다").
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import {
  lastNMonthKeys,
  buildMonthlySeries,
  foldTopN,
  type MonthPoint,
  type DistributionInput,
  type FoldedDistribution,
  type BarItem,
} from "./home-charts";
import { RESERVATION_STATUS_LABEL, type ReservationStatus } from "./rental-types";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface RentalDashboard {
  /** 월별 대여 매출(revenue.read 없으면 null — 차트 자체가 아예 만들어지지 않는다). */
  monthlyAmount: MonthPoint[] | null;
  /** 월별 신규 예약 건수 — 항상 존재(권한 무관, 건수는 매출이 아니다). */
  monthlyCount: MonthPoint[];
  revenueVisible: boolean;
  statusDonut: FoldedDistribution;
  topUnits: BarItem[];
  /** "오늘 출고" KPI의 실제 7일 추이(오래된→최근, 오늘 포함). 전부 0이면 null(가짜 추세선 금지). */
  checkoutTrend: number[] | null;
}

/** 도넛 고정 순서 — 운영상 활성 상태 4개. draft/closed/cancelled는 항상 "기타"로 접는다(색이 안 바뀜). */
const STATUS_ORDER: ReservationStatus[] = ["confirmed", "out", "partial_return", "returned"];

/** postgres tstzrange 텍스트("[2027-06-01 00:00:00+09,...)")에서 시작 날짜 키(YYYY-MM-DD)만 뽑는다. */
function periodStartDateKey(period: string | null): string | null {
  if (!period) return null;
  const inner = period.slice(1, -1);
  const start = inner.slice(0, inner.indexOf(",")).replace(/"/g, "");
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(start.trim());
  return m ? m[1] : null;
}

export async function getRentalDashboard(
  businessId: string,
  tz: string,
  canReadRevenue: boolean
): Promise<ReadResult<RentalDashboard>> {
  const sb = getServerSupabase();
  const todayKey = todayKeyInTz(tz);
  const monthKeys = lastNMonthKeys(todayKey, 6);
  const rangeStartMonth = `${monthKeys[0]}-01`;

  const [resRes, ledgerRes, itemsRes] = await Promise.all([
    sb.schema("crm").from("rental_reservations").select("id,status,period,created_at").eq("business_id", businessId).limit(1000),
    canReadRevenue
      ? sb
          .schema("crm")
          .from("ledger_entries")
          .select("amount,occurred_at")
          .eq("business_id", businessId)
          .eq("entry_type", "rental_revenue")
          .gte("occurred_at", `${rangeStartMonth}T00:00:00Z`)
          .limit(2000)
      : Promise.resolve({ data: [] as { amount: number; occurred_at: string }[], error: null }),
    sb
      .schema("crm")
      .from("rental_reservation_items")
      .select("unit_id")
      .eq("business_id", businessId)
      .in("item_status", ["out", "returned"])
      .not("unit_id", "is", null)
      .limit(2000),
  ]);

  if (resRes.error) return { ok: false, message: resRes.error.message };
  if (ledgerRes.error) return { ok: false, message: ledgerRes.error.message };
  if (itemsRes.error) return { ok: false, message: itemsRes.error.message };

  type ResRow = { id: string; status: ReservationStatus; period: string | null; created_at: string };
  const reservations = (resRes.data ?? []) as unknown as ResRow[];
  const live = reservations.filter((r) => r.status !== "cancelled");

  // ── 도넛: 예약 상태별(취소 제외) ──
  const countsByStatus = new Map<string, number>();
  for (const r of live) countsByStatus.set(r.status, (countsByStatus.get(r.status) ?? 0) + 1);
  const donutInput: DistributionInput[] = STATUS_ORDER.map((s) => ({
    key: s,
    label: RESERVATION_STATUS_LABEL[s],
    value: countsByStatus.get(s) ?? 0,
  }));
  const etcCount = [...countsByStatus.entries()]
    .filter(([k]) => !STATUS_ORDER.includes(k as ReservationStatus))
    .reduce((sum, [, v]) => sum + v, 0);
  if (etcCount > 0) donutInput.push({ key: "__etc__", label: "기타", value: etcCount });
  const statusDonut = foldTopN(donutInput, 4);

  // ── 영역차트: 월별 신규 예약 건수 + (권한 있으면) 월별 대여 매출 ──
  const countByMonth = new Map<string, number>();
  for (const r of reservations) {
    const key = r.created_at.slice(0, 7);
    if (monthKeys.includes(key)) countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }
  const monthlyCount = buildMonthlySeries(monthKeys, countByMonth);

  let monthlyAmount: MonthPoint[] | null = null;
  if (canReadRevenue) {
    const amountByMonth = new Map<string, number>();
    for (const row of (ledgerRes.data ?? []) as { amount: number; occurred_at: string }[]) {
      const key = row.occurred_at.slice(0, 7);
      if (monthKeys.includes(key)) amountByMonth.set(key, (amountByMonth.get(key) ?? 0) + row.amount);
    }
    monthlyAmount = buildMonthlySeries(monthKeys, amountByMonth);
  }

  // ── 가로막대: 개체 활용도 상위 5(출고 이력 기준) ──
  const unitCounts = new Map<string, number>();
  for (const row of (itemsRes.data ?? []) as { unit_id: string }[]) {
    unitCounts.set(row.unit_id, (unitCounts.get(row.unit_id) ?? 0) + 1);
  }
  const topUnitIds = [...unitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let topUnits: BarItem[] = [];
  if (topUnitIds.length > 0) {
    const { data: units } = await sb.schema("crm").from("v_rental_units").select("id,unit_code,sku_id").in("id", topUnitIds);
    const skuIds = [...new Set((units ?? []).map((u) => u.sku_id as string))];
    const { data: skus } = skuIds.length
      ? await sb.schema("crm").from("rental_skus").select("id,product_id").in("id", skuIds)
      : { data: [] as { id: string; product_id: string }[] };
    const productIds = [...new Set((skus ?? []).map((s) => s.product_id as string))];
    const { data: products } = productIds.length
      ? await sb.schema("crm").from("rental_products").select("id,name").in("id", productIds)
      : { data: [] as { id: string; name: string }[] };
    const productNameBySku = new Map<string, string>();
    const productNameById = new Map((products ?? []).map((p) => [p.id as string, p.name as string]));
    for (const s of skus ?? []) productNameBySku.set(s.id as string, productNameById.get(s.product_id as string) ?? "");
    const codeByUnit = new Map((units ?? []).map((u) => [u.id as string, { code: u.unit_code as string, skuId: u.sku_id as string }]));
    topUnits = topUnitIds.map((id) => {
      const u = codeByUnit.get(id);
      const productName = u ? productNameBySku.get(u.skuId) ?? "" : "";
      return { key: id, label: u ? `${productName} · ${u.code}` : "개체", value: unitCounts.get(id) ?? 0 };
    });
  }

  // ── "오늘 출고" KPI 실제 7일 추이(오래된→최근) — 이미 메모리에 있는 reservations로 계산, 추가 쿼리 없음 ──
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i - 6));
  const checkoutByDay = new Map<string, number>();
  const CHECKOUT_LIKE: ReservationStatus[] = ["confirmed", "out", "partial_return", "returned", "closed"];
  for (const r of live) {
    if (!CHECKOUT_LIKE.includes(r.status)) continue;
    const dayKey = periodStartDateKey(r.period);
    if (dayKey && dayKeys.includes(dayKey)) checkoutByDay.set(dayKey, (checkoutByDay.get(dayKey) ?? 0) + 1);
  }
  const trendPoints = dayKeys.map((k) => checkoutByDay.get(k) ?? 0);
  const checkoutTrend = trendPoints.some((v) => v > 0) ? trendPoints : null;

  return {
    ok: true,
    data: { monthlyAmount, monthlyCount, revenueVisible: canReadRevenue, statusDonut, topUnits, checkoutTrend },
  };
}
