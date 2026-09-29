/** 세금계산서·계산서 발행 도움(building 전용): 대상 확인 → 홈택스 파일 → 승인번호 기록. 화면 접근은 revenue.read, 쓰기는 tax.issue(서버 재검사). */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, isLockedStatus, type SearchParams } from "@/components/building-ops/gate";
import { TaxBoard, type TaxLine } from "@/components/building-ops/TaxBoard";
import { getLatestRun, getPeriod, listTaxTargets } from "@/lib/domain/building";

export default async function TaxPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "revenue.read", searchParams, "세금계산서");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const head = <BuildingHeader ctx={ctx} title="세금계산서·계산서" description="승인된 청구에서 홈택스 발급용 파일을 준비하고, 발급한 뒤 승인번호를 기록합니다." />;
  if (ctx.features.tax_invoice !== "on") {
    return (
      <PageBody>
        {head}
        <Card><EmptyState title="발행 도움 기능이 꺼져 있습니다." description="선택 기능에서 세금계산서 발행 도움을 켜면 이 화면을 쓸 수 있습니다." action={<Link href={`/w/${ctx.businessId}/settings`} className="text-[length:var(--fs-body)] font-medium text-t underline">선택 기능 설정으로</Link>} /></Card>
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
