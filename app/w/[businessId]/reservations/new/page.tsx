import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { RetryButton, BackLink } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { listProducts, listCustomers } from "@/lib/domain/rental";
import { getAccess } from "../../access";
import { ReservationForm } from "@/components/rental/ReservationForm";

export default async function NewReservationPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { customerId?: string };
}) {
  const access = await getAccess(params.businessId, "write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    if (access.reason === "not-member") redirect("/select");
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

  const [productsRes, customersRes] = await Promise.all([
    listProducts(access.businessId),
    listCustomers(access.businessId),
  ]);
  if (!productsRes.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="상품 목록을 불러오지 못했습니다." description={productsRes.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  // 결함 D7 §3: 고객 상세에서 "새 예약"으로 오면 그 고객이 미리 선택되게 한다. create_reservation
  // RPC가 customer_ref 파라미터를 받지 않아(0003_rental.sql, 스키마 담당 소관) 이름/전화 스냅샷만
  // 선입력한다 — 실제 customer_ref 연결까지 하려면 RPC 시그니처 변경이 필요하다(미해결 사항 참고).
  const preselectedCustomer = searchParams.customerId
    ? customersRes.ok
      ? customersRes.data.find((c) => c.id === searchParams.customerId)
      : undefined
    : undefined;

  return (
    <PageBody>
      <BackLink href={`/w/${access.businessId}/reservations`}>예약 목록</BackLink>
      <PageHeader
        title="새 예약"
        description="고객·기간·품목을 입력해 임시저장(draft)합니다. 개체 가용성과 금액의 최종 판정은 확정 시 서버가 다시 합니다."
      />
      <ReservationForm
        businessId={access.businessId}
        products={productsRes.data}
        customers={customersRes.ok ? customersRes.data : []}
        initialCustomerName={preselectedCustomer?.name}
        initialCustomerPhone={preselectedCustomer?.phone}
      />
    </PageBody>
  );
}
