import Link from "next/link";
import { PackagePlus, ClipboardCheck, TriangleAlert, ClipboardList, CalendarDays } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { WorkTable, type WorkTableRow } from "./WorkTable";
import { KpiRow, KpiCard } from "@/components/charts/KpiCard";
import { AreaChartCard, type AreaSeries } from "@/components/charts/AreaChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { RetryButton, CardHead, ViewAll } from "@/components/rental/listkit";
import type { UnmannedToday } from "@/lib/domain/unmanned";
import type { HomeMetric } from "@/lib/domain/home";
import { todayRangeISO } from "@/lib/domain/home";
import { trendDelta } from "@/lib/domain/home-charts";
import type { UnmannedDashboard } from "@/lib/domain/unmanned-dashboard";
import { formatInTz } from "@/lib/utils/datetime";

const MOVEMENT_LABEL: Record<string, string> = {
  inbound: "입고",
  sale_out: "판매출고",
  adjustment: "조정",
  disposal: "폐기",
};

/** 차트 부품(components/charts, 이 역할 소유 아님)의 작은 조작 요소를 터치 환경에서만 44px 로 키운다. */
const TOUCH_WRAP =
  "[@media(pointer:coarse)]:[&_button]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:flex [@media(pointer:coarse)]:[&_a]:items-center [@media(pointer:coarse)]:[&_summary]:min-h-[44px] [@media(pointer:coarse)]:[&_summary]:flex [@media(pointer:coarse)]:[&_summary]:items-center";
const KPI_CELL = "h-full [&>*]:h-full [&>*>*]:h-full";

