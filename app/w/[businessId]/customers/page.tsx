/**
 * 렌탈 고객. pii.read 없으면 연락처는 v_customers(전화/이메일 존재여부만)로 자동 폴백된다
 * (lib/domain/rental.ts listCustomers, 0006_customers.sql 게이팅 뷰).
 */
import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { listCustomers, listReservations } from "@/lib/domain/rental";
import { listFactoryOrders } from "@/lib/domain/factory";
import { getAccess } from "../access";
import { CustomerList, type CustomerActivity } from "@/components/rental/CustomerList";

export default async function CustomersPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <PageBody>
        <Card>
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </PageBody>
    );
  }

  // 결함 CLICK-PATH-115: 공장은 렌탈 예약이 아니라 주문으로 "최근/다음 방문·진행 업무"를
  // 계산해야 한다 — 그대로 두면 활동 요약이 항상 빈 값이었다.
  const isFactory = access.industry === "factory";
  const [result, reservationsResult, factoryOrdersResult] = await Promise.all([
    listCustomers(access.businessId),
    isFactory ? Promise.resolve({ ok: true as const, data: [] }) : listReservations(access.businessId, {}),
    isFactory ? listFactoryOrders(access.businessId, {}) : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  if (!result.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="고객 목록을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  // "최근/다음 방문 · 진행 업무" — 새 집계 뷰를 만들지 않고 기존 목록 조회 결과를 재사용해 묶는다.
  const activity: Record<string, CustomerActivity> = {};
  if (isFactory) {
    if (factoryOrdersResult.ok) {
      const now = Date.now();
      for (const o of factoryOrdersResult.data) {
        if (!o.customerId) continue;
        const a = (activity[o.customerId] ??= { lastVisit: null, nextVisit: null, openCount: 0 });
        if (o.status !== "완료" && o.status !== "취소") a.openCount += 1;
        if (o.deliveredDate && (!a.lastVisit || o.deliveredDate > a.lastVisit)) a.lastVisit = o.deliveredDate;
        if (
          o.dueDate &&
          (o.status === "접수" || o.status === "진행중") &&
          new Date(o.dueDate).getTime() >= now &&
          (!a.nextVisit || o.dueDate < a.nextVisit)
        ) {
          a.nextVisit = o.dueDate;
        }
      }
    }
  } else if (reservationsResult.ok) {
    const now = Date.now();
    // 금액은 쓰지 않는 집계이지만, 원본 items를 그대로 클라이언트로 넘기지 않으므로
    // (activity만 만들어 넘김) revenue.read 게이팅과 무관하게 안전하다.
    for (const r of reservationsResult.data) {
      if (!r.customerRef) continue;
      const a = (activity[r.customerRef] ??= { lastVisit: null, nextVisit: null, openCount: 0 });
      const endMs = new Date(r.periodEnd).getTime();
      const startMs = new Date(r.periodStart).getTime();
      if (r.status !== "cancelled" && r.status !== "closed") a.openCount += 1;
      if (endMs < now && (!a.lastVisit || endMs > new Date(a.lastVisit).getTime())) a.lastVisit = r.periodEnd;
      if (startMs >= now && (r.status === "draft" || r.status === "confirmed") && (!a.nextVisit || startMs < new Date(a.nextVisit).getTime())) {
        a.nextVisit = r.periodStart;
      }
    }
  }

  return (
    <PageBody>
      <CustomerList
        businessId={access.businessId}
        canWrite={access.caps.includes("write")}
        canReadPii={access.caps.includes("pii.read")}
        customers={result.data}
        activity={activity}
      />
    </PageBody>
  );
}
