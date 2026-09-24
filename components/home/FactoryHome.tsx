import Link from "next/link";
import { ClipboardPlus, ListChecks, Settings, ClipboardList, TriangleAlert, Truck, CalendarRange } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { HomeLayout, HomeEmpty } from "./HomeLayout";
import { WorkList, type WorkRow } from "./WorkList";
import { WorkTable, type WorkTableRow } from "./WorkTable";
import { KpiRow, KpiCard } from "@/components/charts/KpiCard";
import { AreaChartCard, type AreaSeries } from "@/components/charts/AreaChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { FACTORY_PROCESS_STAGES } from "@/lib/domain/factory-types";
import type { FactoryTodaySummary, ProcessBoardRow, FactoryProcessStatus } from "@/lib/domain/factory-types";
import type { HomeMetric } from "@/lib/domain/home";
import { trendDelta } from "@/lib/domain/home-charts";
import type { FactoryDashboard } from "@/lib/domain/factory-dashboard";
import { formatKRW } from "@/lib/domain/money";

const PROCESS_STATUS_LABEL: Record<FactoryProcessStatus, string> = {
  todo: "예정",
  doing: "진행중",
  done: "완료",
  hold: "보류",
  skip: "건너뜀",
};

export function FactoryHome({
  todayResult,
  processBoardResult,
  inProgressOrderCount,
  dashboard,
  todayKey,
  base,
  businessName,
  canManage = false,
  canWrite = false,
  canReadRevenue = false,
}: {
  todayResult: { ok: true; data: FactoryTodaySummary } | { ok: false; message: string };
  processBoardResult: { ok: true; data: ProcessBoardRow[] } | { ok: false; message: string };
  /** 상태 = '진행중'인 주문 수(접수 제외) — listFactoryOrders에서 이미 계산해 넘긴다. */
  inProgressOrderCount: number;
  dashboard: { ok: true; data: FactoryDashboard } | { ok: false; message: string };
  todayKey: string;
  base: string;
  businessName: string;
  canManage?: boolean;
  /** orders/new는 write 캡을 요구한다 — 없으면 버튼을 숨긴다. */
  canWrite?: boolean;
  /** 결함 CLICK-PATH-106: 이번 달 완료 공급가 합계는 revenue.read 없으면 숨긴다(다른 업종과 동일 계약). */
  canReadRevenue?: boolean;
}) {
  const actions = (
    <>
      {canWrite && (
        <Link href={`${base}/orders/new`}>
          <Button size="sm">
            <ClipboardPlus size={15} aria-hidden />새 수주
          </Button>
        </Link>
      )}
      <Link href={`${base}/production`}>
        <Button size="sm" variant="secondary">
          <ListChecks size={15} aria-hidden />작업지시 확인
        </Button>
      </Link>
      {canManage && (
        <Link href={`${base}/settings`}>
          <Button size="sm" variant="ghost">
            <Settings size={15} aria-hidden />설정
          </Button>
        </Link>
      )}
    </>
  );

  if (!todayResult.ok || !processBoardResult.ok) {
    const message = !todayResult.ok ? todayResult.message : (processBoardResult as { ok: false; message: string }).message;
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[19px] font-semibold text-t">{businessName}</h1>
          <div className="flex gap-2">{actions}</div>
        </div>
        <Card className="px-2 py-2">
          <ErrorState title="오늘 현황을 불러오지 못했습니다." description={message} />
        </Card>
      </div>
    );
  }

  const d = todayResult.data;
  const board = processBoardResult.data;

  const dueTodayOrders = d.dueThisWeek.filter((o) => o.dueDate === todayKey);
  const shipReady = board.filter((p) => p.stage === "출고" && p.status !== "done");
  const inspecting = board.filter((p) => p.stage === "검수" && p.status !== "done");
  const activeProcesses = board.filter((p) => p.status !== "done" && p.status !== "skip");

  const totalWork = activeProcesses.length + d.lowStockMaterials.length;
  if (totalWork === 0) {
    return (
      <HomeEmpty
        title={businessName}
        metricLabels={["진행 수주", "오늘 납기", "지연 공정", "출고 대기"]}
        structureHint="수주가 생기면 여기에 공정별 작업 목록과 담당자·납기가 표시됩니다."
        message="진행 중인 수주가 없습니다."
        description="새 수주를 등록하면 공정별 작업지시가 여기에 표시됩니다."
        actions={actions}
      />
    );
  }

  const metrics: HomeMetric[] = [
    { key: "inprogress", label: "진행 수주", count: inProgressOrderCount, href: `${base}/orders?status=진행중` },
    { key: "due-today", label: "오늘 납기", count: dueTodayOrders.length, tone: "warn", href: `${base}/orders?due=${todayKey}` },
    { key: "delayed", label: "지연 공정", count: d.delayedProcesses.length, tone: "alert", href: `${base}/production` },
    { key: "ship-ready", label: "출고 대기", count: shipReady.length, href: `${base}/production` },
  ];

  const dash = dashboard.ok ? dashboard.data : null;
  const dueTrend = dash?.dueTrend ? trendDelta(dash.dueTrend) : null;

  const kpiCards: { metric: HomeMetric; icon: React.ReactNode; tint: string; trend?: ReturnType<typeof trendDelta> & { points: number[]; color: string } }[] = [
    { metric: metrics[0], icon: <ClipboardList size={16} color="var(--ch-1)" />, tint: "color-mix(in srgb, var(--ch-1) 16%, transparent)" },
    {
      metric: metrics[1],
      icon: <CalendarRange size={16} color="var(--ch-2)" />,
      tint: "color-mix(in srgb, var(--ch-2) 16%, transparent)",
      trend: dash?.dueTrend ? { ...dueTrend!, points: dash.dueTrend, color: "var(--ch-2)" } : undefined,
    },
    { metric: metrics[2], icon: <TriangleAlert size={16} color="var(--et)" />, tint: "var(--eb)" },
    { metric: metrics[3], icon: <Truck size={16} color="var(--ch-4)" />, tint: "color-mix(in srgb, var(--ch-4) 16%, transparent)" },
  ];

  const areaSeries: AreaSeries[] = [{ key: "count", label: "건수", unit: "건", points: dash?.monthlyCompleted ?? [] }];

  const rows: WorkRow[] = activeProcesses
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .map((p) => ({
      id: p.id,
      href: `${base}/orders/${p.orderId}`,
      time: p.dueDate ? p.dueDate.slice(5).replace("-", ".") : undefined,
      title: `${p.orderNo} · ${p.customerName ?? "고객 미지정"}`,
      subtitle: p.assignee ? `${p.stage} · ${p.assignee}` : p.stage,
      statusLabel: PROCESS_STATUS_LABEL[p.status],
      statusTone: p.status === "hold" ? "alert" : p.status === "doing" ? "warn" : "neutral",
      action: "공정 확인",
    }));

  // 하단 좌측 업무 표 — 공장은 공정 단위라 수량/금액 열이 자연스럽지 않다(억지로 채우지 않는다).
  // 진행률은 FACTORY_PROCESS_STAGES 안에서 이 공정이 몇 번째 단계인지로 계산한다.
  const tableRows: WorkTableRow[] = activeProcesses
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .map((p) => {
      const stageIdx = FACTORY_PROCESS_STAGES.indexOf(p.stage);
      return {
        id: p.id,
        href: `${base}/orders/${p.orderId}`,
        title: `${p.orderNo} · ${p.customerName ?? "고객 미지정"}`,
        subtitle: p.assignee ? `${p.stage} · ${p.assignee}` : p.stage,
        progressPct: stageIdx >= 0 ? ((stageIdx + 1) / FACTORY_PROCESS_STAGES.length) * 100 : undefined,
        statusLabel: PROCESS_STATUS_LABEL[p.status],
        statusTone: p.status === "hold" ? ("alert" as const) : p.status === "doing" ? ("warn" as const) : ("neutral" as const),
      };
    });

  const fittingShipRows: WorkRow[] = [
    ...d.fittingsToday.map((o) => ({
      id: `fit-${o.orderId}`,
      href: `${base}/orders/${o.orderId}`,
      title: `${o.orderNo} · ${o.customerName ?? "고객 미지정"}`,
      statusLabel: "가봉",
      statusTone: "neutral" as const,
    })),
    ...shipReady.map((p) => ({
      id: `ship-${p.id}`,
      href: `${base}/orders/${p.orderId}`,
      title: `${p.orderNo} · ${p.customerName ?? "고객 미지정"}`,
      statusLabel: "출고 대기",
      statusTone: "warn" as const,
    })),
  ];

  return (
    <HomeLayout
      title={businessName}
      actions={actions}
      metrics={
        <div className="flex flex-col gap-4">
          <KpiRow>
            {kpiCards.map(({ metric, icon, tint, trend }) => (
              <KpiCard
                key={metric.key}
                label={metric.label}
                value={String(metric.count)}
                href={metric.href}
                icon={icon}
                tintColor={tint}
                trend={trend && trend.points.length >= 2 ? { ...trend } : undefined}
              />
            ))}
          </KpiRow>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
            <Card className="p-4 lg:col-span-8">
              <AreaChartCard title="완료 주문 건수" description="최근 6개월 월별 추이" series={areaSeries} />
            </Card>
            <Card className="p-4 lg:col-span-4">
              <DonutChart
                title="공정 단계별 분포"
                description="접수·진행중 주문의 활성 공정"
                slices={dash?.stageDonut.slices.map((s) => ({ ...s, href: s.colorIndex !== null ? `${base}/production` : undefined })) ?? []}
                total={dash?.stageDonut.total ?? 0}
              />
            </Card>
          </div>
        </div>
      }
      primaryTitle="공정별 작업 목록"
      primary={<WorkTable rows={tableRows} showQty={false} showAmount={false} emptyTitle="진행 중인 공정이 없습니다." />}
      secondary={
        <>
          <Card className="p-4">
            <HorizontalBarChart title="자재 소비 상위" description="누적 출고 수량 기준" items={dash?.topMaterials.map((m) => ({ ...m, href: `${base}/materials` })) ?? []} />
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-[14px] font-semibold text-t">오늘 가봉 · 출고 대기</h2>
            <WorkList rows={fittingShipRows.slice(0, 8)} emptyTitle="오늘 가봉·출고 대기가 없습니다." />
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-[14px] font-semibold text-t">부족 자재</h2>
            {d.lowStockMaterials.length === 0 ? (
              <p className="text-[12.5px] text-t3">부족한 자재가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-[12.5px]">
                {d.lowStockMaterials.slice(0, 6).map((m) => (
                  <li key={m.id}>
                    <Link href={`${base}/materials`} className="flex items-center justify-between rounded-[6px] px-1 py-1 hover:bg-sf2">
                      <span className="truncate text-t2">{m.name}</span>
                      <span className="tabular-nums text-et">
                        {m.stock}/{m.minStock}
                        {m.unit}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-[14px] font-semibold text-t">검수 대기</h2>
            <WorkList
              rows={inspecting.slice(0, 6).map((p) => ({
                id: p.id,
                href: `${base}/orders/${p.orderId}`,
                title: `${p.orderNo} · ${p.customerName ?? "고객 미지정"}`,
                statusLabel: PROCESS_STATUS_LABEL[p.status],
                statusTone: "neutral" as const,
              }))}
              emptyTitle="검수 대기가 없습니다."
            />
          </Card>
          {d.completedThisMonth.count > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 text-[14px] font-semibold text-t">이번 달 완료</h2>
              <p className="text-[12.5px] text-t2">
                {d.completedThisMonth.count}건
                {canReadRevenue && <> · 공급가 합계 {formatKRW(d.completedThisMonth.totalSupply)}</>}
              </p>
            </Card>
          )}
        </>
      }
    />
  );
}
