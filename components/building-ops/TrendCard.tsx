/**
 * 월별 정산 보고서 ④ 건물 전체 12개월 흐름 + 전년 같은 달 비교(서버). 인쇄 영역 밖(화면 전용).
 * 금액 = 서버 RPC bld_report_categories 의 월 합계(getCategoryReport). 확정(승인 이상)한 달만 부르고 나머지는 "확정 전"으로 둔다.
 */
import { Card } from "@/components/ui/Card";
import { CardHead } from "@/components/rental/listkit";
import { TABLE, THEAD, TH, TD } from "@/components/building/table-kit";
import { getCategoryReport, listPeriods } from "@/lib/domain/building";
import { trendMonths, trendWindow } from "@/components/building/trend";
import { won } from "@/components/building-ops/format";
import { periodLabel } from "@/components/building/period";
import { cn } from "@/lib/utils/cn";

const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const NUMH = `${TH} text-right`;
const CONFIRMED = new Set(["approved", "finalized", "closed"]);

async function loadTotals(buildingId: string, period: string): Promise<{ ok: true; totals: Map<string, number> } | { ok: false; message: string }> {
  const ps = await listPeriods(buildingId);
  if (!ps.ok) return ps;
  const win = new Set(trendWindow(period));
  const months = ps.data.filter((p) => win.has(p.period) && CONFIRMED.has(p.status)).map((p) => p.period);
  const rs = await Promise.all(months.map((m) => getCategoryReport(buildingId, m)));
  const totals = new Map<string, number>();
  for (let i = 0; i < months.length; i++) {
    const r = rs[i];
    if (!r.ok) return r;
    totals.set(months[i], r.data.total);
  }
  return { ok: true, totals };
}

export async function TrendCard({ buildingId, period }: { buildingId: string; period: string }) {
  const d = await loadTotals(buildingId, period);
  const head = <CardHead title="④ 건물 전체 12개월 흐름" description={`${periodLabel(period)}까지 12개월, 금액을 확정한 달의 건물 관리비 합계와 1년 전 같은 달 비교입니다. 확정 전인 달은 0원이 아니라 비워 둡니다.`} />;
  if (!d.ok) return <Card className="bld-noprint mt-4 p-4 sm:p-5">{head}<p className="text-[length:var(--fs-body)] text-et">불러오지 못했습니다. {d.message}</p></Card>;
  const rows = trendMonths(period, d.totals);
  const max = Math.max(1, ...rows.flatMap((r) => [r.cur ?? 0, r.prevYear ?? 0]));
  const confirmed = rows.filter((r) => r.cur !== null);
  const bar = (v: number | null, cls: string, h: string) => (
    <div className={cn("w-full rounded-full bg-sf2", h)} aria-hidden>{v !== null && <div className={cn("h-full rounded-full", cls)} style={{ width: `${Math.round((v / max) * 100)}%` }} />}</div>
  );
  return (
    <Card className="bld-noprint mt-4 p-4 sm:p-5" data-testid="trend-card">
      {head}
      {confirmed.length === 0 ? <p className="text-[length:var(--fs-body)] text-t2">최근 12개월 안에 금액을 확정한 달이 없습니다.</p> : (
        <div className="bld-dense overflow-x-auto" tabIndex={0} role="region" aria-label="12개월 흐름(옆으로 밀어 보기)">
          <table className={cn(TABLE, "text-[length:var(--fs-meta)]")}>
            <thead className={THEAD}>
              <tr><th className={TH}>달</th><th className={NUMH}>관리비 합계</th><th className={NUMH}>1년 전 같은 달</th><th className={NUMH}>차이(차이율)</th><th className={cn(TH, "w-[30%] min-w-[140px]")}><span className="sr-only">막대: 진한 줄이 이번, 옅은 줄이 1년 전</span></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period} className="border-b border-[var(--bd)]">
                  <td className={cn(TD, "whitespace-nowrap")}>{Number(r.period.slice(0, 4))}년 {Number(r.period.slice(5))}월</td>
                  <td className={cn(NUM, "font-semibold text-t")}>{r.cur === null ? <span className="font-normal text-t3">확정 전</span> : won(r.cur)}</td>
                  <td className={NUM}>{r.prevYear === null ? <span className="text-t3">확정 없음</span> : won(r.prevYear)}</td>
                  <td className={NUM}>
                    {r.diff === null ? <span className="text-t3">-</span> : r.diff === 0 ? <span className="text-t3">같음</span> : (
                      <span>{r.diff > 0 ? "▲ " : "▼ "}{won(Math.abs(r.diff))}{r.pct !== null && <span className="ml-1 text-t2">({r.diff > 0 ? "+" : "−"}{Math.abs(r.pct * 100).toFixed(1)}%)</span>}</span>
                    )}
                  </td>
                  <td className={TD}>
                    <div className="flex flex-col gap-1">{bar(r.cur, "bg-[var(--accent)]", "h-[8px]")}{bar(r.prevYear, "bg-[var(--t3)] opacity-60", "h-[5px]")}</div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--t)] font-bold text-t">
                <td className={TD}>확정 {confirmed.length}개월 합</td>
                <td className={NUM}>{won(confirmed.reduce((a, r) => a + (r.cur ?? 0), 0))}</td>
                <td className={TD} colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
