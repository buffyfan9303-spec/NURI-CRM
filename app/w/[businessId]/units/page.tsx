/** 호실·입주자 목록(building 전용). 미납 표시는 revenue.read 가 있을 때만(금액 열은 서버 뷰가 마스킹). */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { TABLE, THEAD, TH, TR, TD, PILL } from "@/components/rental/listkit";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { UnitTools } from "@/components/building-ops/UnitTools";
import { USE_KIND_LABEL, parseRange } from "@/components/building-ops/unit-parse";
import { num, unitLabel, won } from "@/components/building-ops/format";
import { listContracts, listParties, listReceivables, listUnits } from "@/lib/domain/building";

export default async function UnitsPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "view", searchParams, "호실·입주자");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const canMoney = ctx.can("revenue.read");
  const [uRes, cRes, pRes, rRes] = await Promise.all([
    listUnits(ctx.building.id),
    listContracts(ctx.building.id),
    listParties(ctx.businessId),
    canMoney ? listReceivables(ctx.building.id, { openOnly: true }) : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  if (!uRes.ok || !cRes.ok || !pRes.ok || !rRes.ok) {
    const message = !uRes.ok ? uRes.message : !cRes.ok ? cRes.message : !pRes.ok ? pRes.message : !rRes.ok ? rRes.message : "";
    return (
      <PageBody>
        <BuildingHeader ctx={ctx} title="호실·입주자" showPeriod={false} />
        <ReadFail title="호실 목록을 불러오지 못했습니다." message={message} />
      </PageBody>
    );
  }
  const parties = new Map(pRes.data.map((p) => [p.id, p.name]));
  const contractOf = new Map(cRes.data.map((c) => [c.unit_id, c]));
  const owed = new Map<string, number>();
  for (const r of rRes.data) owed.set(r.unit_id, (owed.get(r.unit_id) ?? 0) + Math.max(0, (r.amount ?? 0) - (r.paid ?? 0) - (r.credit_applied ?? 0)));
  const q = `?b=${ctx.building.id}&p=${ctx.period}`;
  const canWrite = ctx.can("write");
  const units = [...uRes.data].sort((a, b) => unitLabel(a).localeCompare(unitLabel(b), "ko", { numeric: true }));
  return (
    <PageBody wide>
      <BuildingHeader ctx={ctx} title="호실·입주자" description="호실과 입주자, 계약을 관리합니다. 호실을 누르면 상세가 열립니다." showPeriod={false} />
      {canWrite && <UnitTools businessId={ctx.businessId} buildingId={ctx.building.id} />}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><h2 className="text-[length:var(--fs-card)] font-semibold text-t">호실 목록</h2><span className={PILL}>{units.length}개</span></div>
        {units.length === 0 ? (
          <EmptyState title="등록된 호실이 없습니다." description={canWrite ? "위에서 호실을 등록하세요." : "호실 등록은 쓰기 권한이 있는 담당자가 합니다."} />
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>호실</th><th className={TH}>용도</th>
                  <th className={`${TH} text-right`}>전용면적(㎡)</th><th className={TH}>입주자</th><th className={TH}>계약 기간</th>
                  {canMoney && <th className={`${TH} text-right`}>미납</th>}
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const c = contractOf.get(u.id);
                  const range = c ? parseRange(c.period) : null;
                  const due = owed.get(u.id) ?? 0;
                  return (
                    <tr key={u.id} className={TR}>
                      <td className={`${TD} font-medium`}><Link href={`/w/${ctx.businessId}/units/${u.id}${q}`} className="text-t underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{unitLabel(u)}</Link></td>
                      <td className={TD}>{USE_KIND_LABEL[u.use_kind]}</td>
                      <td className={`${TD} text-right tabular-nums`}>{num(u.area_exclusive)}</td>
                      <td className={TD}>{c ? parties.get(c.tenant_party_id) ?? "(확인 필요)" : <Badge kind="info">공실</Badge>}</td>
                      <td className={`${TD} tabular-nums`}>{range ? `${range.from} ~ ${range.to ?? "기한 없음"}` : "-"}</td>
                      {canMoney && <td className={`${TD} text-right tabular-nums`}>{due > 0 ? <Badge kind="warning">{won(due)}</Badge> : "-"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageBody>
  );
}
