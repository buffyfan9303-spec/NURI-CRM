/**
 * 고객 상세. crm.customers는 렌탈·미용실·공장이 공유하므로 업종별로 붙는 이력만 분기한다
 * (렌탈=예약 이력, 미용실=시술·수납 이력, 공장=주문 이력) — 새 라우트를 또 만들지 않는다.
 * "고객 신체 치수" 섹션은 pii.read가 있을 때만 렌더하고, 없으면 조회 자체를 하지 않는다
 * (계약 §5-2: 권한 없는 데이터는 네트워크로도 내려보내지 않는다).
 * 개체 실측(rental_units.measurements)과는 다른 화면·다른 테이블 — 여기서 섞지 않는다.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { getCustomer, listCustomerMeasurements, listReservations, getReservationBalance } from "@/lib/domain/rental";
import { getCustomerMoneySummary } from "@/lib/domain/rental-money";
import type { ReservationRow } from "@/lib/domain/rental-types";
import { listAppointmentsForCustomer, getAppointmentBalance, listStaffProfiles, listResources, listTreatmentHistory } from "@/lib/domain/salon";
import type { SalonAppointment } from "@/lib/domain/salon";
import { listFactoryOrders } from "@/lib/domain/factory";
import { formatKRW } from "@/lib/domain/money";
import { getAccess } from "../../access";
import { CustomerDetail, type ReservationHistoryRow } from "@/components/rental/CustomerDetail";
import { SalonCustomerDetail, type SalonApptHistoryRow } from "@/components/salon/CustomerDetail";

const FACTORY_TYPE_LABEL: Record<string, string> = { suit: "정장", shirt: "셔츠", shoe: "구두" };

/** 예약번호 대체 표시 — ReservationList.tsx의 reservationNo()와 같은 규칙(별도 채번 컬럼 없음). */
function reservationNo(id: string): string {
  return `R-${id.slice(0, 8).toUpperCase()}`;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: { businessId: string; id: string };
}) {
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

  const canReadPii = access.caps.includes("pii.read");
  const custResult = await getCustomer(access.businessId, params.id, canReadPii);
  if (!custResult.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="고객을 불러오지 못했습니다." description={custResult.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  // pii.read 없으면 이 쿼리 자체를 하지 않는다 — "일단 물어보고 서버가 막는다"가 아니라
  // 애초에 요청하지 않는다.
  const measurements = canReadPii ? await listCustomerMeasurements(access.businessId, params.id) : null;
  const canRevenue = access.caps.includes("revenue.read");
  const canWrite = access.caps.includes("write");

  // 결함 CLICK-PATH-115: 공장 고객 상세는 렌탈 예약 이력만 조회해 항상 빈 화면이었다.
  // customers 테이블은 렌탈·공장이 공유하므로 여기서 실제 주문 이력을 붙인다(§9의
  // settlement/page.tsx 업종 분기와 같은 계약).
  if (access.industry === "factory") {
    const ordersRes = await listFactoryOrders(access.businessId, { customerId: params.id, sort: "created_desc" });
    if (!ordersRes.ok) {
      return (
        <div className="p-4 md:p-6">
          <Card className="px-2 py-2">
            <ErrorState title="주문 이력을 불러오지 못했습니다." description={ordersRes.message} />
          </Card>
        </div>
      );
    }
    return (
      <PageBody>
        <CustomerDetail
          businessId={access.businessId}
          customer={custResult.data}
          canReadPii={canReadPii}
          canWrite={canWrite}
          measurements={measurements && measurements.ok ? measurements.data : []}
          measurementsError={measurements && !measurements.ok ? measurements.message : null}
          reservationHistory={[]}
          money={null}
        />
        <Card className="mt-4 p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-t">주문 이력</h2>
          {ordersRes.data.length === 0 ? (
            <EmptyState title="주문 이력이 없습니다." />
          ) : (
            <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--bd)]">
              <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--bd)] bg-sf2 text-left text-t2">
                    <th className="px-2.5 py-2 font-medium">주문번호</th>
                    <th className="px-2.5 py-2 font-medium">종류</th>
                    <th className="px-2.5 py-2 font-medium">상태</th>
                    <th className="px-2.5 py-2 font-medium">가봉일</th>
                    <th className="px-2.5 py-2 font-medium">납기</th>
                    {canRevenue && <th className="px-2.5 py-2 font-medium">금액</th>}
                  </tr>
                </thead>
                <tbody>
                  {ordersRes.data.map((o) => (
                    <tr key={o.id} className="border-b border-[var(--bd)] last:border-b-0">
                      <td className="px-2.5 py-2">
                        <Link href={`/w/${access.businessId}/orders/${o.id}`} className="font-medium text-[var(--accent-ink)] hover:underline">
                          {o.orderNo}
                        </Link>
                      </td>
                      <td className="px-2.5 py-2 text-t2">{FACTORY_TYPE_LABEL[o.type] ?? o.type}</td>
                      <td className="px-2.5 py-2 text-t2">{o.status}</td>
                      <td className="px-2.5 py-2 text-t2">{o.fittingDate ?? "-"}</td>
                      <td className="px-2.5 py-2 text-t2">{o.dueDate ?? "-"}</td>
                      {canRevenue && <td className="px-2.5 py-2 text-t2">{formatKRW(o.total)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageBody>
    );
  }

  if (access.industry === "salon") {
    const [apptRes, staffRes, resourceRes, treatmentRes] = await Promise.all([
      listAppointmentsForCustomer(access.businessId, params.id),
      listStaffProfiles(access.businessId),
      listResources(access.businessId),
      listTreatmentHistory(access.businessId, { customerId: params.id }),
    ]);
    if (!apptRes.ok) {
      return (
        <div className="p-4 md:p-6">
          <Card className="px-2 py-2">
            <ErrorState title="시술 이력을 불러오지 못했습니다." description={apptRes.message} />
          </Card>
        </div>
      );
    }
    const staffNameById = new Map((staffRes.ok ? staffRes.data : []).map((s) => [s.membershipId, s.displayName]));
    const resourceNameById = new Map((resourceRes.ok ? resourceRes.data : []).map((r) => [r.id, r.name]));

    // 완료된 예약만 잔액을 확인한다(N+1이지만 고객 1명 범위라 건수가 작다 — getSalonToday와 같은 관례).
    // revenue.read 없으면 애초에 요청하지 않는다.
    const balanceByAppt = new Map<string, { paid: number; outstanding: number }>();
    if (canRevenue) {
      const completed = apptRes.data.filter((a: SalonAppointment) => a.status === "완료");
      const balances = await Promise.all(completed.map((a) => getAppointmentBalance(a.id)));
      completed.forEach((a, i) => {
        const b = balances[i];
        if (b.ok && b.data) balanceByAppt.set(a.id, { paid: b.data.paid, outstanding: b.data.outstanding });
      });
    }

    const apptHistory: SalonApptHistoryRow[] = apptRes.data.map((a: SalonAppointment) => ({
      id: a.id,
      startAt: a.startAt,
      serviceName: a.serviceName,
      staffName: staffNameById.get(a.staffId) ?? a.staffId.slice(0, 8),
      resourceName: a.resourceId ? (resourceNameById.get(a.resourceId) ?? a.resourceId.slice(0, 8)) : null,
      status: a.status,
      amount: canRevenue ? a.price : null,
      outstanding: canRevenue ? (balanceByAppt.get(a.id)?.outstanding ?? null) : null,
    }));

    // 미용실 분기만 2단계 디자인(PageBody). 제목·CTA 는 SalonCustomerDetail 의 PageHeader 가 그린다.
    return (
      <PageBody>
        <SalonCustomerDetail
          businessId={access.businessId}
          customer={custResult.data}
          canReadPii={canReadPii}
          canWrite={canWrite}
          canRevenue={canRevenue}
          measurements={measurements && measurements.ok ? measurements.data : []}
          measurementsError={measurements && !measurements.ok ? measurements.message : null}
          appointments={apptHistory}
          treatmentHistory={treatmentRes.ok ? treatmentRes.data : []}
        />
      </PageBody>
    );
  }

  // 결함 D7: 고객 상세에 예약 이력을 연결한다. confirmed=customer_ref가 이 고객으로 확정된
  // 예약. guessed=customer_ref가 비어있는 레거시 예약 중 이름이 정확히 일치하는 것만
  // "추정 연결"로 같이 보여준다(전화번호는 pii.read 없으면 안 보여서 이름만으로 판단).
  const [confirmedRes, nameMatchRes, moneyRes] = await Promise.all([
    listReservations(access.businessId, { customerRef: params.id }),
    listReservations(access.businessId, { customer: custResult.data.name }),
    // 0027: 고객별 미수·보관 보증금 요약(회원이면 호출, revenue.read 없으면 여부만). 구 DB 에서는 실패 → null.
    getCustomerMoneySummary(params.id),
  ]);

  // 예약별 잔액 — revenue.read 있을 때만, 고객 1명 범위라 건수가 작다(미용실 분기와 같은 관례).
  const balanceById = new Map<string, { outstanding: number; depositBalance: number }>();
  if (canRevenue) {
    const all = [...(confirmedRes.ok ? confirmedRes.data : []), ...(nameMatchRes.ok ? nameMatchRes.data : [])];
    const uniq = [...new Map(all.map((r) => [r.id, r])).values()].filter((r) => r.status !== "draft");
    const bals = await Promise.all(uniq.map((r) => getReservationBalance(r.id)));
    uniq.forEach((r, i) => { const b = bals[i]; if (b.ok && !("masked" in b.data)) balanceById.set(r.id, { outstanding: b.data.outstanding, depositBalance: b.data.depositBalance }); });
  }

  function toHistoryRow(r: ReservationRow, linkKind: "confirmed" | "guessed"): ReservationHistoryRow {
    const b = balanceById.get(r.id);
    return {
      id: r.id,
      reservationNo: reservationNo(r.id),
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      status: r.status,
      amount: canRevenue ? r.items.reduce((sum, i) => sum + i.fee - i.discount, 0) : null,
      outstanding: canRevenue && b ? b.outstanding : null,
      depositBalance: canRevenue && b ? b.depositBalance : null,
      linkKind,
    };
  }

  const confirmed = confirmedRes.ok ? confirmedRes.data.map((r) => toHistoryRow(r, "confirmed")) : [];
  const confirmedIds = new Set(confirmed.map((r) => r.id));
  const guessed = nameMatchRes.ok
    ? nameMatchRes.data
        .filter((r) => !r.customerRef && r.customerName === custResult.data.name && !confirmedIds.has(r.id))
        .map((r) => toHistoryRow(r, "guessed"))
    : [];
  const reservationHistory = [...confirmed, ...guessed].sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  return (
    <PageBody>
      <CustomerDetail
        businessId={access.businessId}
        customer={custResult.data}
        canReadPii={canReadPii}
        canWrite={canWrite}
        measurements={measurements && measurements.ok ? measurements.data : []}
        measurementsError={measurements && !measurements.ok ? measurements.message : null}
        reservationHistory={reservationHistory}
        money={moneyRes.ok ? moneyRes.data : null}
      />
    </PageBody>
  );
}
