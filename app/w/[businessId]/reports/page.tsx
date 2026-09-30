/**
 * 월별 정산 보고서(building). 원본 엑셀 관리집계표·관리비비교표 구성을 한 화면에:
 * ① 이번 달 요약 ② 호실별 정산표(항목 열 + 합계 행) ③ 항목별 지난달 비교 ④ 받을 돈 나이.
 * 확정된 청구만 센다. revenue.read 필요. A4 가로 한 장 인쇄(globals.css .bld-report).
 * ④ 건물 전체 12개월 흐름·전년 같은 달 비교(TrendCard, 화면 전용). 다른 보기는 ?view=owners|budget|repair|law14(report-views·Law14View).
 * 구조 근거: docs/design-references/2026-09-30-cam-report-from-excel.md
 */
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { CardHead, SummaryStrip, PrintButton } from "@/components/rental/listkit";
import { TABLE, THEAD, TH, TD } from "@/components/building/table-kit";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { num, won } from "@/components/building-ops/format";
import { addMonths, periodLabel } from "@/components/building/period";
import { loadSettlement } from "@/components/building/settlement-load";
import { BudgetView, OwnersView, RepairView, ReportTabs, parseView } from "@/components/building-ops/report-views";
import { Law14View } from "@/components/building-ops/Law14View";
import { TrendCard } from "@/components/building-ops/TrendCard";
import { getAging } from "@/lib/domain/building";
import type { AgingReport } from "@/lib/domain/building-types";
import { cn } from "@/lib/utils/cn";

const LINK = "inline-flex min-h-[44px] items-center rounded-[var(--r-md)] border border-[var(--bd-strong)] bg-sf px-4 text-[length:var(--fs-body)] font-medium text-t shadow-card hover:bg-sf2";
const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const NUMH = `${TH} text-right`;

function Diff({ n, pct }: { n: number; pct?: number | null }) {
  if (n === 0) return <span className="text-t3">같음</span>;
  return (
    <span className="tabular-nums">
      {n > 0 ? "▲ " : "▼ "}{won(Math.abs(n))}
      {pct != null && <span className="ml-1 text-t2">({n > 0 ? "+" : "−"}{Math.abs(pct * 100).toFixed(1)}%)</span>}
    </span>
  );
}

const AGE: { k: keyof AgingReport["buckets"]; label: string; danger?: boolean }[] = [
  { k: "not_due", label: "납부기한 전" },
  { k: "d0_30", label: "1~30일 지남" },
  { k: "d31_60", label: "31~60일 지남" },
  { k: "d61_90", label: "61~90일 지남", danger: true },
  { k: "d90p", label: "90일 넘게 지남", danger: true },
];

