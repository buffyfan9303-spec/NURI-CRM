/**
 * 학원 홈 대시보드 시각화 전용 집계. lib/domain/academy.ts(회귀검증된 기존 로직)는 건드리지 않는다.
 *
 * v_acad_invoice_balance는 뷰 자체가 has_cap(revenue.read)로 게이팅돼 있어(0012_academy.sql)
 * 권한 없는 사용자는 RLS로 이미 0행을 받지만, listInvoiceBalances()와 같은 관례로 여기서도
 * canReadRevenue=false면 애초에 쿼리를 보내지 않는다(§5.8, 응답 페이로드에도 금액이 없어야 한다).
 * acad_attendance는 pii.read로 게이팅된다(학생 개인정보) — canReadPii=false면 출석률 막대를
 * 만들지 않는다(0건으로 채우지 않고 자리 자체를 비운다).
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import { lastNMonthKeys, buildMonthlySeries, foldTopN, type MonthPoint, type DistributionInput, type FoldedDistribution, type BarItem } from "./home-charts";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface AcademyDashboard {
  /** revenue.read 없으면 null. */
  monthlyAmount: MonthPoint[] | null;
  /** 월별 신규 등록 건수 — 항상 존재. */
  monthlyCount: MonthPoint[];
  revenueVisible: boolean;
  classDonut: FoldedDistribution;
  /** pii.read 없으면 null(출결 자체를 조회하지 않는다). */
  attendanceRateBar: BarItem[] | null;
  /** "오늘 수업" KPI 7일 추이. 전부 0이면 null. */
  sessionTrend: number[] | null;
}

export async function getAcademyDashboard(
  businessId: string,
  tz: string,
  canReadRevenue: boolean,
  canReadPii: boolean
): Promise<ReadResult<AcademyDashboard>> {
  const sb = getServerSupabase();
  const todayKey = todayKeyInTz(tz);
  const monthKeys = lastNMonthKeys(todayKey, 6);
  const rangeStartMonth = monthKeys[0]; // "YYYY-MM" — acad_invoices.period와 같은 형식
  const weekStartKey = addDaysToKey(todayKey, -6);
  const weekEndKey = addDaysToKey(todayKey, 6);

  const [invoiceRes, enrollRes, classRes, sessionRes] = await Promise.all([
    canReadRevenue
      ? sb.schema("crm").from("v_acad_invoice_balance").select("period,amount").eq("business_id", businessId).gte("period", rangeStartMonth).limit(3000)
      : Promise.resolve({ data: [] as { period: string; amount: number }[], error: null }),
    sb.schema("crm").from("acad_enrollments").select("id,class_id,status,enrolled_at").eq("business_id", businessId).limit(3000),
    sb.schema("crm").from("acad_classes").select("id,name").eq("business_id", businessId),
    sb
      .schema("crm")
      .from("acad_sessions")
      .select("id,class_id,session_date")
      .eq("business_id", businessId)
      .gte("session_date", weekStartKey)
      .lte("session_date", weekEndKey)
      .limit(2000),
  ]);

  if (invoiceRes.error) return { ok: false, message: invoiceRes.error.message };
  if (enrollRes.error) return { ok: false, message: enrollRes.error.message };
  if (classRes.error) return { ok: false, message: classRes.error.message };
  if (sessionRes.error) return { ok: false, message: sessionRes.error.message };

  // ── 영역차트: 월별 신규 등록 건수(+ 권한 있으면 월별 수강료 청구액) ──
  const countByMonth = new Map<string, number>();
  for (const e of (enrollRes.data ?? []) as { enrolled_at: string }[]) {
    const key = e.enrolled_at.slice(0, 7);
    if (monthKeys.includes(key)) countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);
  }
  const monthlyCount = buildMonthlySeries(monthKeys, countByMonth);

  let monthlyAmount: MonthPoint[] | null = null;
  if (canReadRevenue) {
    const amountByMonth = new Map<string, number>();
    for (const inv of (invoiceRes.data ?? []) as { period: string; amount: number }[]) {
      if (monthKeys.includes(inv.period)) amountByMonth.set(inv.period, (amountByMonth.get(inv.period) ?? 0) + inv.amount);
    }
    monthlyAmount = buildMonthlySeries(monthKeys, amountByMonth);
  }

  // ── 도넛: 반별 등록(활성) — 반 이름은 사업장이 자유 입력하므로 값 내림차순으로 색을 배정한다. ──
  const classNameById = new Map(((classRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const enrollByClass = new Map<string, number>();
  for (const e of (enrollRes.data ?? []) as { class_id: string; status: string }[]) {
    if (e.status !== "활성") continue;
    enrollByClass.set(e.class_id, (enrollByClass.get(e.class_id) ?? 0) + 1);
  }
  const classInput: DistributionInput[] = [...enrollByClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({ key: id, label: classNameById.get(id) ?? "반 미지정", value }));
  const classDonut = foldTopN(classInput, 4);

  // ── 가로막대: 반별 출석률(pii.read 있을 때만) ──
  let attendanceRateBar: BarItem[] | null = null;
  const sessions = (sessionRes.data ?? []) as { id: string; class_id: string; session_date: string }[];
  if (canReadPii && sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id);
    const { data: attRows, error: attErr } = await sb
      .schema("crm")
      .from("acad_attendance")
      .select("session_id,status")
      .in("session_id", sessionIds)
      .limit(5000);
    if (attErr) return { ok: false, message: attErr.message };
    const classBySession = new Map(sessions.map((s) => [s.id, s.class_id]));
    const totalByClass = new Map<string, number>();
    const presentByClass = new Map<string, number>();
    for (const r of (attRows ?? []) as { session_id: string; status: string }[]) {
      const classId = classBySession.get(r.session_id);
      if (!classId) continue;
      totalByClass.set(classId, (totalByClass.get(classId) ?? 0) + 1);
      if (r.status === "출석" || r.status === "지각") presentByClass.set(classId, (presentByClass.get(classId) ?? 0) + 1);
    }
    attendanceRateBar = [...totalByClass.entries()]
      .filter(([, total]) => total > 0)
      .map(([classId, total]) => ({
        key: classId,
        label: classNameById.get(classId) ?? "반 미지정",
        value: Math.round(((presentByClass.get(classId) ?? 0) / total) * 100),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  // ── "오늘 수업" KPI 7일 추이(sessions는 이미 지난주~다음주 범위) ──
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(todayKey, i - 6));
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (dayKeys.includes(s.session_date)) byDay.set(s.session_date, (byDay.get(s.session_date) ?? 0) + 1);
  }
  const trendPoints = dayKeys.map((k) => byDay.get(k) ?? 0);
  const sessionTrend = trendPoints.some((v) => v > 0) ? trendPoints : null;

  return {
    ok: true,
    data: { monthlyAmount, monthlyCount, revenueVisible: canReadRevenue, classDonut, attendanceRateBar, sessionTrend },
  };
}
