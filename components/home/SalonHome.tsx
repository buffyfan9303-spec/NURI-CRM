"use client";

/**
 * 미용실 홈 — 레퍼런스01 골격(제목+설명 → KPI 4장 → 추이 8:분포 4 → 업무표 8:보조 4).
 * 빈 사업장도 같은 골격을 유지하고 값만 0/안내로 둔다(§11). 상단바 CTA(새 예약 → 캘린더)와
 * 겹치는 버튼은 헤더에 두지 않는다.
 */
import * as React from "react";
import Link from "next/link";
import { Banknote, Settings, CalendarCheck2, Clock4, TriangleAlert, CircleUserRound, RotateCcw, Package } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { CardHead, ViewAll, RetryButton } from "@/components/rental/listkit";
import { WorkTable, type WorkTableRow } from "./WorkTable";
import { KpiCard, type KpiCardProps } from "@/components/charts/KpiCard";
import { AreaChartCard, type AreaSeries } from "@/components/charts/AreaChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import type { SalonToday, RevisitDueRow } from "@/lib/domain/salon";
import { trendDelta } from "@/lib/domain/home-charts";
import type { SalonDashboard } from "@/lib/domain/salon-dashboard";
import { formatInTz } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import { MessageActions } from "@/components/common/MessageActions";

/** KPI 4장을 같은 높이로 — 추이선이 있는 카드만 커지던 결함(1단계 검토 #18). */
const KPI_GRID = "grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4 [&>a]:h-full [&>a>div]:h-full [&>div]:h-full";
/** 차트 부품(components/charts, 다른 소유) 안의 토글·범례·표 보기가 터치 화면에서 44px 미만이라 감싸는 쪽에서 승격한다(1단계 검토 홈 부품 지적). */
const CHART_TOUCH = "[@media(pointer:coarse)]:[&_button]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:inline-flex [@media(pointer:coarse)]:[&_a]:items-center [@media(pointer:coarse)]:[&_summary]:flex [@media(pointer:coarse)]:[&_summary]:min-h-[44px] [@media(pointer:coarse)]:[&_summary]:items-center";
const ROW = "flex min-h-[40px] items-center justify-between gap-3 rounded-[var(--r-sm)] px-2 text-[13px] [@media(pointer:coarse)]:min-h-[44px]";

const tone = (status: string): WorkTableRow["statusTone"] =>
  status === "완료" ? "success" : status === "취소" || status === "노쇼" ? "neutral" : "warn";

