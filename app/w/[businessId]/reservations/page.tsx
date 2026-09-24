/**
 * 예약 목록. 가용성·확정은 항상 서버(RPC/제약)가 재검사한다 — 여기서는 조회만.
 */
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { accessMessage } from "@/lib/auth/access";
import { listReservations } from "@/lib/domain/rental";
import { getAccess } from "../access";
import { ReservationList } from "@/components/rental/ReservationList";
import { RetryButton } from "@/components/rental/listkit";

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: {
    status?: string;
    q?: string;
    quick?: string;
    productId?: string;
    returnFrom?: string;
    returnTo?: string;
    fittingFrom?: string;
    fittingTo?: string;
  };
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

  if (access.industry !== "rental") {
    return (
      <PageBody>
        <Card>
          <EmptyState title="이 업종에는 예약 화면이 없습니다." />
        </Card>
      </PageBody>
    );
  }

  let from: string | undefined;
  let to: string | undefined;
  const now = new Date();
  if (searchParams.quick === "today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    from = start.toISOString(); to = end.toISOString();
  } else if (searchParams.quick === "week") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    from = start.toISOString(); to = end.toISOString();
  }

  // 상태 탭의 건수는 이 화면에서 선택한 기간·검색어 기준으로 세되 상태로는 거르지 않은 결과가
  // 필요하다 — 상태별 카운트를 보여주려면 전체를 받아 클라이언트에서 상태만 나눠야 한다.
  const result = await listReservations(access.businessId, {
    customer: searchParams.q,
    from,
    to,
    productId: searchParams.productId,
    // 홈 지표(오늘 반납/피팅)에서 넘어온 정확한 tz 경계 — lib/domain/home.ts의 계산과 짝이다.
    returnFrom: searchParams.returnFrom,
    returnTo: searchParams.returnTo,
    fittingFrom: searchParams.fittingFrom,
    fittingTo: searchParams.fittingTo,
  });

  if (!result.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="예약 목록을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  // revenue.read 없는 사용자에게는 항목 금액을 아예 내려보내지 않는다(CSS 은닉 금지 — 하드룰).
  const canRevenue = access.caps.includes("revenue.read");
  const rows = canRevenue
    ? result.data
    : result.data.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i, fee: 0, discount: 0 })) }));

  return (
    <PageBody wide>
      <ReservationList
        businessId={access.businessId}
        reservations={rows}
        canWrite={access.caps.includes("write")}
        canRevenue={canRevenue}
      />
    </PageBody>
  );
}
