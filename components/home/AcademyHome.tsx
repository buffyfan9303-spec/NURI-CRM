/**
 * 학원 홈 — 레퍼런스01 골격(제목+설명 → KPI 4장 → 추이 8:분포 4 → 업무표 8:보조 4).
 * 빈 사업장도 같은 골격을 유지하고 값만 0/안내로 둔다(§11). 상단바 CTA(수강 등록 → 반·수강등록)와
 * 겹치는 버튼은 헤더에 두지 않는다.
 */
import Link from "next/link";
import { ClipboardCheck, Search, Settings, CalendarCheck2, TriangleAlert, CalendarRange, QrCode } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { CardHead, ViewAll, RetryButton } from "@/components/rental/listkit";
import { WorkTable, type WorkTableRow } from "./WorkTable";
import { KpiCard, type KpiCardProps } from "@/components/charts/KpiCard";
import { AreaChartCard, type AreaSeries } from "@/components/charts/AreaChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import type { AcademyToday, ConsultationStats } from "@/lib/domain/academy";
import { trendDelta } from "@/lib/domain/home-charts";
import type { AcademyDashboard } from "@/lib/domain/academy-dashboard";
import { formatInTz } from "@/lib/utils/datetime";

/** KPI 4장을 같은 높이로 — 추이선이 있는 카드만 커지던 결함(1단계 검토 #18). */
const KPI_GRID = "grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4 [&>a]:h-full [&>a>div]:h-full [&>div]:h-full";
/** 차트 부품(components/charts, 다른 소유) 안의 토글·범례·표 보기가 터치 화면에서 44px 미만이라 감싸는 쪽에서 승격한다(1단계 검토 홈 부품 지적). */
const CHART_TOUCH = "[@media(pointer:coarse)]:[&_button]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:min-h-[44px] [@media(pointer:coarse)]:[&_a]:inline-flex [@media(pointer:coarse)]:[&_a]:items-center [@media(pointer:coarse)]:[&_summary]:flex [@media(pointer:coarse)]:[&_summary]:min-h-[44px] [@media(pointer:coarse)]:[&_summary]:items-center";
const ROW = "flex min-h-[40px] items-center justify-between gap-3 rounded-[var(--r-sm)] px-2 text-[13px] [@media(pointer:coarse)]:min-h-[44px]";

const tone = (status: string): WorkTableRow["statusTone"] => (status === "완료" ? "success" : status === "휴강" ? "alert" : "neutral");

