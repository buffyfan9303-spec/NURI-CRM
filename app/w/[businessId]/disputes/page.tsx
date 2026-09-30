/** 입주자 문의·이의(building 전용). 화면 접근은 view, 기록·처리는 write(서버 재검사). 이의는 확정된 청구서에만 남긴다. */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { DisputesBoard } from "@/components/building-ops/DisputesBoard";
import { TenantPortalCard } from "@/components/building-ops/TenantPortalCard";
import { unitLabel } from "@/components/building-ops/format";
import { getLatestRun, getPeriod, listBills, listChargeTypes, listDisputes, listUnits } from "@/lib/domain/building";
import type { BillRow } from "@/lib/domain/building-types";

export default async function DisputesPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "view", searchParams, "입주자 문의·이의");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const head = <BuildingHeader ctx={ctx} title="입주자 문의·이의" description="입주자가 관리비에 대해 물어보거나 이의를 낸 것을 기록하고, 처리한 내용까지 남깁니다." />;
  const [dRes, uRes, pRes, ctRes] = await Promise.all([listDisputes(ctx.businessId, ctx.building.id), listUnits(ctx.building.id, { includeInactive: true }), getPeriod(ctx.building.id, ctx.period), listChargeTypes(ctx.building.id, { includeInactive: true })]);
  if (!dRes.ok || !uRes.ok || !pRes.ok) return <PageBody>{head}<ReadFail title="문의·이의를 불러오지 못했습니다." message={!dRes.ok ? dRes.message : !uRes.ok ? uRes.message : !pRes.ok ? pRes.message : ""} /></PageBody>;
  // 이 달에 확정(승인)된 계산이 있으면 그 청구서만 기록 대상이 된다.
  let bills: BillRow[] = [];
  if (pRes.data) {
    const run = await getLatestRun(pRes.data.id);
    if (!run.ok) return <PageBody>{head}<ReadFail title="청구서를 불러오지 못했습니다." message={run.message} /></PageBody>;
    if (run.data?.status === "approved") {
      const b = await listBills(run.data.id);
      if (!b.ok) return <PageBody>{head}<ReadFail title="청구서를 불러오지 못했습니다." message={b.message} /></PageBody>;
      bills = b.data;
    }
  }
  const unitNames = Object.fromEntries(uRes.data.map((u) => [u.id, unitLabel(u)]));
  // 입주자가 고른 항목 이름(못 읽으면 이름 없이 표시 — 목록 자체는 막지 않는다).
  const chargeNames = ctRes.ok ? Object.fromEntries(ctRes.data.map((c) => [c.id, c.name])) : {};
  return (
    <PageBody wide>
      {head}
      <div className="mb-4">
        <TenantPortalCard
          businessId={ctx.businessId}
          building={{ id: ctx.building.id, name: ctx.building.name, office_name: ctx.building.office_name, office_phone: ctx.building.office_phone, office_hours: ctx.building.office_hours }}
          feature={ctx.features.tenant_portal}
          canWrite={ctx.can("write")}
          canBilling={ctx.can("revenue.read")}
          tz={ctx.access.timezone}
          unitNames={unitNames}
        />
      </div>
      <DisputesBoard
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        period={ctx.period}
        tz={ctx.access.timezone}
        canWrite={ctx.can("write")}
        canBilling={ctx.can("revenue.read")}
        bills={bills.map((b) => ({ id: b.id, label: unitNames[b.unit_id] ?? "(알 수 없는 호실)" })).sort((a, b) => a.label.localeCompare(b.label, "ko", { numeric: true }))}
        unitNames={unitNames}
        chargeNames={chargeNames}
        rows={dRes.data}
      />
    </PageBody>
  );
}
