/**
 * 입학 상담(0023). pii.read 없으면 listConsultations 자체를 호출하지 않는다(계약 §5-2).
 */
import { Card } from "@/components/ui/Card";
import { PageHeader, PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listConsultations } from "@/lib/domain/academy";
import { getAccess } from "../access";
import { ConsultationsBoard } from "@/components/academy/ConsultationsBoard";

export default async function ConsultationsPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <PageBody>
        <Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card>
      </PageBody>
    );
  }

  if (access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="입학 상담" />
        <Card><EmptyState title="이 업종에는 입학 상담 화면이 없습니다." /></Card>
      </PageBody>
    );
  }

  const canReadPii = access.caps.includes("pii.read");
  const canWrite = access.caps.includes("write");
  const consultRes = canReadPii ? await listConsultations(access.businessId) : null;
  if (consultRes && !consultRes.ok) {
    return (
      <PageBody>
        <PageHeader title="입학 상담" />
        <Card><ErrorState title="상담 목록을 불러오지 못했습니다." description={consultRes.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card>
      </PageBody>
    );
  }

  return (
    <PageBody>
      {/* 제목·CTA·상태 탭은 ConsultationsBoard 의 PageHeader 가 그린다(새 상담 버튼이 클라이언트 상태를 열기 때문). */}
      <ConsultationsBoard businessId={access.businessId} canWrite={canWrite} canReadPii={canReadPii} consultations={consultRes?.ok ? consultRes.data : []} />
    </PageBody>
  );
}
