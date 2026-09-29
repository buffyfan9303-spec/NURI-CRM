/** 세금계산서 일괄발행(building 전용): 이번 달 목록 → 홈택스 엑셀 → 올리는 방법 → 승인번호. 화면 접근은 revenue.read, 쓰기는 tax.issue(서버 재검사). */
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, isLockedStatus, type SearchParams } from "@/components/building-ops/gate";
import { EnableTaxButton, TaxBoard, type TaxLine } from "@/components/building-ops/TaxBoard";
import { getLatestRun, getPeriod, listTaxTargets } from "@/lib/domain/building";

export default async function TaxPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "revenue.read", searchParams, "세금계산서 일괄발행");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const head = <BuildingHeader ctx={ctx} title="세금계산서 일괄발행" description="이번 달 발행할 목록을 확인하고, 홈택스에 올릴 엑셀을 내려받고, 발행이 끝나면 승인번호를 넣습니다. 파일을 내려받는 것만으로는 발행되지 않습니다." />;
  if (ctx.features.tax_invoice !== "on") {
    return (
      <PageBody>
        {head}
        <Card><EmptyState title="세금계산서 발행 도움이 아직 꺼져 있습니다." description={ctx.can("staff.manage") ? "아래 버튼으로 켜면 이 화면에서 바로 목록 만들기, 홈택스용 엑셀 내려받기, 승인번호 넣기를 할 수 있습니다. 이미 입력한 자료는 바뀌지 않습니다." : "사업장 대표가 켜야 쓸 수 있습니다. 대표에게 세금계산서 발행 도움을 켜 달라고 요청하세요."} action={ctx.can("staff.manage") ? <EnableTaxButton businessId={ctx.businessId} /> : undefined} /></Card>
      </PageBody>
    );
  }
  const pRes = await getPeriod(ctx.building.id, ctx.period);
  if (!pRes.ok) return <PageBody>{head}<ReadFail title="청구월을 불러오지 못했습니다." message={pRes.message} /></PageBody>;
  const rRes = pRes.data ? await getLatestRun(pRes.data.id) : { ok: true as const, data: null };
  if (!rRes.ok) return <PageBody>{head}<ReadFail title="계산 결과를 불러오지 못했습니다." message={rRes.message} /></PageBody>;
  const run = rRes.data;
  const tRes = run ? await listTaxTargets(run.id) : { ok: true as const, data: [] };
  if (!tRes.ok) return <PageBody>{head}<ReadFail title="발행 대상을 불러오지 못했습니다." message={tRes.message} /></PageBody>;
  const lines: TaxLine[] = tRes.data.map((t) => ({
    id: t.id, kind: t.kind, receiver: t.snapshot?.receiver?.name ?? "(공급받는자 정보 없음)", supply: t.supply, tax: t.tax, total: t.total, writeDate: t.write_date,
    status: t.issue_status, blockReasons: t.block_reasons ?? [], fileName: t.file_name, approvalNo: t.nts_approval_no, failReason: t.fail_reason,
  }));
  return (
    <PageBody wide>
      {head}
      <TaxBoard businessId={ctx.businessId} runId={run?.id ?? null} runApproved={run?.status === "approved"} lines={lines} canIssue={ctx.can("tax.issue")} periodLocked={isLockedStatus(pRes.data?.status)} />
    </PageBody>
  );
}
