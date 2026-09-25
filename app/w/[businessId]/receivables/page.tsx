/**
 * 미수금 보드(0027 §4) + 보관 보증금 현황(§3). 렌탈 전용 — revenue.read 없으면 화면 대신 권한 안내.
 * 연령 분석은 서버 RPC(rental_receivables) 한 번으로 받고, 화면은 구간 탭·고객별 묶기만 한다.
 */
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { getReceivables, getDepositsHeld } from "@/lib/domain/rental-money";
import { getAccess } from "../access";
import { ReceivablesBoard } from "@/components/rental/ReceivablesBoard";

export default async function ReceivablesPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "revenue.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <PageBody>
        <Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card>
      </PageBody>
    );
  }
  if (access.industry !== "rental") {
    return (
      <PageBody>
        <PageHeader title="미수금" />
        <Card><EmptyState title="이 화면은 의류렌탈 업종 전용입니다." description="다른 업종의 수납·미납은 각 업종 화면에서 관리합니다." /></Card>
      </PageBody>
    );
  }

  const [recRes, depRes] = await Promise.all([getReceivables(access.businessId), getDepositsHeld(access.businessId)]);
  if (!recRes.ok || !depRes.ok) {
    return (
      <PageBody>
        <PageHeader title="미수금" />
        <Card>
          <ErrorState title="미수금 현황을 불러오지 못했습니다." description={!recRes.ok ? recRes.message : !depRes.ok ? depRes.message : ""} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }
  if ("masked" in recRes.data || "masked" in depRes.data) {
    return (
      <PageBody>
        <PageHeader title="미수금" />
        <Card><ForbiddenState title="매출·정산 조회 권한이 필요합니다." description="미수금과 보관 보증금은 revenue.read 권한이 있는 계정만 볼 수 있습니다. 사업장 관리자에게 요청하세요." /></Card>
      </PageBody>
    );
  }

  return (
    <PageBody wide>
      <ReceivablesBoard
        businessId={access.businessId}
        businessName={access.businessName}
        tz={access.timezone}
        report={recRes.data}
        deposits={depRes.data}
        canWrite={access.caps.includes("write")}
        canRefund={access.caps.includes("refund")}
        isOwner={access.role === "owner"}
      />
    </PageBody>
  );
}