export default async function ReportsPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "revenue.read", searchParams, "월별 정산 보고서");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const view = parseView(searchParams.view);
  if (view === "owners") return <OwnersView ctx={ctx} />;
  if (view === "budget") return <BudgetView ctx={ctx} />;
  if (view === "repair") return <RepairView ctx={ctx} />;
  if (view === "law14") return <Law14View ctx={ctx} unitId={typeof searchParams.unit === "string" ? searchParams.unit : undefined} />;
  const prevP = addMonths(ctx.period, -1);
  const q = `businessId=${ctx.businessId}&b=${ctx.building.id}&p=${ctx.period}`;
  const actions = (ready: boolean) => (
    <div className="bld-noprint flex flex-wrap gap-2">
      {ready && <PrintButton label="인쇄(A4 가로)" />}
      <a className={LINK} href={`/api/building/report-xlsx?${q}&kind=report`} download>엑셀 내려받기</a>
      {ctx.can("export") && <a className={LINK} href={`/api/building/report-xlsx?${q}&kind=ledger`} download>한 달 전체 기록 엑셀</a>}
    </div>
  );
  const header = (ready: boolean) => <><BuildingHeader ctx={ctx} title="월별 정산 보고서" description="금액을 확정한 달의 호실별 관리비와 받은 돈·못 받은 돈을 원래 쓰던 관리집계표처럼 한 장에 봅니다." actions={actions(ready)} /><ReportTabs ctx={ctx} view="settle" /></>;

  const [sRes, aRes] = await Promise.all([loadSettlement(ctx.businessId, ctx.building.id, ctx.period), getAging(ctx.building.id)]);
  const fail = [sRes, aRes].find((x) => !x.ok);
  if (fail && !fail.ok) return <PageBody>{header(false)}<ReadFail title="보고서를 불러오지 못했습니다." message={fail.message} /></PageBody>;
  if (!sRes.ok || !aRes.ok) return null;

  if (!sRes.data) {
    return (
      <PageBody wide>
        {header(false)}
        <Card>
          <EmptyState title={`${periodLabel(ctx.period)} 금액이 아직 확정되지 않았습니다.`} description="관리비 계산·확정 화면에서 이번 달 금액을 확정하면 이 보고서가 채워집니다. 위에서 다른 달을 고를 수도 있습니다." />
        </Card>
      </PageBody>
    );
  }

  const { s, hasPrev } = sRes.data;
  const t = s.total;
  const hasLate = t.lateFee !== 0;
  const prevTotal = s.compareTotal.prev;
  const ag = aRes.data.buckets;
  const agMax = Math.max(1, ...AGE.map((a) => ag[a.k]));

  return (
    <PageBody wide>
      {header(true)}
      <style>{"@media print { @page { size: A4 landscape; margin: 7mm; } }"}</style>
      <div id="print-area" className="bld-report">
        <h1 className="mb-2 hidden text-[18px] font-bold text-t print:block">{ctx.building.name} · {periodLabel(ctx.period)} 관리비 정산</h1>
        <SummaryStrip
          items={[
            { label: "이번 달 관리비 합계", value: won(t.current) },
            { label: "받은 돈", value: won(t.paid), tone: "success" },
            { label: "못 받은 돈(오늘 기준)", value: won(t.left), tone: t.left > 0 ? "danger" : "muted" },
            { label: hasPrev ? `지난달(${periodLabel(prevP)})보다` : "지난달보다", value: hasPrev ? <Diff n={s.compareTotal.diff} pct={s.compareTotal.pct} /> : <span className="text-t3">지난달 확정 없음</span> },
            { label: "호실 수", value: `${s.rows.length}호실` },
          ]}
        />

        <Card className="mb-4 p-4">
          <CardHead title="① 호실별 정산표" description="원래 엑셀의 관리집계표처럼 호실마다 한 줄, 맨 아래 굵은 줄이 합계입니다. 단위는 원, 금액은 부가세를 포함합니다." />
          <div className="bld-dense -mx-4 overflow-x-auto px-4" tabIndex={0} role="region" aria-label="호실별 정산표(옆으로 밀어 보기)">
            <table className={cn(TABLE, "text-[length:13px]")}>
              <thead className={THEAD}>
                <tr>
                  <th className={cn(TH, "sticky left-0 z-[1] bg-sf2")}>호실·입주자</th>
                  {s.items.map((k) => <th key={k} className={NUMH}>{k}</th>)}
                  <th className={cn(NUMH, "border-l border-[var(--bd)]")}>부가세 빼기 전</th>
                  <th className={NUMH}>부가세</th>
                  <th className={NUMH}>이번 달 관리비</th>
                  <th className={NUMH} title="지난달까지 안 낸 돈">밀린 돈</th>
                  {hasLate && <th className={NUMH}>연체료</th>}
                  <th className={NUMH}>이번 달 낼 돈</th>
                  <th className={NUMH}>낸 돈</th>
                  <th className={NUMH}>남은 돈</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.unitId} className="border-b border-[var(--bd)]">
                    <td className={cn(TD, "sticky left-0 bg-sf")}>
                      <span className="block whitespace-nowrap font-semibold text-t">{r.unitLabel}</span>
                      <span className="block max-w-[112px] truncate text-t2" title={r.party}>{r.party}</span>
                    </td>
                    {s.items.map((k) => <td key={k} className={NUM}>{r.items[k] ? num(r.items[k]) : <span className="text-t3">-</span>}</td>)}
                    <td className={cn(NUM, "border-l border-[var(--bd)]")}>{num(r.supply + r.exempt)}</td>
                    <td className={NUM}>{num(r.vat)}</td>
                    <td className={cn(NUM, "font-semibold text-t")}>{num(r.current)}</td>
                    <td className={cn(NUM, r.priorUnpaid > 0 && "text-et")}>{num(r.priorUnpaid)}</td>
                    {hasLate && <td className={NUM}>{num(r.lateFee)}</td>}
                    <td className={cn(NUM, "font-semibold text-t")}>{num(r.due)}</td>
                    <td className={NUM}>{num(r.paid)}</td>
                    <td className={cn(NUM, r.left > 0 ? "font-semibold text-et" : "text-t3")}>{num(r.left)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--t)] bg-sf2 font-bold text-t">
                  <td className={cn(TD, "sticky left-0 bg-sf2 whitespace-nowrap")}>합계 {s.rows.length}호실</td>
                  {s.items.map((k) => <td key={k} className={NUM}>{num(t.items[k] ?? 0)}</td>)}
                  <td className={cn(NUM, "border-l border-[var(--bd)]")}>{num(t.supply + t.exempt)}</td>
                  <td className={NUM}>{num(t.vat)}</td>
                  <td className={NUM}>{num(t.current)}</td>
                  <td className={NUM}>{num(t.priorUnpaid)}</td>
                  {hasLate && <td className={NUM}>{num(t.lateFee)}</td>}
                  <td className={NUM}>{num(t.due)}</td>
                  <td className={NUM}>{num(t.paid)}</td>
                  <td className={cn(NUM, t.left > 0 && "text-et")}>{num(t.left)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[length:var(--fs-meta)] text-t3">낸 돈은 &ldquo;이번 달 낼 돈 − 오늘 남은 돈&rdquo;입니다. 남은 돈은 이 달까지 청구한 돈 중 아직 안 들어온 돈입니다.{!hasLate && " 이 달은 연체료가 없어 연체료 칸을 뺐습니다."}</p>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr] print:grid-cols-[3fr_2fr]">
          <Card className="p-4 sm:p-5">
            <CardHead title="② 항목별 지난달 비교" description={hasPrev ? `${periodLabel(ctx.period)}와 ${periodLabel(prevP)}를 항목마다 비교합니다.` : `${periodLabel(prevP)}는 확정된 금액이 없어 지난달 칸이 0원입니다.`} />
            <div className="bld-dense overflow-x-auto">
              <table className={cn(TABLE, "text-[length:var(--fs-meta)]")}>
                <thead className={THEAD}><tr><th className={TH}>항목</th><th className={NUMH}>이번 달</th><th className={NUMH}>지난달</th><th className={NUMH}>차이(차이율)</th></tr></thead>
                <tbody>
                  {s.compare.map((c) => (
                    <tr key={c.name} className="border-b border-[var(--bd)]">
                      <td className={TD}>{c.name}</td>
                      <td className={NUM}>{won(c.cur)}</td>
                      <td className={NUM}>{won(c.prev)}</td>
                      <td className={NUM}><Diff n={c.diff} pct={c.pct} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--t)] font-bold text-t">
                    <td className={TD}>합계</td><td className={NUM}>{won(s.compareTotal.cur)}</td><td className={NUM}>{won(prevTotal)}</td><td className={NUM}><Diff n={s.compareTotal.diff} pct={s.compareTotal.pct} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <CardHead title="③ 받을 돈이 얼마나 밀렸나" description={`오늘(${aRes.data.asof}) 기준, 건물 전체의 아직 안 들어온 돈입니다.`} />
            <table className={cn(TABLE, "bld-dense text-[length:var(--fs-meta)]")}>
              <thead className={THEAD}><tr><th className={TH}>밀린 기간</th><th className={NUMH}>금액</th><th className={cn(TH, "w-[40%]")}><span className="sr-only">비율 막대</span></th></tr></thead>
              <tbody>
                {AGE.map((a) => (
                  <tr key={a.k} className="border-b border-[var(--bd)]">
                    <td className={TD}>{a.label}</td>
                    <td className={cn(NUM, a.danger && ag[a.k] > 0 && "font-semibold text-et")}>{won(ag[a.k])}</td>
                    <td className={TD}>
                      <div className="h-[10px] w-full rounded-full bg-sf2" aria-hidden>
                        <div className={cn("h-full rounded-full", a.danger ? "bg-[var(--et)]" : "bg-[var(--accent)]")} style={{ width: `${Math.round((ag[a.k] / agMax) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--t)] font-bold text-t"><td className={TD}>합계</td><td className={NUM}>{won(ag.total)}</td><td className={TD} /></tr>
              </tfoot>
            </table>
            {ag.total !== t.left && <p className="mt-2 text-[length:var(--fs-meta)] text-t3">이 표는 모든 달을 합친 금액이라 위 정산표의 &ldquo;남은 돈&rdquo;(이 달까지)과 다를 수 있습니다.</p>}
          </Card>
        </div>
      </div>
      <TrendCard buildingId={ctx.building.id} period={ctx.period} />
    </PageBody>
  );
}
