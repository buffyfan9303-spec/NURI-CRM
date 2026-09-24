/**
 * 작지 대기(접수 상태) 정장 주문 일괄 인쇄 — 기준본 batchPrintWO()에 대응.
 */
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { listFactoryOrders } from "@/lib/domain/factory";
import { getAccess } from "../../access";
import { WorkOrderSheet } from "@/components/factory/WorkOrderSheet";
import { PrintButton, PrintStyles } from "@/components/factory/PrintButton";

export default async function FactoryOrderBatchPrintPage({ params }: { params: { businessId: string } }) {
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

  const result = await listFactoryOrders(access.businessId, { status: ["접수"], type: ["suit"], sort: "due_asc" });
  if (!result.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="주문 목록을 불러오지 못했습니다." description={result.message} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[820px] p-4 md:p-6">
      <PrintStyles />
      <PrintButton label={`작지 ${result.data.length}건 일괄 인쇄`} />
      {result.data.length === 0 ? (
        <EmptyState title="작지 대기 중인 정장 주문이 없습니다." description="상태가 '접수'인 정장 주문만 여기 모입니다." />
      ) : (
        result.data.map((o) => <WorkOrderSheet key={o.id} order={o} businessName={access.businessName} />)
      )}
    </div>
  );
}
