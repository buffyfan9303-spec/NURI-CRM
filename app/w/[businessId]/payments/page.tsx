/** 수납 확인(building): 입금 등록·배정·취소. revenue.read 필요, 등록·배정은 payment.allocate 필요(서버 재검사). */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { PaymentsBoard } from "@/components/building-ops/PaymentsBoard";
import { unitLabel } from "@/components/building-ops/format";
import { listParties, listPayments, listReceivables, listUnits, withPaymentAllocation } from "@/lib/domain/building";

export default async function PaymentsPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "revenue.read", searchParams, "수납 확인");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [pRes, rRes, uRes, ptRes] = await Promise.all([
    listPayments(ctx.building.id), listReceivables(ctx.building.id, { openOnly: true }), listUnits(ctx.building.id, { includeInactive: true }), listParties(ctx.businessId),
  ]);
  const fail = !pRes.ok ? pRes : !rRes.ok ? rRes : !uRes.ok ? uRes : !ptRes.ok ? ptRes : null;
  const head = <BuildingHeader ctx={ctx} title="수납 확인" description="입금을 등록하고 청구에 배정합니다. 선납·부분 납부·취소까지 여기서 처리합니다." showPeriod={false} />;
  if (fail || !pRes.ok || !rRes.ok || !uRes.ok || !ptRes.ok) return <PageBody>{head}<ReadFail title="수납 정보를 불러오지 못했습니다." message={fail && !fail.ok ? fail.message : ""} /></PageBody>;
  const lines = await withPaymentAllocation(pRes.data);
  if (!lines.ok) return <PageBody>{head}<ReadFail title="입금 배정 현황을 불러오지 못했습니다." message={lines.message} /></PageBody>;

  const units = uRes.data.map((u) => ({ id: u.id, label: unitLabel(u), active: u.active }));
  const uName = new Map(units.map((u) => [u.id, u.label]));
  const recs = rRes.data
    .map((r) => ({ id: r.id, unit_id: r.unit_id, party_id: r.party_id, period: r.period, due_date: r.due_date, outstanding: (r.amount ?? 0) - (r.paid ?? 0) - (r.credit_applied ?? 0), unitLabel: uName.get(r.unit_id) ?? "호실" }))
    .filter((r) => r.outstanding > 0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.access.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <PageBody wide>
      {head}
      <PaymentsBoard
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        units={units.filter((u) => u.active).map(({ id, label }) => ({ id, label }))}
        payments={lines.data.map((l) => ({ ...l, unit_id: l.unit_id }))}
        recs={recs}
        partyNames={Object.fromEntries(ptRes.data.map((p) => [p.id, p.name]))}
        canAllocate={ctx.can("payment.allocate")}
        today={today}
      />
    </PageBody>
  );
}
