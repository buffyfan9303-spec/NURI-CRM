import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { getFactoryOrder } from "@/lib/domain/factory";
import { getAccess } from "../../../access";
import { WorkOrderSheet } from "@/components/factory/WorkOrderSheet";
import { PrintButton, PrintStyles } from "@/components/factory/PrintButton";

export default async function FactoryOrderPrintPage({ params }: { params: { businessId: string; orderId: string } }) {
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

  const result = await getFactoryOrder(access.businessId, params.orderId);
  if (!result.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="주문을 불러오지 못했습니다." description={result.message} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[820px] p-4 md:p-6">
      <PrintStyles />
      <PrintButton label="작지서 인쇄" />
      <WorkOrderSheet order={result.data.order} businessName={access.businessName} />
    </div>
  );
}