export function AcademyHome({
  result,
  dashboard,
  base,
  tz,
  businessName,
  canManage = false,
  canWrite = false,
  consultStats = null,
}: {
  result: { ok: true; data: AcademyToday } | { ok: false; message: string };
  dashboard: { ok: true; data: AcademyDashboard } | { ok: false; message: string };
  base: string;
  tz: string;
  businessName: string;
  canManage?: boolean;
  canWrite?: boolean;
  /** 입학 상담 유입경로별 전환율(0023, pii.read 없으면 null). */
  consultStats?: ConsultationStats | null;
}) {
  const actions = (
    <>
      {canWrite && (
        <Link href={`${base}/attendance`}>
          <Button size="sm">
            <ClipboardCheck size={15} aria-hidden />출결 처리
          </Button>
        </Link>
      )}
      {canWrite && (
        <Link href={`${base}/attendance/kiosk`}>
          <Button size="sm" variant="secondary">
            <QrCode size={15} aria-hidden />등원 키오스크
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
        <PageHeader title={businessName} description="오늘 수업·출결·수강료 현황" actions={actions} />
        <Card>
          <ErrorState title="오늘 현황을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  const d = result.data;
  const dash = dashboard.ok ? dashboard.data : null;
  const sessionTrend = dash?.sessionTrend && dash.sessionTrend.length >= 2 ? trendDelta(dash.sessionTrend) : null;
  const className = (id: string) => d.classes.find((c) => c.id === id)?.name ?? "반 미지정";

  const kpis: KpiCardProps[] = [
    {
      label: "오늘 수업",
      value: String(d.sessionsToday.length),
      href: `${base}/timetable`,
      icon: <CalendarCheck2 size={16} color="var(--ch-1)" />,
      tintColor: "color-mix(in srgb, var(--ch-1) 16%, transparent)",
      trend: sessionTrend && dash?.sessionTrend ? { ...sessionTrend, points: dash.sessionTrend, color: "var(--ch-1)" } : undefined,
      emptyNote: d.sessionsToday.length === 0 ? "오늘 예정 회차 없음" : undefined,
    },
    {
      label: "출결 미확인",
      value: String(d.attendanceUnmarkedCount),
      // 결함(§11-5): unmarked=1이면 오늘 미확인 회차만 남긴다(attendanceUnmarkedCount와 동일 조건).
      href: `${base}/attendance?unmarked=1`,
      icon: <TriangleAlert size={16} color={d.attendanceUnmarkedCount ? "var(--wt)" : "var(--ch-2)"} />,
      tintColor: d.attendanceUnmarkedCount ? "var(--wb)" : "color-mix(in srgb, var(--ch-2) 16%, transparent)",
      emptyNote: d.attendanceUnmarkedCount ? "출결 입력이 필요한 회차" : "오늘 회차 출결 전부 기록됨",
    },
    {
      label: "보강·휴강",
      value: String(d.makeupOrCancelToday.length),
      href: `${base}/timetable`,
      icon: <CalendarRange size={16} color="var(--ch-4)" />,
      tintColor: "color-mix(in srgb, var(--ch-4) 16%, transparent)",
      emptyNote: d.makeupOrCancelToday.length ? "오늘 변경된 회차" : "오늘 변경된 회차 없음",
    },
    d.revenueVisible
      ? {
          label: "미납",
          value: String(d.unpaidCount),
          href: `${base}/tuition?status=미납`,
          icon: <TriangleAlert size={16} color={d.unpaidCount ? "var(--et)" : "var(--ch-3)"} />,
          tintColor: d.unpaidCount ? "var(--eb)" : "color-mix(in srgb, var(--ch-3) 16%, transparent)",
          emptyNote: d.unpaidCount ? "납부기한 지난 청구서" : "미납 청구서 없음",
        }
      : {
          label: "입학 상담",
          value: String(consultStats?.total ?? 0),
          href: `${base}/consultations`,
          icon: <Search size={16} color="var(--ch-3)" />,
          tintColor: "color-mix(in srgb, var(--ch-3) 16%, transparent)",
          emptyNote: consultStats ? `최근 90일 · 등록 전환 ${consultStats.rate}%` : "상담 통계 권한 없음",
        },
  ];

  const areaSeries: AreaSeries[] = [];
  if (dash?.monthlyAmount) areaSeries.push({ key: "amount", label: "금액", unit: "원", points: dash.monthlyAmount });
  areaSeries.push({ key: "count", label: "건수", unit: "건", points: dash?.monthlyCount ?? [] });

  // 하단 좌측 업무 표 — 금액은 revenue.read일 때만(§작업5). 수량은 그 반의 등록 학생 수.
  const tableRows: WorkTableRow[] = d.sessionsToday.map((s) => {
    const cls = d.classes.find((c) => c.id === s.classId);
    return {
      id: s.id,
      href: `${base}/attendance?sessionId=${s.id}`,
      title: className(s.classId),
      subtitle: `${formatInTz(s.startAt, tz, "HH:mm")}–${formatInTz(s.endAt, tz, "HH:mm")}${s.sessionKind !== "정규" ? ` · ${s.sessionKind}` : ""}`,
      qty: cls?.enrolledCount !== undefined ? `${cls.enrolledCount}명` : undefined,
      amount: d.revenueVisible ? (cls?.tuitionAmount ?? null) : null,
      statusLabel: s.status,
      statusTone: tone(s.status),
    };
  });

  return (
    <PageBody>
      <PageHeader title={businessName} description={`${d.todayKey} · 오늘 수업·출결·수강료 현황`} actions={actions} />

      <div className="flex flex-col gap-4">
        <div className={KPI_GRID}>
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <Card className={`p-4 sm:p-5 lg:col-span-8 ${CHART_TOUCH}`}>
            <AreaChartCard title={d.revenueVisible ? "수강료·등록 추이" : "월별 신규 등록"} description="최근 6개월 월별 추이" series={areaSeries} />
          </Card>
          <Card className={`p-4 sm:p-5 lg:col-span-4 ${CHART_TOUCH}`}>
            <DonutChart
              title="반별 등록 분포"
              description="활성 수강 등록 기준"
              slices={dash?.classDonut.slices.map((s) => ({ ...s, href: s.colorIndex !== null ? `${base}/classes` : undefined })) ?? []}
              total={dash?.classDonut.total ?? 0}
            />
          </Card>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <Card className="p-4 sm:p-5 lg:col-span-8">
            <CardHead title="오늘 수업" description="시간순 · 행을 누르면 그 회차 출결로" action={<ViewAll href={`${base}/timetable`}>시간표</ViewAll>} />
            <WorkTable
              rows={tableRows}
              showAmount={d.revenueVisible}
              emptyTitle="오늘 예정된 수업이 없습니다."
              emptyDescription="반을 만들고 학생을 수강 등록하면 오늘 시간표가 여기에 표시됩니다."
              emptyAction={
                canWrite ? (
                  <Link href={`${base}/classes`}>
                    <Button size="sm" variant="secondary">반·수강등록</Button>
                  </Link>
                ) : undefined
              }
            />
          </Card>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <Card className={`p-4 sm:p-5 ${CHART_TOUCH}`}>
              {dash?.attendanceRateBar ? (
                <HorizontalBarChart title="반별 출석률" description="최근 7일 회차 기준" items={dash.attendanceRateBar.map((b) => ({ ...b, unit: "%", href: `${base}/attendance` }))} unit="%" />
              ) : (
                <>
                  <CardHead title="반별 출석률" description="최근 7일 회차 기준" />
                  <p className="text-[12.5px] text-t3">학생 개인정보 열람 권한(pii.read)이 없어 표시할 수 없습니다.</p>
                </>
              )}
            </Card>

            <Card className="p-4 sm:p-5">
              <CardHead title="보강·휴강" description="오늘 변경된 회차" action={<ViewAll href={`${base}/timetable`}>시간표</ViewAll>} />
              {d.makeupOrCancelToday.length === 0 ? (
                <p className="text-[12.5px] text-t3">오늘 보강·휴강이 없습니다.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {d.makeupOrCancelToday.map((s) => (
                    <li key={s.id}>
                      <Link href={`${base}/attendance?sessionId=${s.id}`} className={`${ROW} hover:bg-sf2`}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-t">{className(s.classId)}</span>
                          <span className="block text-[11.5px] tabular-nums text-t3">{formatInTz(s.startAt, tz, "HH:mm")}</span>
                        </span>
                        <span className={`shrink-0 text-[12px] font-medium ${s.sessionKind === "보강" ? "text-it" : "text-et"}`}>{s.sessionKind === "보강" ? "보강" : "휴강"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {d.revenueVisible && (
              <Card className="p-4 sm:p-5">
                <CardHead title="미납 확인" description="상태가 미납인 청구서" action={d.unpaidCount > 0 ? <ViewAll href={`${base}/tuition?status=미납`}>수강료</ViewAll> : undefined} />
                {d.unpaidCount === 0 ? (
                  <p className="text-[12.5px] text-t3">미납된 수강료가 없습니다.</p>
                ) : (
                  <p className="text-[13px] text-t2">
                    미납 <span className="font-semibold tabular-nums text-et">{d.unpaidCount}건</span> — 수강료·미납 화면에서 납부 등록과 안내 문구를 처리합니다.
                  </p>
                )}
              </Card>
            )}

            {consultStats && (
              <Card className="p-4 sm:p-5">
                <CardHead title="입학 상담 전환율" description={`${consultStats.from} ~ ${consultStats.to}`} action={<ViewAll href={`${base}/consultations`}>상담</ViewAll>} />
                <p className="text-[13px] text-t2">
                  상담 <span className="font-semibold tabular-nums text-t">{consultStats.total}</span>건 중 등록{" "}
                  <span className="font-semibold tabular-nums text-t">{consultStats.converted}</span>건 · <span className="font-semibold tabular-nums text-[var(--accent-ink)]">{consultStats.rate}%</span>
                </p>
                {consultStats.bySource.length > 0 && (
                  <ul className="mt-2 flex flex-col divide-y divide-[var(--bd)] text-[12.5px]">
                    {consultStats.bySource.slice(0, 5).map((s) => (
                      <li key={s.source} className="flex items-center justify-between gap-2 py-1.5">
                        <span className="min-w-0 truncate text-t2">{s.source}</span>
                        <span className="shrink-0 tabular-nums text-t3">{s.converted}/{s.total} · {s.rate}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            <Card className="p-4 sm:p-5">
              <CardHead title="학생 찾기" />
              <Link
                href={`${base}/students`}
                className="flex min-h-[44px] items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd2)] px-3 text-[13px] text-t2 hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <Search size={15} aria-hidden />
                학생·보호자 목록에서 검색
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </PageBody>
  );
}
