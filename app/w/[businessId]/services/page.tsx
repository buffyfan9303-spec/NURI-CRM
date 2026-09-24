import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { listServices, listStaffProfiles, listResources, listAppointments, countNoShowsByCustomer } from "@/lib/domain/salon";
import { listCustomers } from "@/lib/domain/rental";
import { todayKeyInTz } from "@/lib/utils/datetime";
import { getAccess } from "../access";
import { ServicesBoard } from "@/components/salon/ServicesBoard";
import { BookingBoard } from "@/components/salon/BookingBoard";

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { date?: string };
}) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "salon") {
    return (
      <PageBody>
        <PageHeader title="예약·시술" />
        <Card><EmptyState title="이 업종에는 시술·가격 화면이 없습니다." /></Card>
      </PageBody>
    );
  }

  const todayOnly = searchParams.date === "today";
  const [services, staff, resources, customers, appointments] = await Promise.all([
    listServices(access.businessId),
    listStaffProfiles(access.businessId),
    listResources(access.businessId),
    listCustomers(access.businessId),
    // 홈 "오늘 예약" 지표에서 넘어오면 오늘 하루로 좁힌다. 그 외엔 기존처럼 전체(최근 100건).
    listAppointments(access.businessId, todayOnly ? todayKeyInTz(access.timezone) : undefined),
  ]);
  for (const r of [services, staff, resources, customers, appointments]) {
    if (!r.ok) {
      return (
        <PageBody>
          <PageHeader title="예약·시술" />
          <Card><ErrorState title="불러오지 못했습니다." description={r.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card>
        </PageBody>
      );
    }
  }

  const canWrite = access.caps.includes("write");
  // 예약 금액(price 스냅샷)은 revenue.read 없는 사용자에게 내려보내지 않는다(CLICK-PATH-203, 렌탈 목록과 같은 기준).
  const canRevenue = access.caps.includes("revenue.read");
  const appointmentRows = appointments.ok ? appointments.data : [];
  const maskedAppointments = canRevenue ? appointmentRows : appointmentRows.map((a) => ({ ...a, price: 0 }));

  // S4: 고객별 노쇼 이력 — 서버 집계 countNoShowsByCustomer(전체 이력, listAppointments의 100건 제한과 무관)로 교체.
  const noShowRes = await countNoShowsByCustomer(access.businessId);
  const noShowByCustomer = noShowRes.ok ? noShowRes.data : {};
  return (
    <PageBody>
      <BookingBoard
        businessId={access.businessId}
        canWrite={canWrite}
        canRecordPayment={canWrite && canRevenue}
        canRevenue={canRevenue}
        services={services.ok ? services.data : []}
        staff={staff.ok ? staff.data : []}
        resources={resources.ok ? resources.data : []}
        customers={(customers.ok ? customers.data : []).map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null }))}
        appointments={maskedAppointments}
        noShowByCustomer={noShowByCustomer}
        businessName={access.businessName}
        todayOnly={todayOnly}
      />
      <ServicesBoard businessId={access.businessId} canWrite={canWrite} services={services.ok ? services.data : []} />
    </PageBody>
  );
}
