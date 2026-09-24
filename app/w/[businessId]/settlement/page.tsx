/**
 * 정산. revenue.read 없으면 화면 자체가 막힌다(계약 §5, 지시사항).
 * 보증금을 대여 매출에 합산해 보여주는 화면을 만들지 않는다 — SettlementPanel이 항목을 분리한다.
 *
 * 결함 #1 수정: 이 라우트는 "업종 공용 경로"인데 업종 분기 없이 항상 렌탈 데이터 모델
 * (rental_reservations)만 조회했다 — 미용실 등 다른 업종에서는 늘 빈 화면이었다.
 * 업종별로 실제 데이터 모델을 조회하도록 분기한다. 이미 전용 화면(tuition/sales)이
 * 있는 업종은 안내와 링크만 보여준다(빈 화면 금지).
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage, type AccessFail } from "@/lib/auth/access";
import { listReservations, getReservationBalance } from "@/lib/domain/rental";
import { listSettlementAppointments, getAppointmentBalance } from "@/lib/domain/salon";
import { getAccess } from "../access";
import { SettlementList } from "@/components/rental/SettlementList";
import { SalonSettlementBoard } from "@/components/salon/SettlementBoard";

function Fail({ access }: { access: Exclude<AccessFail, { reason: "unauthenticated" }> }) {
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

/** 정산 개념이 다른 화면에 이미 있는 업종(academy/unmanned) + 아직 별도 수납 모델이 없는 업종(factory) 용 안내. */
function GuideToOtherScreen({ title, description, href, linkLabel }: { title: string; description: string; href: string; linkLabel: string }) {
  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <h1 className="mb-4 text-[18px] font-semibold text-t">정산</h1>
      <Card className="px-2 py-2">
        <EmptyState title={title} description={description} />
        <div className="px-4 pb-4">
          <Link href={href} className="text-[12.5px] font-medium text-[var(--accent)] underline underline-offset-2">
            {linkLabel} →
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default async function SettlementPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "revenue.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    return <Fail access={access} />;
  }

  if (access.industry === "academy") {
    return (
      <GuideToOtherScreen
        title="학원 수강료·미납은 여기가 아니라 '수강료·미납' 화면에서 관리합니다."
        description="청구·부분납·잔액은 반·수강등록 단위로 계산되어 별도 화면에 있습니다."
        href={`/w/${access.businessId}/tuition`}
        linkLabel="수강료·미납으로 이동"
      />
    );
  }
  if (access.industry === "unmanned") {
    return (
      <GuideToOtherScreen
        title="무인매장 매출은 여기가 아니라 '매출 기록' 화면에서 관리합니다."
        description="CSV로 가져온 판매 기록과 대사·확정 상태가 그 화면에 있습니다."
        href={`/w/${access.businessId}/sales`}
        linkLabel="매출 기록으로 이동"
      />
    );
  }
  if (access.industry === "factory") {
    return (
      <GuideToOtherScreen
        title="공장은 주문별 공급가·부가세가 주문 상세에 이미 표시됩니다."
        description="수납·미수 잔액을 별도로 추적하는 기능은 아직 없습니다(주문 금액 확인만 가능). 필요하면 사업장 관리자에게 기능 추가를 요청하세요."
        href={`/w/${access.businessId}/orders`}
        linkLabel="주문·작업지시로 이동"
      />
    );
  }

  if (access.industry === "salon") {
    const result = await listSettlementAppointments(access.businessId);
    if (!result.ok) {
      return (
        <PageBody>
          <PageHeader title="수납·정산" />
          <Card>
            <ErrorState title="정산 대상 예약을 불러오지 못했습니다." description={result.message} />
            <div className="flex justify-center pb-6"><RetryButton /></div>
          </Card>
        </PageBody>
      );
    }
    const balances = await Promise.all(result.data.map((a) => getAppointmentBalance(a.id)));
    return (
      <PageBody wide>
        <SalonSettlementBoard
          businessId={access.businessId}
          appointments={result.data}
          balances={balances.map((b) => (b.ok ? b.data : null))}
          canWrite={access.caps.includes("write")}
        />
      </PageBody>
    );
  }

  // rental (기본 · 기존 동작 그대로 보존)
  const result = await listReservations(access.businessId, {
    status: ["confirmed", "out", "partial_return", "returned", "closed"],
  });
  if (!result.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="정산 대상 예약을 불러오지 못했습니다." description={result.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  if (result.data.length === 0) {
    return (
      <PageBody>
        <PageHeader title="정산" description="확정·출고·반납된 예약의 대여매출·연체료·보증금·수납을 항목별로 분리해 보여줍니다." />
        <Card>
          <EmptyState title="정산 대상 예약이 없습니다." description="예약이 확정·출고되면 여기 표시됩니다." />
        </Card>
      </PageBody>
    );
  }

  const balances = await Promise.all(result.data.map((r) => getReservationBalance(r.id)));

  return (
    <PageBody wide>
      <SettlementList
        businessId={access.businessId}
        reservations={result.data}
        balances={balances.map((b) => (b.ok ? b.data : null))}
        canWrite={access.caps.includes("write")}
        canRefund={access.caps.includes("refund")}
        canExport={access.caps.includes("export")}
      />
    </PageBody>
  );
}
