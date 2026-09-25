import Link from "next/link";
import {
  CalendarPlus,
  ScanLine,
  Scissors,
  Truck,
  Undo2,
  TriangleAlert,
  CalendarDays,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { WorkList, type WorkRow } from "./WorkList";
import { WorkTable, type WorkTableRow } from "./WorkTable";
import { KpiRow, KpiCard } from "@/components/charts/KpiCard";
import { AreaChartCard, type AreaSeries } from "@/components/charts/AreaChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { RetryButton, CardHead, ViewAll } from "@/components/rental/listkit";
import { OverdueNotices } from "@/components/rental/OverdueNotices";
import type { RentalToday, ReservationRow } from "@/lib/domain/rental-types";
import type { HomeMetric } from "@/lib/domain/home";
import { todayRangeISO } from "@/lib/domain/home";
import { trendDelta } from "@/lib/domain/home-charts";
import type { RentalDashboard } from "@/lib/domain/rental-dashboard";
import { formatInTz } from "@/lib/utils/datetime";

/** 차트 부품(components/charts, 이 역할 소유 아님)의 작은 조작 요소를 터치 환경에서만 44px 로 키운다. */
const TOUCH_WRAP =
  "[@media(pointer:coarse)]:[&_button]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:flex [@media(pointer:coarse)]:[&_a]:items-center [@media(pointer:coarse)]:[&_summary]:min-h-[44px] [@media(pointer:coarse)]:[&_summary]:flex [@media(pointer:coarse)]:[&_summary]:items-center";
/** 같은 줄의 KPI 4장이 추이선 유무와 관계없이 같은 높이가 되도록 링크·카드를 셀 높이로 늘린다. */
const KPI_CELL = "h-full [&>*]:h-full [&>*>*]:h-full";

function itemsSummary(r: ReservationRow): string {
  if (r.items.length === 0) return "품목 미배정";
  const names = Array.from(new Set(r.items.map((i) => i.productName).filter(Boolean)));
  if (names.length === 0) return `${r.items.length}품목`;
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}` : names.join(", ");
}

export function RentalHome({
  result,
  dashboard,
  base,
  tz,
  businessName,
  canManage = false,
  canWrite = false,
}: {
  result: { ok: true; data: RentalToday } | { ok: false; message: string };
  dashboard: { ok: true; data: RentalDashboard } | { ok: false; message: string };
  base: string;
  tz: string;
  businessName: string;
  canManage?: boolean;
  /** reservations/new는 write 캡을 요구한다 — 없으면 버튼을 숨긴다(눌러서 전체 화면 권한거부로 보내지 않는다). */
  canWrite?: boolean;
}) {
  const { startISO, endISO, todayKey } = todayRangeISO(tz);
  const todayLabel = formatInTz(startISO, tz, "M월 d일 EEE");

  // 상단바 CTA(새 예약 → 예약 목록)와 다른 동작만 둔다: 등록 폼 직행·스캔·설정.
  const actions = (
    <>
      {canWrite && (
        <Link href={`${base}/reservations/new`} className="min-w-0">
          <Button size="sm">
            <CalendarPlus size={15} aria-hidden />예약 등록
          </Button>
        </Link>
      )}
      <Link href={`${base}/scan`} className="min-w-0">
        <Button size="sm" variant="secondary">
          <ScanLine size={15} aria-hidden />스캔
        </Button>
      </Link>
    </>
  );
  const header = (
    <PageHeader settingsHref={canManage ? `${base}/settings` : undefined}
      title={businessName}
      description="오늘 처리할 피팅·출고·반납과 최근 6개월 추이"
      meta={
        <span className="inline-flex items-center gap-1 rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium text-t2">
          <CalendarDays size={12} aria-hidden />{todayLabel}
        </span>
      }
      actions={actions}
    />
  );

  if (!result.ok) {
    return (
      <PageBody wide>
        {header}
        <Card>
          <ErrorState title="오늘 현황을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  const d = result.data;
  const dash = dashboard.ok ? dashboard.data : null;
  const canReadRevenue = dash?.revenueVisible ?? false;
  const checkoutTrend = dash?.checkoutTrend ? trendDelta(dash.checkoutTrend) : null;
  const isEmpty =
    d.fittingsToday.length + d.checkoutsToday.length + d.returnsToday.length + d.overdue.length + d.staleDrafts.length + d.careWaiting.length + d.lowStockSkus.length === 0;

  const metrics: HomeMetric[] = [
    {
      key: "fitting",
      label: "오늘 피팅",
      count: d.fittingsToday.length,
      href: `${base}/reservations?fittingFrom=${encodeURIComponent(startISO)}&fittingTo=${encodeURIComponent(endISO)}`,
    },
    { key: "checkout", label: "오늘 출고", count: d.checkoutsToday.length, href: `${base}/reservations?status=confirmed&quick=today` },
    {
      key: "return",
      label: "오늘 반납",
      count: d.returnsToday.length,
      href: `${base}/reservations?status=out,partial_return&returnFrom=${encodeURIComponent(startISO)}&returnTo=${encodeURIComponent(endISO)}`,
    },
    { key: "overdue", label: "연체", count: d.overdue.length, tone: "alert", href: `${base}/reservations?status=out,partial_return` },
  ];

  const kpiCards: { metric: HomeMetric; icon: React.ReactNode; tint: string; trend?: ReturnType<typeof trendDelta> & { points: number[]; color: string }; note?: string }[] = [
    { metric: metrics[0], icon: <Scissors size={16} color="var(--ch-1)" />, tint: "color-mix(in srgb, var(--ch-1) 16%, transparent)", note: `${todayKey.slice(5).replace("-", ".")} 기준` },
    {
      metric: metrics[1],
      icon: <Truck size={16} color="var(--ch-2)" />,
      tint: "color-mix(in srgb, var(--ch-2) 16%, transparent)",
      trend: dash?.checkoutTrend ? { ...checkoutTrend!, points: dash.checkoutTrend, color: "var(--ch-2)" } : undefined,
      note: "최근 7일 출고 없음",
    },
    { metric: metrics[2], icon: <Undo2 size={16} color="var(--ch-4)" />, tint: "color-mix(in srgb, var(--ch-4) 16%, transparent)", note: "반납 예정일 기준" },
    { metric: metrics[3], icon: <TriangleAlert size={16} color="var(--et)" />, tint: "var(--eb)", note: d.overdue.length > 0 ? "반납 예정일 지남" : "지연 없음" },
  ];

  const areaSeries: AreaSeries[] = [];
  if (dash?.monthlyAmount) areaSeries.push({ key: "amount", label: "금액", unit: "원", points: dash.monthlyAmount });
  areaSeries.push({ key: "count", label: "건수", unit: "건", points: dash?.monthlyCount ?? [] });

  const rows: (WorkRow & { time: string })[] = [];
  for (const f of d.fittingsToday) {
    rows.push({
      id: `fit-${f.id}`,
      href: `${base}/reservations/${f.id}`,
      time: formatInTz(f.fittingAt, tz, "HH:mm"),
      title: f.customerName ?? "고객 미지정",
      subtitle: "피팅",
      statusLabel: "피팅 예정",
      statusTone: "neutral",
      action: "피팅 진행",
    });
  }
  for (const r of d.checkoutsToday) {
    rows.push({
      id: `out-${r.id}`,
      href: `${base}/reservations/${r.id}`,
      time: formatInTz(r.periodStart, tz, "HH:mm"),
      title: r.customerName ?? "고객 미지정",
      subtitle: itemsSummary(r),
      statusLabel: "확정",
      statusTone: "neutral",
      action: "출고 처리",
    });
  }
  for (const r of d.returnsToday) {
    rows.push({
      id: `ret-${r.id}`,
      href: `${base}/reservations/${r.id}`,
      time: formatInTz(r.periodEnd, tz, "HH:mm"),
      title: r.customerName ?? "고객 미지정",
      subtitle: itemsSummary(r),
      statusLabel: r.status === "partial_return" ? "부분반납" : "출고중",
      statusTone: "warn",
      action: "반납 접수",
    });
  }
  rows.sort((a, b) => a.time.localeCompare(b.time));

  // 하단 좌측 업무 표(레퍼런스 형태) — 금액은 revenue.read일 때만(§작업5). fitting은 아직
  // 품목이 배정 전이라 수량/금액이 없다("—"로 표시). 반납은 부분반납일 때만 진행바(실재 분모).
  const reservationFee = (r: ReservationRow) => r.items.reduce((s, i) => s + i.fee - i.discount, 0);
  const tableRows: WorkTableRow[] = [
    ...d.fittingsToday.map((f) => ({
      id: `fit-${f.id}`,
      href: `${base}/reservations/${f.id}`,
      title: f.customerName ?? "고객 미지정",
      subtitle: `피팅 · ${formatInTz(f.fittingAt, tz, "HH:mm")}`,
      statusLabel: "피팅 예정",
      statusTone: "neutral" as const,
    })),
    ...d.checkoutsToday.map((r) => ({
      id: `out-${r.id}`,
      href: `${base}/reservations/${r.id}`,
      title: r.customerName ?? "고객 미지정",
      subtitle: itemsSummary(r),
      qty: `${r.items.length}개`,
      amount: canReadRevenue ? reservationFee(r) : null,
      statusLabel: "출고 대기",
      statusTone: "neutral" as const,
    })),
    ...d.returnsToday.map((r) => {
      const returned = r.items.filter((i) => i.itemStatus === "returned").length;
      return {
        id: `ret-${r.id}`,
        href: `${base}/reservations/${r.id}`,
        title: r.customerName ?? "고객 미지정",
        subtitle: itemsSummary(r),
        qty: `${r.items.length}개`,
        amount: canReadRevenue ? reservationFee(r) : null,
        progressPct: r.status === "partial_return" && r.items.length > 0 ? (returned / r.items.length) * 100 : undefined,
        statusLabel: r.status === "partial_return" ? "부분반납" : "반납 대기",
        statusTone: "warn" as const,
      };
    }),
  ];

  // 확인이 필요한 일 — 연체를 최우선, 그다음 미확정, 정비대기, 품절 순으로 한 구역에만 모은다.
  const exceptions: WorkRow[] = [
    ...d.staleDrafts.map((r) => ({
      id: `sd-${r.id}`,
      href: `${base}/reservations/${r.id}`,
      title: r.customerName ?? "고객 미지정",
      subtitle: "대여기간이 시작됐지만 아직 확정되지 않음",
      statusLabel: "미확정",
      statusTone: "warn" as const,
    })),
    ...d.careWaiting.map((c) => ({
      id: `cw-${c.id}`,
      href: `${base}/care?status=open,doing`,
      title: `${c.productName} · ${c.unitCode}`,
      subtitle: c.kind === "wash" ? "세탁 대기" : c.kind === "repair" ? "수선 대기" : "검수 대기",
      statusLabel: c.status === "doing" ? "진행중" : "대기",
      statusTone: "neutral" as const,
    })),
    ...d.lowStockSkus.map((s) => ({
      id: `ls-${s.skuId}`,
      href: `${base}/catalog`,
      title: s.productName,
      subtitle: `${s.color} / ${s.size}`,
      statusLabel: "품절",
      statusTone: "warn" as const,
    })),
  ];

  const chartError = !dashboard.ok ? dashboard.message : null;
  const nowMs = Date.now();
  const overdueRows = d.overdue.map((r) => ({
    id: r.id,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    periodEndIso: r.periodEnd,
    daysLate: Math.max(1, Math.floor((nowMs - new Date(r.periodEnd).getTime()) / 86400000)),
  }));

  return (
    <PageBody wide>
      {header}
      <div className="flex flex-col gap-4">
        <KpiRow>
          {kpiCards.map(({ metric, icon, tint, trend, note }) => (
            <div key={metric.key} className={KPI_CELL}>
              <KpiCard
                label={metric.label}
                value={String(metric.count)}
                href={metric.href}
                icon={icon}
                tintColor={tint}
                trend={trend && trend.points.length >= 2 ? { ...trend } : undefined}
                emptyNote={note}
              />
            </div>
          ))}
        </KpiRow>

        <div className={`grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12 ${TOUCH_WRAP}`}>
          <Card className="flex flex-col p-4 sm:p-5 lg:col-span-8">
            {chartError ? (
              <ErrorState title="추이를 불러오지 못했습니다." description={chartError} />
            ) : (
              <AreaChartCard
                title={canReadRevenue ? "대여 매출·건수" : "월별 예약 건수"}
                description="최근 6개월 월별 추이 · 예약 시작일 기준"
                series={areaSeries}
                insufficientNote="예약이 두 달 이상 쌓이면 추이가 표시됩니다."
              />
            )}
          </Card>
          <Card className="flex flex-col p-4 sm:p-5 lg:col-span-4">
            {chartError ? (
              <ErrorState title="분포를 불러오지 못했습니다." description={chartError} />
            ) : (
              <DonutChart
                title="예약 상태별 분포"
                description="취소 제외, 현재 전체 예약"
                slices={dash?.statusDonut.slices.map((s) => ({ ...s, href: s.colorIndex !== null ? `${base}/reservations?status=${s.key}` : undefined })) ?? []}
                total={dash?.statusDonut.total ?? 0}
              />
            )}
          </Card>
        </div>

        <div className={`grid grid-cols-1 items-start gap-4 lg:grid-cols-12 ${TOUCH_WRAP}`}>
          <Card className="p-4 lg:col-span-8">
            <CardHead
              title="오늘 처리할 예약"
              description={`피팅 ${d.fittingsToday.length} · 출고 ${d.checkoutsToday.length} · 반납 ${d.returnsToday.length}`}
              action={<ViewAll href={`${base}/reservations?quick=today`} />}
            />
            <WorkTable
              rows={tableRows}
              showAmount={canReadRevenue}
              emptyTitle={isEmpty ? "오늘 처리할 예약이 없습니다." : "오늘 피팅·출고·반납이 없습니다."}
              emptyDescription={isEmpty ? "새 예약을 등록하거나 상품·개체를 먼저 준비하세요." : "확인이 필요한 일은 오른쪽에서 이어서 처리하세요."}
              emptyAction={
                canWrite && isEmpty ? (
                  <Link href={`${base}/reservations/new`}>
                    <Button size="sm"><CalendarPlus size={14} aria-hidden />예약 등록</Button>
                  </Link>
                ) : undefined
              }
            />
          </Card>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Card className="p-4">
              <HorizontalBarChart title="개체 활용도 상위" description="출고 이력 기준" items={dash?.topUnits.map((u) => ({ ...u, href: `${base}/catalog` })) ?? []} />
            </Card>
            <Card className="p-4">
              <CardHead title="오늘 일정" description="시간순" action={<ViewAll href={`${base}/calendar`}>캘린더</ViewAll>} />
              {rows.length === 0 ? (
                <p className="text-[12.5px] text-t3">오늘 일정이 없습니다.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--bd)] text-[12.5px]">
                  {rows.slice(0, 8).map((r) => (
                    <li key={r.id}>
                      <Link href={r.href} className="flex min-h-[40px] items-center gap-2 rounded-[var(--r-sm)] px-1 text-t2 hover:bg-sf2 [@media(pointer:coarse)]:min-h-[44px]">
                        <span className="w-11 shrink-0 tabular-nums text-t3">{r.time}</span>
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-t">{r.subtitle === "피팅" ? "피팅" : r.action}</span> · {r.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <CardHead
                title="반납 지연"
                description={d.overdue.length > 0 ? `${d.overdue.length}건 · 독촉 문구를 바로 보낼 수 있습니다.` : "반납 예정일이 지난 출고 예약"}
                action={d.overdue.length > 0 ? <ViewAll href={`${base}/reservations?status=out,partial_return`}>목록</ViewAll> : undefined}
              />
              <OverdueNotices businessId={base.replace("/w/", "")} businessName={businessName} tz={tz} rows={overdueRows} canReadRevenue={canReadRevenue} />
            </Card>
            <Card className="p-4">
              <CardHead title="확인이 필요한 일" description="미확정 → 정비 대기 → 품절 순" />
              <WorkList rows={exceptions.slice(0, 8)} emptyTitle="확인이 필요한 예외가 없습니다." />
            </Card>
          </div>
        </div>
      </div>
    </PageBody>
  );
}
