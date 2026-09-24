/**
 * 미용실 홈 대시보드 시각화 전용 집계. lib/domain/salon.ts(회귀검증된 기존 로직)는 건드리지 않는다.
 *
 * salon_payments는 RLS가 is_member까지만 걸려 있다(0011_salon.sql — revenue.read로 테이블 자체를
 * 막지 않는다, v_salon_appointment_balance만 뷰에서 has_cap로 게이팅). 그래서 이 파일이
 * canReadRevenue를 애플리케이션 레벨에서 직접 확인해 금액 쿼리를 아예 보내지 않는다 —
 * DB가 대신 막아주지 않으므로 여기서 막는 게 유일한 방어선이다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import { lastNMonthKeys, buildMonthlySeries, foldTopN, type MonthPoint, type DistributionInput, type FoldedDistribution, type BarItem } from "./home-charts";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface SalonDashboard {
  /** revenue.read 없으면 null — 영역차트는 건수만 보여준다. */
  monthlyAmount: MonthPoint[] | null;
  monthlyCount: MonthPoint[];
  revenueVisible: boolean;
  categoryDonut: FoldedDistribution;
  topStaff: BarItem[];
  /** "오늘 예약" KPI 7일 추이. 전부 0이면 null. */
  apptTrend: number[] | null;
}

const TERMINAL_EXCLUDE = ["취소", "노쇼"];

export async function getSalonDashboard(businessId: string, tz: string, canReadRevenue: boolean): Promise<ReadResult<SalonDashboard>> {
  const sb = getServerSupabase();
  const todayKey = todayKeyInTz(tz);
  const monthKeys = lastNMonthKeys(todayKey, 6);
  const rangeStartMonth = `${monthKeys[0]}-01`;
  const weekAgoKey = addDaysToKey(todayKey, -6);

  const [apptRes, paymentsRes, staffRes] = await Promise.all([
    sb
      .schema("crm")
      .from("salon_appointments")
      .select("id,staff_id,start_at,status,salon_services(category)")
      .eq("business_id", businessId)
      .gte("start_at", `${rangeStartMonth}T00:00:00Z`)
      .limit(3000),
    canReadRevenue
      ? sb.schema("crm").from("salon_payments").select("amount,paid_at").eq("business_id", businessId).gte("paid_at", `${rangeStartMonth}T00:00:00Z`).limit(3000)
      : Promise.resolve({ data: [] as { amount: number; paid_at: string }[], error: null }),
    sb.schema("crm").from("salon_staff_profiles").select("membership_id,display_name").eq("business_id", businessId),
  ]);

  if (apptRes.error) return { ok: false, message: apptRes.error.message };
  if (paymentsRes.error) return { ok: false, message: paymentsRes.error.message };
  if (staffRes.error) return { ok: false, message: staffRes.error.message };

  type ApptRow = { id: string; staff_id: string; start_at: string; status: string; salon_services: { category: string | null } | null };
  const appts = (apptRes.data ?? []) as unknown as ApptRow[];
  const nonCancelled = appts.filter((a) => !TERMINAL_EXCLUDE.includes(a.status));

  // ── 영역차트: 월별 예약 건수(+ 권한 있으면 월별 수납) ──
  const countByMonth = new Map<string, number>();
  for (const a of appts) {
    const key = a.start_at.slice(0, 7);
    if (monthKeys.includes(key)) countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }
  const monthlyCount = buildMonthlySeries(monthKeys, countByMonth);

  let monthlyAmount: MonthPoint[] | null = null;
  if (canReadRevenue) {
    const amountByMonth = new Map<string, number>();
    for (const p of (paymentsRes.data ?? []) as { amount: number; paid_at: string }[]) {
      const key = p.paid_at.slice(0, 7);
      if (monthKeys.includes(key)) amountByMonth.set(key, (amountByMonth.get(key) ?? 0) + p.amount);
    }
    monthlyAmount = buildMonthlySeries(monthKeys, amountByMonth);
  }

  // ── 도넛: 시술 카테고리별(취소·노쇼 제외) — 카테고리는 사업장이 자유 입력하므로 값 내림차순으로 색을 배정한다. ──
  const catCounts = new Map<string, number>();
  for (const a of nonCancelled) {
    const cat = a.salon_services?.category?.trim() || "미분류";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const catInput: DistributionInput[] = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ key: label, label, value }));
  const categoryDonut = foldTopN(catInput, 4);

  // ── 가로막대: 직원별 예약 상위 5(취소·노쇼 제외) ──
  const staffCounts = new Map<string, number>();
  for (const a of nonCancelled) staffCounts.set(a.staff_id, (staffCounts.get(a.staff_id) ?? 0) + 1);
  const nameByStaff = new Map(((staffRes.data ?? []) as { membership_id: string; display_name: string }[]).map((s) => [s.membership_id, s.display_name]));
  const topStaff: BarItem[] = [...staffCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({ key: id, label: nameByStaff.get(id) ?? "담당자", value }));

  // ── "오늘 예약" KPI 7일 추이(appts는 이미 6개월치라 여기서 필터만) ──
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i - 6));
  const byDay = new Map<string, number>();
  for (const a of appts) {
    const dayKey = a.start_at.slice(0, 10);
    if (dayKey >= weekAgoKey && dayKeys.includes(dayKey)) byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
  }
  const trendPoints = dayKeys.map((k) => byDay.get(k) ?? 0);
  const apptTrend = trendPoints.some((v) => v > 0) ? trendPoints : null;

  return { ok: true, data: { monthlyAmount, monthlyCount, revenueVisible: canReadRevenue, categoryDonut, topStaff, apptTrend } };
}
