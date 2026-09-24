import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { getFactoryOrder, listMaterials } from "@/lib/domain/factory";
import { getAccess } from "../../access";
import { OrderDetail } from "@/components/factory/OrderDetail";

export default async function FactoryOrderDetailPage({
  params,
}: {
  params: { businessId: string; orderId: string };
}) {
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

  const [fabricsRes, liningsRes, buttonsRes] = await Promise.all([
    listMaterials(access.businessId, "fabric"),
    listMaterials(access.businessId, "lining"),
    listMaterials(access.businessId, "button"),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] p-4 md:p-6">
      <OrderDetail
        businessId={access.businessId}
        order={result.data.order}
        processes={result.data.processes}
        fittingLogs={result.data.fittingLogs}
        canWrite={access.caps.includes("write")}
        canReadRevenue={access.caps.includes("revenue.read")}
        fabrics={fabricsRes.ok ? fabricsRes.data : []}
        linings={liningsRes.ok ? liningsRes.data : []}
        buttons={buttonsRes.ok ? buttonsRes.data : []}
      />
    </div>
  );
}
