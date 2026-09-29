/** 관리비 보고서(building): 분류별 집계·전월 대비·엑셀. 승인된 청구만 집계된다. revenue.read 필요. */
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { CardHead, TABLE, THEAD, TH, TR, TD, SummaryStrip } from "@/components/rental/listkit";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { tableFromReport } from "@/components/building-ops/report-xlsx";
import { won } from "@/components/building-ops/format";
import { periodLabel } from "@/components/building/period";
import { getCategoryReport, getPeriod } from "@/lib/domain/building";
import { PERIOD_STATUS_LABEL } from "@/lib/domain/building-types";

const LINK = "inline-flex min-h-[44px] items-center rounded-[var(--r-md)] border border-[var(--bd-strong)] bg-sf px-4 text-[length:var(--fs-body)] font-medium text-t shadow-card hover:bg-sf2";

function Delta({ n }: { n: number }) {
  if (n === 0) return <span className="text-t3">변동 없음</span>;
  return <span className="tabular-nums">{n > 0 ? "▲ 증가 " : "▼ 감소 "}{won(Math.abs(n))}</span>;
}

export default async function ReportsPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "revenue.read", searchParams, "보고서");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [rRes, pRes] = await Promise.all([getCategoryReport(ctx.building.id, ctx.period), getPeriod(ctx.building.id, ctx.period)]);
  const q = `businessId=${ctx.businessId}&b=${ctx.building.id}&p=${ctx.period}`;
  const head = <BuildingHeader ctx={ctx} title="보고서" description="승인된 청구를 분류별로 모아 전월과 비교합니다." />;
  if (!rRes.ok) return <PageBody>{head}<ReadFail title="보고서를 불러오지 못했습니다." message={rRes.message} /></PageBody>;
  const t = tableFromReport(rRes.data);
  const status = pRes.ok ? pRes.data?.status : undefined;
  const empty = rRes.data.categories.length === 0;
  return (
    <PageBody wide>
      {head}
      <SummaryStrip
        items={[
          { label: `${periodLabel(ctx.period)} 합계`, value: won(t.total) },
          { label: `전월(${rRes.data.prev_period}) 합계`, value: won(t.prevTotal) },
          { label: "전월 대비", value: <Delta n={t.total - t.prevTotal} /> },
          { label: "청구월 상태", value: status ? PERIOD_STATUS_LABEL[status] : "자료 수집" },
        ]}
      />
      <Card className="p-4 sm:p-5">
        <CardHead
          title="분류별 집계"
          description="상가건물 임대차 관리비 14분류에 임대료·기타를 더한 표입니다."
          action={
            <div className="flex flex-wrap gap-2">
              <a className={LINK} href={`/api/building/report-xlsx?${q}&kind=report`} download>엑셀 내려받기</a>
              {ctx.can("export") && <a className={LINK} href={`/api/building/report-xlsx?${q}&kind=ledger`} download>월 원장 엑셀(7시트)</a>}
            </div>
          }
        />
        {empty ? (
          <EmptyState title="이 달에는 승인된 청구가 없습니다." description="관리비를 계산하고 승인하면 이 표가 채워집니다. 전월 합계는 위 요약에 그대로 보입니다." />
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr><th className={TH}>분류</th><th className={`${TH} text-right`}>공급가</th><th className={`${TH} text-right`}>부가세</th><th className={`${TH} text-right`}>면세</th><th className={`${TH} text-right`}>합계</th><th className={`${TH} text-right`}>전월</th><th className={TH}>증감</th></tr>
              </thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.key} className={`${TR} ${r.amount === 0 && r.prev === 0 ? "text-t3" : ""}`}>
                    <td className={TD}>{r.label}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(r.supply)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(r.vat)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(r.exempt)}</td>
                    <td className={`${TD} text-right tabular-nums font-medium`}>{won(r.amount)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(r.prev)}</td>
                    <td className={TD}><Delta n={r.diff} /></td>
                  </tr>
                ))}
                {t.prevOnly !== 0 && (
                  <tr className={TR}>
                    <td className={TD}>전월에만 있던 항목 <Badge kind="info">이번 달 없음</Badge></td>
                    <td className={`${TD} text-right`} colSpan={4}></td>
                    <td className={`${TD} text-right tabular-nums`}>{won(t.prevOnly)}</td>
                    <td className={TD}><Delta n={-t.prevOnly} /></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--bd-strong)] font-semibold">
                  <td className={TD}>합계</td><td className={TD} colSpan={3}></td>
                  <td className={`${TD} text-right tabular-nums`}>{won(t.total)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{won(t.prevTotal)}</td>
                  <td className={TD}><Delta n={t.total - t.prevTotal} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </PageBody>
  );
}
