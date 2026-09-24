/**
 * 주문·작업지시 목록. 금액/상태는 서버 조회값 그대로 표시(재계산 없음).
 */
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listFactoryOrders, type FactoryOrderStatus, type FactoryOrderType } from "@/lib/domain/factory";
import { todayKeyInTz } from "@/lib/utils/datetime";
import { getAccess } from "../access";
import { OrderList } from "@/components/factory/OrderList";

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { status?: string; type?: string; q?: string; sort?: string; due?: string };
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

  if (access.industry !== "factory") {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <EmptyState title="이 업종에는 주문·작업지시 화면이 없습니다." />
        </Card>
      </div>
    );
  }

  const result = await listFactoryOrders(access.businessId, {
    status: searchParams.status ? [searchParams.status as FactoryOrderStatus] : undefined,
    type: searchParams.type ? [searchParams.type as FactoryOrderType] : undefined,
    q: searchParams.q,
    sort: searchParams.sort === "created_desc" ? "created_desc" : "due_asc",
    dueDate: searchParams.due,
  });

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
    <div className="mx-auto max-w-[1300px] p-4 md:p-6">
      <h1 className="mb-4 text-[18px] font-semibold text-t">주문·작업지시</h1>
      <OrderList
        businessId={access.businessId}
        orders={result.data}
        canWrite={access.caps.includes("write")}
        canReadRevenue={access.caps.includes("revenue.read")}
        todayKey={todayKeyInTz(access.timezone)}
      />
    </div>
  );
}
