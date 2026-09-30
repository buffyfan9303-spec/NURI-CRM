/** 관리비 항목(building 전용): 항목 목록, 세무 승인, 5단계 등록·수정. 화면 접근은 billing.configure. 서버 액션이 권한을 다시 검사한다. */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { ChargesBoard } from "@/components/building-ops/ChargeWizard";
import { unitLabel } from "@/components/building-ops/format";
import { listChargeTypes, listContracts, listParties, listUnits } from "@/lib/domain/building";

export default async function ChargesPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "billing.configure", searchParams, "관리비 항목 설정");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [tRes, uRes, pRes, cRes] = await Promise.all([listChargeTypes(ctx.building.id, { includeInactive: true }), listUnits(ctx.building.id), listParties(ctx.businessId), listContracts(ctx.building.id, { activeOnly: false })]);
  // 공급자 후보는 입주 계약이 없는 당사자(관리단·거래처)만. 입주자·청구 대상자는 뺀다.
  const tenantIds = new Set(cRes.ok ? cRes.data.flatMap((c) => [c.tenant_party_id, c.bill_to_party_id, c.tax_to_party_id].filter((x): x is string => !!x)) : []);
  const head = <BuildingHeader ctx={ctx} title="관리비 항목 설정" description="관리비에 들어가는 항목과, 호실에 나누는 방법을 정합니다." showPeriod={false} />;
  if (!tRes.ok || !uRes.ok) return <PageBody>{head}<ReadFail title="항목을 불러오지 못했습니다." message={!tRes.ok ? tRes.message : !uRes.ok ? uRes.message : ""} /></PageBody>;
  return (
    <PageBody wide>
      {head}
      <ChargesBoard
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        rows={tRes.data}
        units={uRes.data.map((u) => ({ id: u.id, label: unitLabel(u), area: Number(u.area_exclusive), share: Number(u.share), weight: Number(u.weight), use_kind: u.use_kind }))}
        parties={pRes.ok ? pRes.data.filter((x) => !tenantIds.has(x.id)).map((x) => ({ id: x.id, name: x.name })) : []}
        canConfigure={ctx.can("billing.configure")}
        canApproveTax={ctx.can("tax.issue")}
        selfApprove={ctx.features.self_approve === "on"}
      />
    </PageBody>
  );
}
