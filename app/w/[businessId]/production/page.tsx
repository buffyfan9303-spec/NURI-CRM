/**
 * 공정 칸반 — 작지→재단→봉제→가봉→외주→검수→출고.
 * 이건 생산 작업시간이지 근태가 아니다. "출퇴근"이라는 말은 이 화면 어디에도 없다
 * (사용자 필수 요구, docs/crm-baseline-inventory.md §C / lib/industry/config.ts factory 주석).
 */
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listProcessBoard, listFactoryOrders } from "@/lib/domain/factory";
import { listAssignableMembers } from "@/lib/domain/calendar";
import { getAccess } from "../access";
import { ProductionBoard } from "@/components/factory/ProductionBoard";

export default async function ProductionPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </div>
    );
  }

  if (access.industry !== "factory") {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <EmptyState title="이 업종에는 공정 화면이 없습니다." />
        </Card>
      </div>
    );
  }

  const [boardRes, ordersRes, membersRes] = await Promise.all([
    listProcessBoard(access.businessId),
    listFactoryOrders(access.businessId, { status: ["접수", "진행중"] }),
    listAssignableMembers(access.businessId),
  ]);

  if (!boardRes.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="공정 현황을 불러오지 못했습니다." description={boardRes.message} />
        </Card>
      </div>
    );
  }
  if (!ordersRes.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="주문 목록을 불러오지 못했습니다." description={ordersRes.message} />
        </Card>
      </div>
    );
  }

  const startedOrderIds = new Set(boardRes.data.map((r) => r.orderId));
  const unstarted = ordersRes.data.filter((o) => !startedOrderIds.has(o.id));

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6">
      <h1 className="mb-4 text-[18px] font-semibold text-t">공정</h1>
      <ProductionBoard
        businessId={access.businessId}
        rows={boardRes.data}
        unstarted={unstarted}
        members={membersRes.ok ? membersRes.members : []}
        canWrite={access.caps.includes("write")}
      />
    </div>
  );
}
