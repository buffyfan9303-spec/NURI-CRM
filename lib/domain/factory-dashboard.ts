/**
 * 공장 홈 대시보드 시각화 전용 집계. lib/domain/factory.ts(회귀검증된 기존 로직)는 건드리지 않는다.
 *
 * "월별 완료 주문"은 개수 지표다(공급가 합계 아님) — factory_orders.total/supply는 이 앱에서
 * revenue.read로 게이팅되지 않는(FactoryHome이 이미 무조건 노출) 필드라, 굳이 금액 축을 섞어
 * dual-axis 위험을 만들지 않고 명시적으로 "건수"만 다룬다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import { lastNMonthKeys, buildMonthlySeries, foldTopN, type MonthPoint, type DistributionInput, type FoldedDistribution, type BarItem } from "./home-charts";
import { FACTORY_PROCESS_STAGES, type FactoryProcessStage } from "./factory-types";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface FactoryDashboard {
  monthlyCompleted: MonthPoint[];
  stageDonut: FoldedDistribution;
  topMaterials: BarItem[];
  /** "오늘 납기" KPI — 앞으로 7일(오늘 포함)간 날짜별 납기 건수. 전부 0이면 null. */
  dueTrend: number[] | null;
}

/** 도넛 고정 순서 — FACTORY_PROCESS_STAGES 선언 순서를 그대로 쓴다(이미 코드베이스 전역의 고정 순서). */
const STAGE_ORDER: FactoryProcessStage[] = FACTORY_PROCESS_STAGES.slice(0, 4);

export async function getFactoryDashboard(businessId: string, tz: string): Promise<ReadResult<FactoryDashboard>> {
  const sb = getServerSupabase();
  const todayKey = todayKeyInTz(tz);
  const monthKeys = lastNMonthKeys(todayKey, 6);
  const rangeStartMonth = `${monthKeys[0]}-01`;
  const weekEnd = addDaysToKey(todayKey, 6);

  const [completedRes, processRes, moveRes, dueRes] = await Promise.all([
    sb
      .schema("crm")
      .from("factory_orders")
      .select("delivered_date")
      .eq("business_id", businessId)
      .eq("status", "완료")
      .gte("delivered_date", rangeStartMonth)
      .limit(2000),
    sb
      .schema("crm")
      .from("factory_processes")
      .select("stage, factory_orders!inner(status,business_id)")
      .eq("business_id", businessId)
      .in("factory_orders.status", ["접수", "진행중"])
      .not("status", "in", "(done,skip)")
      .limit(2000),
    sb.schema("crm").from("material_moves").select("material_id,qty").eq("business_id", businessId).eq("kind", "out").limit(3000),
    sb
      .schema("crm")
      .from("factory_orders")
      .select("due_date")
      .eq("business_id", businessId)
      .gte("due_date", todayKey)
      .lte("due_date", weekEnd)
      .not("status", "in", "(완료,취소)")
      .limit(1000),
  ]);

  if (completedRes.error) return { ok: false, message: completedRes.error.message };
  if (processRes.error) return { ok: false, message: processRes.error.message };
  if (moveRes.error) return { ok: false, message: moveRes.error.message };
  if (dueRes.error) return { ok: false, message: dueRes.error.message };

  // ── 영역차트: 월별 완료 주문 건수 ──
  const countByMonth = new Map<string, number>();
  for (const r of (completedRes.data ?? []) as { delivered_date: string | null }[]) {
    if (!r.delivered_date) continue;
    const key = r.delivered_date.slice(0, 7);
    if (monthKeys.includes(key)) countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }
  const monthlyCompleted = buildMonthlySeries(monthKeys, countByMonth);

  // ── 도넛: 진행 중 공정의 단계별 분포 ──
  const stageCounts = new Map<string, number>();
  for (const r of (processRes.data ?? []) as { stage: FactoryProcessStage }[]) {
    stageCounts.set(r.stage, (stageCounts.get(r.stage) ?? 0) + 1);
  }
  const donutInput: DistributionInput[] = STAGE_ORDER.map((s) => ({ key: s, label: s, value: stageCounts.get(s) ?? 0 }));
  const etc = [...stageCounts.entries()].filter(([k]) => !STAGE_ORDER.includes(k as FactoryProcessStage)).reduce((s, [, v]) => s + v, 0);
  if (etc > 0) donutInput.push({ key: "__etc__", label: "기타", value: etc });
  const stageDonut = foldTopN(donutInput, 4);

  // ── 가로막대: 자재 소비 상위 5(전체 기간 출고 이력) ──
  const qtyByMaterial = new Map<string, number>();
  for (const r of (moveRes.data ?? []) as { material_id: string; qty: number }[]) {
    qtyByMaterial.set(r.material_id, (qtyByMaterial.get(r.material_id) ?? 0) + r.qty);
  }
  const topMaterialIds = [...qtyByMaterial.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  let topMaterials: BarItem[] = [];
  if (topMaterialIds.length > 0) {
    const { data: mats } = await sb.schema("crm").from("v_materials").select("id,name,unit").in("id", topMaterialIds);
    const nameById = new Map((mats ?? []).map((m) => [m.id as string, { name: m.name as string, unit: m.unit as string }]));
    topMaterials = topMaterialIds.map((id) => {
      const m = nameById.get(id);
      return { key: id, label: m?.name ?? "자재", value: qtyByMaterial.get(id) ?? 0, unit: m?.unit ?? "개" };
    });
  }

  // ── "오늘 납기" KPI 7일 추이(오늘 포함 앞으로) ──
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i));
  const dueByDay = new Map<string, number>();
  for (const r of (dueRes.data ?? []) as { due_date: string | null }[]) {
    if (r.due_date && dayKeys.includes(r.due_date)) dueByDay.set(r.due_date, (dueByDay.get(r.due_date) ?? 0) + 1);
  }
  const trendPoints = dayKeys.map((k) => dueByDay.get(k) ?? 0);
  const dueTrend = trendPoints.some((v) => v > 0) ? trendPoints : null;

  return { ok: true, data: { monthlyCompleted, stageDonut, topMaterials, dueTrend } };
}
