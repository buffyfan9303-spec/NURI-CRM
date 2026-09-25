import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { getReservation, getReservationBalance, listDamageClaims, listSettlementHistory } from "@/lib/domain/rental";
import { getCancelPolicy } from "@/lib/domain/rental-money";
import { getAccess } from "../../access";
import { ReservationDetail } from "@/components/rental/ReservationDetail";

export default async function ReservationDetailPage({
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

  const canRevenueRead = access.caps.includes("revenue.read");
  const [resResult, balResult, claimsResult, historyResult] = await Promise.all([
    getReservation(access.businessId, params.id),
    getReservationBalance(params.id),
    listDamageClaims(access.businessId, params.id),
    // 원장(금액)은 revenue.read 없으면 애초에 조회하지 않는다.
    canRevenueRead ? listSettlementHistory(access.businessId, params.id) : Promise.resolve(null),
  ]);

  if (!resResult.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="예약을 불러오지 못했습니다." description={resResult.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  // revenue.read 없는 사용자에게는 항목 금액을 아예 내려보내지 않는다(목록과 같은 서버 마스킹, CLICK-PATH-203).
  const reservation = canRevenueRead
    ? resResult.data
    : { ...resResult.data, items: resResult.data.items.map((i) => ({ ...i, fee: 0, discount: 0 })) };

  // 취소 단계표는 확정 예약을 취소할 수 있는 사용자에게만 필요하다(다른 상태에서는 조회하지 않는다).
  const canWrite = access.caps.includes("write");
  const policyRes = canWrite && reservation.status === "confirmed" ? await getCancelPolicy(access.businessId) : null;

  return (
    <PageBody>
      <ReservationDetail
        businessId={access.businessId}
        businessName={access.businessName}
        tz={access.timezone}
        reservation={reservation}
        balance={balResult.ok ? balResult.data : null}
        claims={claimsResult.ok ? claimsResult.data.map((c) => (canRevenueRead ? c : { ...c, amount: null })) : []}
        history={historyResult && historyResult.ok ? historyResult.data : null}
        canWrite={canWrite}
        canRefund={access.caps.includes("refund")}
        canRevenueRead={canRevenueRead}
        role={access.role}
        cancelPolicy={policyRes && policyRes.ok ? policyRes.data : null}
      />
    </PageBody>
  );
}