export function SalonHome({
  result,
  dashboard,
  base,
  tz,
  businessName,
  canManage = false,
  canWrite = false,
  revisitDue = [],
}: {
  result: { ok: true; data: SalonToday } | { ok: false; message: string };
  dashboard: { ok: true; data: SalonDashboard } | { ok: false; message: string };
  base: string;
  tz: string;
  businessName: string;
  canManage?: boolean;
  canWrite?: boolean;
  /** S3: 재방문 시기 도래 고객(listRevisitDue). */
  revisitDue?: RevisitDueRow[];
}) {
  const [revisitTarget, setRevisitTarget] = React.useState<RevisitDueRow | null>(null);
  const revenueVisible = result.ok && result.data.revenueVisible;

  const actions = (
    <>
      {revenueVisible && (
        <Link href={`${base}/settlement`}>
          <Button size="sm" variant="secondary">
            <Banknote size={15} aria-hidden />수납·정산
          </Button>
        </Link>
      )}
      {canManage && (
        <Link href={`${base}/settings`}>
          <Button size="sm" variant="ghost">
            <Settings size={15} aria-hidden />설정
          </Button>
        </Link>
      )}
    </>
  );

  if (!result.ok) {
    return (
      <PageBody>
        <PageHeader title={businessName} description="오늘 예약·시술·수납 현황" actions={actions} />
        <Card>
          <ErrorState title="오늘 현황을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  const d = result.data;
  const dash = dashboard.ok ? dashboard.data : null;
  const apptTrend = dash?.apptTrend && dash.apptTrend.length >= 2 ? trendDelta(dash.apptTrend) : null;
  const next = d.nextAppointment;

  const kpis: KpiCardProps[] = [
    {
      label: "오늘 예약",
      value: String(d.appointmentsToday.length),
      href: `${base}/services?date=today`,
      icon: <CalendarCheck2 size={16} color="var(--ch-1)" />,
      tintColor: "color-mix(in srgb, var(--ch-1) 16%, transparent)",
      trend: apptTrend && dash?.apptTrend ? { ...apptTrend, points: dash.apptTrend, color: "var(--ch-1)" } : undefined,
      emptyNote: d.appointmentsToday.length === 0 ? "오늘 잡힌 예약 없음" : undefined,
    },
    {
      label: "다음 고객",
      value: next ? formatInTz(next.startAt, tz, "HH:mm") : "—",
      href: next ? `${base}/services?date=today` : undefined,
      icon: <CircleUserRound size={16} color="var(--ch-2)" />,
      tintColor: "color-mix(in srgb, var(--ch-2) 16%, transparent)",
      emptyNote: next ? `${next.customerName ?? "고객 미지정"} · ${next.serviceName ?? "-"}` : "남은 예약 없음",
    },
    {
      label: "시술 중",
      value: String(d.inProgressCount),
      href: `${base}/services?date=today`,
      icon: <Clock4 size={16} color="var(--ch-4)" />,
      tintColor: "color-mix(in srgb, var(--ch-4) 16%, transparent)",
      emptyNote: "지금 진행 중인 시술",
    },
    d.revenueVisible
      ? {
          label: "미수",
          value: String(d.outstanding.length),
          href: `${base}/settlement`,
          icon: <TriangleAlert size={16} color={d.outstanding.length ? "var(--et)" : "var(--ch-3)"} />,
          tintColor: d.outstanding.length ? "var(--eb)" : "color-mix(in srgb, var(--ch-3) 16%, transparent)",
          emptyNote: d.outstanding.length ? `합계 ${formatKRW(d.outstanding.reduce((s, o) => s + o.outstanding, 0))}` : "잔액 남은 예약 없음",
        }
      : {
          label: "재방문 권유",
          value: String(revisitDue.length),
          icon: <RotateCcw size={16} color="var(--ch-3)" />,
          tintColor: "color-mix(in srgb, var(--ch-3) 16%, transparent)",
          emptyNote: revisitDue.length ? "주기가 지난 고객" : "주기 지난 고객 없음",
        },
  ];

  const areaSeries: AreaSeries[] = [];
  if (dash?.monthlyAmount) areaSeries.push({ key: "amount", label: "금액", unit: "원", points: dash.monthlyAmount });
  areaSeries.push({ key: "count", label: "건수", unit: "건", points: dash?.monthlyCount ?? [] });

  // 하단 좌측 업무 표 — 금액은 revenue.read일 때만(§작업5). 시술 1건=수량 1로 표시.
  const tableRows: WorkTableRow[] = d.appointmentsToday.map((a) => ({
    id: a.id,
    href: `${base}/services?date=today`,
    title: a.customerName ?? "고객 미지정",
    subtitle: `${a.serviceName ?? "-"} · ${formatInTz(a.startAt, tz, "HH:mm")}`,
    qty: "1건",
    amount: d.revenueVisible ? a.price : null,
    statusLabel: a.status,
    statusTone: tone(a.status),
  }));

  return (
    <PageBody>
      <PageHeader title={businessName} description={`${d.todayKey} · 오늘 예약·시술·수납 현황`} actions={actions} />

      <div className="flex flex-col gap-4">
        <div className={KPI_GRID}>
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <Card className={`p-4 sm:p-5 lg:col-span-8 ${CHART_TOUCH}`}>
            <AreaChartCard title={d.revenueVisible ? "수납·예약 추이" : "월별 예약 건수"} description="최근 6개월 월별 추이" series={areaSeries} />
          </Card>
          <Card className={`p-4 sm:p-5 lg:col-span-4 ${CHART_TOUCH}`}>
            <DonutChart
              title="시술 카테고리별 분포"
              description="취소·노쇼 제외"
              slices={dash?.categoryDonut.slices.map((s) => ({ ...s, href: s.colorIndex !== null ? `${base}/services?date=today` : undefined })) ?? []}
              total={dash?.categoryDonut.total ?? 0}
            />
          </Card>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <Card className="p-4 sm:p-5 lg:col-span-8">
            <CardHead title="오늘 예약 타임라인" description="시간순 · 취소·노쇼 포함" action={<ViewAll href={`${base}/services?date=today`}>예약 목록</ViewAll>} />
            <WorkTable
              rows={tableRows}
              showAmount={d.revenueVisible}
              emptyTitle="오늘 예약이 없습니다."
              emptyDescription="예약이 등록되면 담당 직원별 오늘 일정이 여기에 표시됩니다."
              emptyAction={
                canWrite ? (
                  <Link href={`${base}/services`}>
                    <Button size="sm" variant="secondary">예약 등록</Button>
                  </Link>
                ) : undefined
              }
            />
          </Card>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <Card className={`p-4 sm:p-5 ${CHART_TOUCH}`}>
              <HorizontalBarChart title="직원별 예약 상위" description="취소·노쇼 제외" items={dash?.topStaff.map((s) => ({ ...s, href: `${base}/services?date=today` })) ?? []} />
            </Card>

            <Card className="p-4 sm:p-5">
              <CardHead title="다시 올 때 된 고객" description="시술별 재방문 주기 기준" />
              {revisitDue.length === 0 ? (
                <p className="text-[12.5px] text-t3">주기가 지난 고객이 없습니다.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {revisitDue.slice(0, 6).map((r) => (
                    <li key={`${r.customerId}-${r.serviceId}`} className={ROW}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-t">{r.customerName}</span>
                        <span className="block truncate text-[11.5px] text-t3">{r.serviceName} · {r.daysOverdue}일 지남</span>
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => setRevisitTarget(r)}>안내 문구</Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {d.revenueVisible && (
              <Card className="p-4 sm:p-5">
                <CardHead title="미수 확인" description="완료됐지만 잔액이 남은 예약" action={d.outstanding.length > 0 ? <ViewAll href={`${base}/settlement`}>정산</ViewAll> : undefined} />
                {d.outstanding.length === 0 ? (
                  <p className="text-[12.5px] text-t3">미수가 없습니다.</p>
                ) : (
                  <ul className="-mx-2 flex flex-col">
                    {d.outstanding.slice(0, 6).map((o) => (
                      <li key={o.appointment.id}>
                        <Link href={`${base}/settlement`} className={`${ROW} hover:bg-sf2`}>
                          <span className="min-w-0 truncate text-t">{o.appointment.customerName ?? "고객 미지정"}</span>
                          <span className="shrink-0 tabular-nums font-medium text-et">{formatKRW(o.outstanding)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            <Card className="p-4 sm:p-5">
              <CardHead title="재고 주의" description="기준 수량 이하 소모품" action={d.lowStockRetail.length > 0 ? <ViewAll href={`${base}/stock`}>재고</ViewAll> : undefined} />
              {d.lowStockRetail.length === 0 ? (
                <p className="text-[12.5px] text-t3">부족한 소모품이 없습니다.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {d.lowStockRetail.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link href={`${base}/stock`} className={`${ROW} hover:bg-sf2`}>
                        <span className="flex min-w-0 items-center gap-2 text-t"><Package size={14} className="shrink-0 text-t3" aria-hidden /><span className="truncate">{r.name}</span></span>
                        <span className="shrink-0 tabular-nums font-medium text-wt">재고 {r.stockQty}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 sm:p-5">
              <CardHead title="휴무·휴게" description="오늘" action={canManage ? <ViewAll href={`${base}/staff-shift`}>근무표</ViewAll> : undefined} />
              {d.timeOffToday.length === 0 ? (
                <p className="text-[12.5px] text-t3">오늘 등록된 휴무·휴게가 없습니다.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {d.timeOffToday.map((t) => (
                    <li key={t.id} className={ROW}>
                      <span className="text-t">{t.offType}</span>
                      <span className="tabular-nums text-t2">{formatInTz(t.startAt, tz, "HH:mm")}–{formatInTz(t.endAt, tz, "HH:mm")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Modal open={!!revisitTarget} onClose={() => setRevisitTarget(null)} title="재방문 안내 문구">
        {revisitTarget && (
          <MessageActions
            title="재방문 안내"
            phone={revisitTarget.phone ?? undefined}
            text={`[${businessName}] ${revisitTarget.customerName}님, 지난 ${revisitTarget.serviceName} 시술 후 ${revisitTarget.daysOverdue}일이 지났습니다. 재방문을 권해드립니다. 편하실 때 예약해 주세요.`}
          />
        )}
      </Modal>
    </PageBody>
  );
}
