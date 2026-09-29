/** 민원·수리(building 전용, 선택 기능 work_orders). 화면 접근은 view, 등록·변경은 write(서버 재검사). 비용은 revenue.read 가 있을 때만 보인다. */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, type SearchParams } from "@/components/building-ops/gate";
import { WorkOrdersBoard } from "@/components/building-ops/WorkOrders";
import { listAssignableMembers } from "@/lib/domain/calendar";
import { listUnits, listWorkOrders } from "@/lib/domain/building";

export default async function RequestsPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "view", searchParams, "민원·수리");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const head = <BuildingHeader ctx={ctx} title="민원·수리" description="입주자가 알려 온 불편과 고칠 일을 적고 끝날 때까지 봅니다." showPeriod={false} />;
  if (ctx.features.work_orders !== "on") {
    return (
      <PageBody>
        {head}
        <Card><EmptyState title="민원·수리 기능이 꺼져 있습니다." description="설정의 선택 기능에서 민원·수리를 켜면 이 화면을 쓸 수 있습니다." action={<Link href={`/w/${ctx.businessId}/settings`} className="text-[length:var(--fs-body)] font-medium text-t underline">선택 기능 설정으로</Link>} /></Card>
      </PageBody>
    );
  }
  const [wRes, uRes, mRes] = await Promise.all([listWorkOrders(ctx.building.id), listUnits(ctx.building.id), listAssignableMembers(ctx.businessId)]);
  if (!wRes.ok || !uRes.ok) return <PageBody>{head}<ReadFail title="민원·수리를 불러오지 못했습니다." message={!wRes.ok ? wRes.message : !uRes.ok ? uRes.message : ""} /></PageBody>;
  // 담당자 목록은 보조 자료라 실패해도 화면은 연다(담당자 없이 접수 가능).
  const members = mRes.ok ? mRes.members.map((m) => ({ userId: m.userId, name: m.displayName || m.role })) : [];
  return (
    <PageBody wide>
      {head}
      <WorkOrdersBoard
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        canWrite={ctx.can("write")}
        canCost={ctx.can("revenue.read")}
        units={uRes.data.map((u) => ({ id: u.id, label: u.dong ? `${u.dong}동 ${u.unit_no}` : u.unit_no }))}
        members={members}
        rows={wRes.data}
      />
    </PageBody>
  );
}