export async function UnmannedHome({
  result,
  dashboard,
  base,
  tz,
  businessName,
  canManage = false,
  canWrite = false,
}: {
  result: { ok: true; data: UnmannedToday } | { ok: false; message: string };
  dashboard: { ok: true; data: UnmannedDashboard } | { ok: false; message: string };
  base: string;
  tz: string;
  businessName: string;
  canManage?: boolean;
  canWrite?: boolean;
}) {
  const { startISO, todayKey } = todayRangeISO(tz);
  const todayLabel = formatInTz(startISO, tz, "M월 d일 EEE");
  // 홈 배지(0023 U1): 오늘 점검표가 없거나 100% 미만이면 경고. page.tsx(공용)를 건드리지 않으려고 여기서 직접 읽는다.

  // 상단바 CTA(재고 등록 → 재고·실사)와 겹치지 않는 동작만: 입고(상품 화면)·점검 목록·설정.
  const actions = (
    <>
      {canWrite && (
        <Link href={`${base}/products`} className="min-w-0">
          <Button size="sm">
            <PackagePlus size={15} aria-hidden />입고 등록
          </Button>
        </Link>
      )}
      <Link href={`${base}/tasks?due=today`} className="min-w-0">
        <Button size="sm" variant="secondary">
          <ClipboardCheck size={15} aria-hidden />오늘 점검
        </Button>
      </Link>
    </>
  );
  const header = (
    <PageHeader settingsHref={canManage ? `${base}/settings` : undefined}
      title={businessName}
      description="부족 재고·점검 마감·실사 차이와 최근 6개월 판매 추이"
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
  const restockTrend = dash?.restockTrend ? trendDelta(dash.restockTrend) : null;
  const canReadRevenue = dash?.revenueVisible ?? false;
  const isEmpty = d.lowStock.length + d.checksIncomplete.length + d.stockDiffCount + d.expiringSoon.length === 0;

  const metrics: HomeMetric[] = [
    { key: "low-stock", label: "부족재고", count: d.lowStock.length, tone: "warn", href: `${base}/products?low=1` },
    { key: "restock-today", label: "오늘 보충", count: d.restockToday.length, href: `${base}/tasks?due=today` },
    { key: "checks", label: "점검 미완료", count: d.checksIncomplete.length, tone: d.checksIncomplete.length > 0 ? "warn" : "neutral", href: `${base}/tasks?due=today` },
    { key: "diff", label: "실사 차이", count: d.stockDiffCount, tone: "alert", href: `${base}/stock` },
  ];

  const kpiCards: { metric: HomeMetric; icon: React.ReactNode; tint: string; trend?: ReturnType<typeof trendDelta> & { points: number[]; color: string }; note?: string }[] = [
    { metric: metrics[0], icon: <TriangleAlert size={16} color="var(--wt)" />, tint: "var(--wb)", note: "저재고 임계값 이하" },
    {
      metric: metrics[1],
      icon: <PackagePlus size={16} color="var(--ch-1)" />,
      tint: "color-mix(in srgb, var(--ch-1) 16%, transparent)",
      trend: dash?.restockTrend ? { ...restockTrend!, points: dash.restockTrend, color: "var(--ch-1)" } : undefined,
      note: "최근 7일 보충 없음",
    },
    { metric: metrics[2], icon: <ClipboardList size={16} color="var(--ch-2)" />, tint: "color-mix(in srgb, var(--ch-2) 16%, transparent)", note: "오늘 이하 마감" },
    { metric: metrics[3], icon: <TriangleAlert size={16} color="var(--et)" />, tint: "var(--eb)", note: d.stockDiffCount > 0 ? "진행 중 실사 기준" : "차이 없음" },
  ];

  const areaSeries: AreaSeries[] = [];
  if (dash?.monthlyAmount) areaSeries.push({ key: "amount", label: "금액", unit: "원", points: dash.monthlyAmount });
  areaSeries.push({ key: "count", label: "건수", unit: "건", points: dash?.monthlyCount ?? [] });

  // 하단 좌측 업무 표 — 점검·보충 작업 단위라 수량/금액 열이 자연스럽지 않다(억지로 채우지 않는다).
  const tableRows: WorkTableRow[] = d.checksIncomplete
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((t) => ({
      id: t.id,
      href: `${base}/tasks?due=today`,
      title: t.title,
      subtitle: `${t.taskType} · ${t.dueDate.slice(5).replace("-", ".")}`,
      statusLabel: t.dueDate < d.todayKey ? "기한 지남" : "오늘 마감",
      statusTone: t.dueDate < d.todayKey ? ("alert" as const) : ("warn" as const),
    }));

  const chartError = !dashboard.ok ? dashboard.message : null;
  const row = "flex min-h-[40px] items-center justify-between gap-3 rounded-[var(--r-sm)] px-1 text-[12.5px] text-t2 hover:bg-sf2 [@media(pointer:coarse)]:min-h-[44px]";

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
                title={canReadRevenue ? "판매 금액·건수" : "월별 판매 건수"}
                description="최근 6개월 월별 추이 · 판매일 기준"
                series={areaSeries}
                insufficientNote="판매 기록이 두 달 이상 쌓이면 추이가 표시됩니다."
              />
            )}
          </Card>
          <Card className="flex flex-col p-4 sm:p-5 lg:col-span-4">
            {chartError ? (
              <ErrorState title="분포를 불러오지 못했습니다." description={chartError} />
            ) : (
              <DonutChart
                title="카테고리별 재고 분포"
                description="현재 보유 수량 기준"
                slices={dash?.categoryDonut.slices.map((s) => ({ ...s, href: s.colorIndex !== null ? `${base}/products` : undefined })) ?? []}
                total={dash?.categoryDonut.total ?? 0}
                unit="개"
              />
            )}
          </Card>
        </div>

        <div className={`grid grid-cols-1 items-start gap-4 lg:grid-cols-12 ${TOUCH_WRAP}`}>
          <Card className="p-4 lg:col-span-8">
            <CardHead
              title="보충·점검 작업 목록"
              description={`오늘 이하 마감 미처리 ${d.checksIncomplete.length}건`}
              action={<ViewAll href={`${base}/tasks`} />}
            />
            <WorkTable
              rows={tableRows}
              showQty={false}
              showAmount={false}
              emptyTitle={isEmpty ? "오늘 처리할 보충·점검 업무가 없습니다." : "오늘 마감인 점검 업무가 없습니다."}
              emptyDescription={isEmpty ? "상품을 등록하고 입고를 기록하면 재고 현황이 여기에 표시됩니다." : "부족 재고·유통기한 임박 품목은 오른쪽에서 확인하세요."}
              emptyAction={
                canWrite && isEmpty ? (
                  <Link href={`${base}/products`}>
                    <Button size="sm"><PackagePlus size={14} aria-hidden />입고 등록</Button>
                  </Link>
                ) : undefined
              }
            />
          </Card>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Card className="p-4">
              <HorizontalBarChart title="판매 상위 상품" description="누적 판매 수량 기준" items={dash?.topProducts.map((p) => ({ ...p, href: `${base}/sales` })) ?? []} />
            </Card>
            <Card className="p-4">
              <CardHead title="유통기한 임박 품목" description="7일 이내" action={<ViewAll href={`${base}/products`}>상품</ViewAll>} />
              {d.expiringSoon.length === 0 ? (
                <p className="text-[12.5px] text-t3">임박한 품목이 없습니다.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--bd)]">
                  {d.expiringSoon.slice(0, 6).map((l) => (
                    <li key={l.id}>
                      <Link href={`${base}/products`} className={row}>
                        <span className="min-w-0 truncate"><span className="font-medium text-t">{l.productName}</span> · <span className="font-mono text-[11.5px]">{l.lotNo}</span></span>
                        <span className="shrink-0 tabular-nums font-medium text-wt">{l.expiryDate ? l.expiryDate.slice(5).replace("-", ".") : "-"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <CardHead title="최근 입출고" action={<ViewAll href={`${base}/stock`}>재고</ViewAll>} />
              {d.recentMovements.length === 0 ? (
                <p className="text-[12.5px] text-t3">최근 입출고 기록이 없습니다.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--bd)]">
                  {d.recentMovements.map((m) => (
                    <li key={m.id} className="flex min-h-[36px] items-center justify-between gap-3 px-1 text-[12.5px] text-t2">
                      <span className="rounded-[6px] bg-sf2 px-1.5 py-0.5 text-[11px] text-t2">{MOVEMENT_LABEL[m.movementType] ?? m.movementType}</span>
                      <span className="tabular-nums">
                        <span className={m.qtyDelta > 0 ? "font-medium text-okt" : "font-medium text-t"}>{m.qtyDelta > 0 ? "+" : ""}{m.qtyDelta}</span>
                        <span className="ml-2 text-t3">{formatInTz(m.occurredAt, tz, "M.d HH:mm")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <CardHead title="다가오는 점검 일정" description="7일 이내" action={<ViewAll href={`${base}/calendar`}>캘린더</ViewAll>} />
              {d.upcomingTasks.length === 0 ? (
                <p className="text-[12.5px] text-t3">7일 이내 예정된 점검이 없습니다.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--bd)]">
                  {d.upcomingTasks.slice(0, 6).map((t) => (
                    <li key={t.id}>
                      <Link href={`${base}/tasks`} className={row}>
                        <span className="min-w-0 truncate text-t">{t.title}</span>
                        <span className="shrink-0 tabular-nums text-t3">{t.dueDate.slice(5).replace("-", ".")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </PageBody>
  );
}
