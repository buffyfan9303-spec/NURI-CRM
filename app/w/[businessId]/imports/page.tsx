/** 파일 가져오기(building 전용): 검침·청구서·은행 입금·비용 파일 4단계 + 내역·취소. 화면 접근은 write. 읽기·저장은 /api/building/import, 확정·취소는 서버 액션. */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { ImportsBoard } from "@/components/building-ops/ImportWizard";
import { listChargeTypes, listImportBatches } from "@/lib/domain/building";
import type { MeterKind } from "@/lib/domain/building-types";

export default async function ImportsPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "write", searchParams, "파일 가져오기");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [bRes, tRes] = await Promise.all([listImportBatches(ctx.building.id), listChargeTypes(ctx.building.id)]);
  const head = <BuildingHeader ctx={ctx} title="파일 가져오기" description="엑셀·CSV 파일을 열 확인과 미리보기를 거쳐 넣습니다." showPeriod={false} />;
  if (!bRes.ok || !tRes.ok) return <PageBody>{head}<ReadFail title="가져오기 자료를 불러오지 못했습니다." message={!bRes.ok ? bRes.message : !tRes.ok ? tRes.message : ""} /></PageBody>;
  const names = new Map(tRes.data.map((t) => [t.id, t.name]));
  const meterKinds: MeterKind[] = ["electric", "water", ...(ctx.features.meter_gas === "on" ? (["gas"] as const) : []), ...(ctx.features.meter_heat === "on" ? (["heat", "hotwater"] as const) : [])];
  return (
    <PageBody wide>
      {head}
      <ImportsBoard
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        period={ctx.period}
        canBank={ctx.can("payment.allocate")}
        meterKinds={meterKinds}
        chargeTypes={tRes.data.filter((t) => t.source_kind === "expense" || t.source_kind === "direct").map((t) => ({ id: t.id, name: t.name, direct: t.source_kind === "direct" }))}
        batches={bRes.data.map((b) => ({ ...b, chargeName: b.charge_type_id ? names.get(b.charge_type_id) ?? null : null }))}
      />
    </PageBody>
  );
}
