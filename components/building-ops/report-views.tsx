/**
 * 보고서 화면의 다른 보기 3개(서버): 소유자·관리단 보고(?view=owners), 예산(?view=budget), 장기수선충당금(?view=repair).
 * 금액은 전부 서버가 준 정수 원을 더하기만 한다(새 금액 규칙 없음). 기능이 꺼져 있으면 그 카드에 "선택 기능에서 켜세요"를 보인다.
 * 월별 정산 보고서(page.tsx)와 같은 loadSettlement 를 그대로 쓴다.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { CardHead, SummaryStrip, PrintButton, TABLE, THEAD, TH, TD } from "@/components/rental/listkit";
import { BuildingHeader, ReadFail, type BuildingCtx } from "@/components/building-ops/gate";
import { BudgetTable, RepairFundLedger } from "@/components/building-ops/BudgetRepair";
import { num, won } from "@/components/building-ops/format";
import { periodLabel } from "@/components/building/period";
import { loadSettlement } from "@/components/building/settlement-load";
import { budgetVsActual, fundSummary, topExpenses } from "@/components/building/owners-report";
import { listBudgets, listChargeTypes, listExpenses, listRepairFund, listYearCategoryReports } from "@/lib/domain/building";
import { cn } from "@/lib/utils/cn";

import { REPORT_TABS, parseView, type ReportView } from "@/components/building-ops/report-tabs";

export { parseView, type ReportView };

const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;

/** 보기 바꾸는 탭(인쇄에는 안 나옴). 건물·월은 그대로 들고 간다. */
export function ReportTabs({ ctx, view }: { ctx: BuildingCtx; view: ReportView }) {
  const href = (k: ReportView) => `/w/${ctx.businessId}/reports?b=${ctx.building.id}&p=${ctx.period}${k === "settle" ? "" : `&view=${k}`}`;
  return (
    <nav aria-label="보고서 보기" className="mb-4 flex flex-wrap gap-1.5">
      {REPORT_TABS.map((t) => (
        <Link key={t.key} href={href(t.key)} aria-current={t.key === view ? "page" : undefined}
          className={cn("inline-flex min-h-[44px] items-center rounded-[var(--r-md)] border px-4 text-[length:var(--fs-body)] font-medium", t.key === view ? "border-[var(--accent)] bg-sf2 text-t" : "border-[var(--bd)] bg-sf text-t2 hover:bg-sf2")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function FeatureOff({ ctx, label }: { ctx: BuildingCtx; label: string }) {
  return (
    <EmptyState title={`${label} 기능이 꺼져 있습니다.`}
      description={ctx.can("staff.manage") ? "선택 기능에서 켜세요." : "선택 기능은 사업장 대표(직원·권한 관리 권한)가 설정에서 켭니다. 대표에게 켜 달라고 요청하세요."}
      action={ctx.can("staff.manage") ? <Link href={`/w/${ctx.businessId}/settings`} className="text-[length:var(--fs-body)] font-medium text-t underline">선택 기능 설정으로</Link> : undefined} />
  );
}

const Fail = ({ ctx, view, message, title }: { ctx: BuildingCtx; view: ReportView; message: string; title: string }) => (
  <PageBody>
    <BuildingHeader ctx={ctx} title={title} />
    <ReportTabs ctx={ctx} view={view} />
    <ReadFail title="불러오지 못했습니다." message={message} />
  </PageBody>
);

/** 예산 대비 실적 자료(연초~이번 달). 끄면 null. */
async function loadBudget(ctx: BuildingCtx) {
  const year = Number(ctx.period.slice(0, 4));
  const [b, r] = await Promise.all([listBudgets(ctx.building.id, year), listYearCategoryReports(ctx.building.id, ctx.period)]);
  if (!b.ok) return { ok: false as const, message: b.message };
  if (!r.ok) return { ok: false as const, message: r.message };
  return { ok: true as const, year, ...budgetVsActual(b.data, r.data) };
}

export async function BudgetView({ ctx }: { ctx: BuildingCtx }) {
  const title = "예산 대비 실적";
  const head = <BuildingHeader ctx={ctx} title={title} description="분류마다 한 해 예산을 적고, 연초부터 이번 달까지 확정한 금액과 견줍니다." />;
  if (ctx.features.budget !== "on") return <PageBody>{head}<ReportTabs ctx={ctx} view="budget" /><Card><FeatureOff ctx={ctx} label="예산 대비 실적" /></Card></PageBody>;
  const d = await loadBudget(ctx);
  if (!d.ok) return <Fail ctx={ctx} view="budget" title={title} message={d.message} />;
  return (
    <PageBody wide>
      {head}
      <ReportTabs ctx={ctx} view="budget" />
      <BudgetTable businessId={ctx.businessId} buildingId={ctx.building.id} year={d.year} canEdit={ctx.can("billing.configure")} lines={d.lines} />
    </PageBody>
  );
}

export async function RepairView({ ctx }: { ctx: BuildingCtx }) {
  const title = "장기수선충당금";
  const head = <BuildingHeader ctx={ctx} title={title} description="건물을 고치려고 모아 두는 돈의 적립·이자·사용 장부와 잔액입니다." />;
  if (ctx.features.long_term_repair !== "on") return <PageBody>{head}<ReportTabs ctx={ctx} view="repair" /><Card><FeatureOff ctx={ctx} label="장기수선충당금" /></Card></PageBody>;
  const r = await listRepairFund(ctx.building.id);
  if (!r.ok) return <Fail ctx={ctx} view="repair" title={title} message={r.message} />;
  const f = fundSummary(r.data, ctx.period);
  return (
    <PageBody wide>
      {head}
      <ReportTabs ctx={ctx} view="repair" />
      <SummaryStrip items={[
        { label: `${periodLabel(ctx.period)}까지 잔액`, value: won(f.balance), tone: f.balance < 0 ? "danger" : "default" },
        { label: `${periodLabel(ctx.period)} 증감`, value: won(f.monthChange), tone: f.monthChange < 0 ? "danger" : f.monthChange > 0 ? "success" : "muted" },
        { label: "적은 기록", value: `${r.data.length}건` },
      ]} />
      <RepairFundLedger businessId={ctx.businessId} buildingId={ctx.building.id} period={ctx.period} canWrite={ctx.can("write")}
        rows={r.data.map((x) => ({ id: x.id, period: x.period, kind: x.kind, amount: x.amount, memo: x.memo }))} />
    </PageBody>
  );
}

/** 소유자·관리단 월 보고서: 한 장 인쇄(A4 세로). 월별 정산 보고서와 같은 확정 자료를 요약한다. */
export async function OwnersView({ ctx }: { ctx: BuildingCtx }) {
  const title = "소유자·관리단 월 보고서";
  const desc = "이번 달 관리비, 받은 돈과 못 받은 돈, 예산 대비 실적, 장기수선충당금 잔액, 주요 지출을 한 장에 봅니다.";
  if (ctx.features.owners_report !== "on") {
    return <PageBody><BuildingHeader ctx={ctx} title={title} description={desc} /><ReportTabs ctx={ctx} view="owners" /><Card><FeatureOff ctx={ctx} label="관리단 보고서" /></Card></PageBody>;
  }
  const budgetOn = ctx.features.budget === "on", repairOn = ctx.features.long_term_repair === "on";
  const [sRes, exRes, ctRes, bRes, fRes] = await Promise.all([
    loadSettlement(ctx.businessId, ctx.building.id, ctx.period), listExpenses(ctx.building.id, ctx.period), listChargeTypes(ctx.building.id, { includeInactive: true }),
    budgetOn ? loadBudget(ctx) : Promise.resolve(null), repairOn ? listRepairFund(ctx.building.id, { upToPeriod: ctx.period }) : Promise.resolve(null),
  ]);
  const bad = [sRes, exRes, ctRes, bRes, fRes].find((x) => x && !x.ok);
  if (bad && !bad.ok) return <Fail ctx={ctx} view="owners" title={title} message={bad.message} />;
  if (!sRes.ok || !exRes.ok || !ctRes.ok) return null;
  const names = new Map(ctRes.data.map((c) => [c.id, c.name]));
  const spend = topExpenses(exRes.data, (id) => names.get(id) ?? "(항목)");
  const t = sRes.data?.s.total;
  const fund = fRes && fRes.ok ? fundSummary(fRes.data, ctx.period) : null;
  const budget = bRes && bRes.ok ? bRes : null;
  const shownLines = budget ? budget.lines.filter((l) => l.budget || l.actual) : [];

  return (
    <PageBody>
      <BuildingHeader ctx={ctx} title={title} description={desc} actions={<PrintButton label="인쇄(A4 세로)" />} />
      <ReportTabs ctx={ctx} view="owners" />
      <style>{"@media print { @page { size: A4 portrait; margin: 10mm; } }"}</style>
      <div id="print-area" className="bld-owners">
        <h1 className="mb-3 hidden text-[18px] font-bold text-t print:block">{ctx.building.name} · {periodLabel(ctx.period)} 소유자·관리단 보고서</h1>

        <Card className="mb-4 p-4">
          <CardHead title="① 이번 달 관리비" description={sRes.data ? "금액을 확정한 청구만 셉니다. 못 받은 돈은 오늘 기준입니다." : undefined} />
          {t ? (
            <SummaryStrip className="mb-0" items={[
              { label: "이번 달 관리비 합계", value: won(t.current) },
              { label: "받은 돈", value: won(t.paid), tone: "success" },
              { label: "못 받은 돈", value: won(t.left), tone: t.left > 0 ? "danger" : "muted" },
            ]} />
          ) : <EmptyState title={`${periodLabel(ctx.period)} 금액이 아직 확정되지 않았습니다.`} description="관리비 계산·확정 화면에서 확정하면 채워집니다." />}
        </Card>

        <Card className="mb-4 p-4">
          <CardHead title="② 예산 대비 실적" description={budget ? `${budget.year}년 1월부터 ${periodLabel(ctx.period)}까지 확정한 금액을 분류별 예산과 견줍니다.` : undefined} />
          {!budgetOn ? <FeatureOff ctx={ctx} label="예산 대비 실적" /> : shownLines.length === 0 ? <EmptyState title="적어 둔 예산도, 확정한 실적도 없습니다." description="예산 탭에서 분류별 예산을 적으세요." /> : budget && (
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>분류</th><th className={`${TH} text-right`}>예산</th><th className={`${TH} text-right`}>실적</th><th className={`${TH} text-right`}>남은 예산</th><th className={`${TH} text-right`}>쓴 비율</th></tr></thead>
              <tbody>
                {shownLines.map((l) => (
                  <tr key={l.cat} className="border-b border-[var(--bd)]">
                    <td className={TD}>{l.label}</td><td className={NUM}>{num(l.budget)}</td><td className={NUM}>{num(l.actual)}</td>
                    <td className={cn(NUM, l.left < 0 && "font-semibold text-et")}>{num(l.left)}</td>
                    <td className={NUM}>{l.pct === null ? <span className="text-t3">-</span> : `${Math.round(l.pct * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-[var(--t)] font-bold text-t"><td className={TD}>합계</td><td className={NUM}>{num(budget.totalBudget)}</td><td className={NUM}>{num(budget.totalActual)}</td><td className={NUM}>{num(budget.totalBudget - budget.totalActual)}</td><td className={TD} /></tr></tfoot>
            </table>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2">
          <Card className="p-4">
            <CardHead title="③ 장기수선충당금" />
            {!repairOn ? <FeatureOff ctx={ctx} label="장기수선충당금" /> : fund && (
              <SummaryStrip className="mb-0" items={[{ label: `${periodLabel(ctx.period)}까지 잔액`, value: won(fund.balance), tone: fund.balance < 0 ? "danger" : "default" }, { label: "이번 달 증감", value: won(fund.monthChange), tone: fund.monthChange < 0 ? "danger" : fund.monthChange > 0 ? "success" : "muted" }]} />
            )}
          </Card>
          <Card className="p-4">
            <CardHead title="④ 이번 달 주요 지출" description="이번 달 적은 지출을 항목별로 합쳐 큰 순서 5개입니다." />
            {spend.length === 0 ? <EmptyState title="이번 달 적은 지출이 없습니다." /> : (
              <table className={TABLE}><tbody>{spend.map((s) => <tr key={s.name} className="border-b border-[var(--bd)]"><td className={TD}>{s.name}</td><td className={NUM}>{won(s.amount)}</td></tr>)}</tbody></table>
            )}
          </Card>
        </div>
      </div>
    </PageBody>
  );
}
