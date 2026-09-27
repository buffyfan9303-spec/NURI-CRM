import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { EmptyState } from "@/components/ui/EmptyState";
import { getFactoryOrder, listMaterials } from "@/lib/domain/factory";
import { listAssignableMembers } from "@/lib/domain/calendar";
import { getAccess } from "../../access";
import { OrderDetail } from "@/components/factory/OrderDetail";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // F12: uuid 가 아닌 경로면 DB 에 묻지 않는다 — "invalid input syntax for type uuid" 원문이 화면에 그대로 나왔다.
  if (!UUID_RE.test(params.orderId)) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <EmptyState title="주문을 찾을 수 없습니다." description="주소가 잘못됐거나 삭제된 주문입니다. 주문 목록에서 다시 선택하세요." />
        </Card>
      </div>
    );
  }

  const result = await getFactoryOrder(access.businessId, params.orderId);
  if (!result.ok) {
    const notFound = result.message.includes("찾을 수 없");
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          {notFound ? (
            <EmptyState title="주문을 찾을 수 없습니다." description="삭제됐거나 다른 사업장의 주문입니다. 주문 목록에서 다시 선택하세요." />
          ) : (
            <ErrorState title="주문을 불러오지 못했습니다." description="잠시 후 다시 시도하세요. 계속되면 관리자에게 문의하세요." />
          )}
        </Card>
      </div>
    );
  }

  const [fabricsRes, liningsRes, buttonsRes, membersRes] = await Promise.all([
    listMaterials(access.businessId, "fabric"),
    listMaterials(access.businessId, "lining"),
    listMaterials(access.businessId, "button"),
    listAssignableMembers(access.businessId),
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
        members={membersRes.ok ? membersRes.members : []}
      />
    </div>
  );
}
