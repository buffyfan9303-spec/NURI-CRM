/** 건물 미수금 화면(서버). 공용 receivables/page.tsx 가 building 업종일 때 이 컴포넌트를 돌려준다. */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "./gate";
import { BldReceivablesBoard } from "./BldReceivablesBoard";
import { ageDays } from "./aging";
import { unitLabel } from "./format";
import { getAging, lastDunning, listParties, listReceivables, listUnits } from "@/lib/domain/building";

export async function BldReceivablesView({ businessId, searchParams }: { businessId: string; searchParams: SearchParams }) {
  const g = await buildingGate(businessId, "revenue.read", searchParams, "미수금");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [aRes, rRes, uRes, pRes] = await Promise.all([getAging(ctx.building.id), listReceivables(ctx.building.id, { openOnly: true }), listUnits(ctx.building.id, { includeInactive: true }), listParties(businessId)]);
  const head = <BuildingHeader ctx={ctx} title="미수금" description="납부기한이 지난 관리비를 연체 일수로 나눠 보고, 입주자에게 연락한 기록을 남깁니다." showPeriod={false} />;
  if (!aRes.ok || !rRes.ok || !uRes.ok || !pRes.ok) {
    const m = !aRes.ok ? aRes.message : !rRes.ok ? rRes.message : !uRes.ok ? uRes.message : !pRes.ok ? pRes.message : "";
    return <PageBody>{head}<ReadFail title="미수금을 불러오지 못했습니다." message={m} /></PageBody>;
  }
  const dRes = await lastDunning(rRes.data.map((r) => r.id));
  if (!dRes.ok) return <PageBody>{head}<ReadFail title="독촉 기록을 불러오지 못했습니다." message={dRes.message} /></PageBody>;

  const uName = new Map(uRes.data.map((u) => [u.id, unitLabel(u)]));
  const party = new Map(pRes.data.map((p) => [p.id, p.name]));
  const asof = aRes.data.asof;
  const rows = rRes.data
    .map((r) => {
      const d = dRes.data.get(r.id);
      return {
        id: r.id, unitLabel: uName.get(r.unit_id) ?? "호실", party: r.party_id ? party.get(r.party_id) ?? null : null, period: r.period, kind: r.kind, due_date: r.due_date,
        outstanding: (r.amount ?? 0) - (r.paid ?? 0) - (r.credit_applied ?? 0), age: ageDays(asof, r.due_date),
        dunning: d ? { stage: d.stage, channel: d.channel, date: d.created_at.slice(0, 10), promise: d.promise_date, count: d.count } : null,
      };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.age - a.age || a.unitLabel.localeCompare(b.unitLabel, "ko"));

  return (
    <PageBody wide>
      {head}
      <BldReceivablesBoard
        businessId={businessId} asof={asof} buckets={aRes.data.buckets} rows={rows}
        topUnits={aRes.data.units.filter((u) => u.overdue_balance > 0).slice(0, 5).map((u) => ({ unit_id: u.unit_id, label: uName.get(u.unit_id) ?? u.unit_no, party: u.party_id ? party.get(u.party_id) ?? null : null, overdue_balance: u.overdue_balance, not_due_balance: u.not_due_balance, max_age: u.max_age, count: u.count }))}
        lateFeeOn={ctx.features.late_fee === "on"} canWrite={ctx.can("write")}
      />
    </PageBody>
  );
}
