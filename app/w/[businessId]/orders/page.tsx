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

  // F12: 검색어 정규화 — PostgREST or() 필터에서 특수문자로 해석되는 , ( ) " 와 제어문자를 걷어내고 길이를 제한한다.
  // (고객 이름·주문번호에는 이 문자가 들어가지 않는다.) 정규화 후 빈 문자열이면 검색 없음.
  const q = (searchParams.q ?? "").replace(/[,()"\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || undefined;
  const STATUSES: FactoryOrderStatus[] = ["접수", "진행중", "완료", "취소"];
  const TYPES: FactoryOrderType[] = ["suit", "shirt", "shoe"];
  const status = STATUSES.find((s) => s === searchParams.status);
  const type = TYPES.find((t) => t === searchParams.type);
  const due = searchParams.due && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.due) ? searchParams.due : undefined;

  const result = await listFactoryOrders(access.businessId, {
    status: status ? [status] : undefined,
    type: type ? [type] : undefined,
    q,
    sort: searchParams.sort === "created_desc" ? "created_desc" : "due_asc",
    dueDate: due,
  });

  if (!result.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="주문 목록을 불러오지 못했습니다." description="잠시 후 다시 시도하세요. 검색어를 바꿔도 계속되면 관리자에게 문의하세요." />
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
