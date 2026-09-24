/**
 * 세탁·수선. 정비 중(care/repair/inspect) 개체는 예약에 배정할 수 없다는 것을
 * 카탈로그·예약 화면에서 확인할 수 있다 — 여기서는 등록/완료만 담당한다.
 */
import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { accessMessage } from "@/lib/auth/access";
import { listCareJobs, listUnitsForPicker, listUpcomingReservationUnitIds, type CareJobRow } from "@/lib/domain/rental";
import { getAccess } from "../access";
import { CareBoard } from "@/components/rental/CareBoard";

export default async function CarePage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { unit?: string; status?: string };
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
          <EmptyState title="이 업종에는 세탁·수선 화면이 없습니다." />
        </Card>
      </PageBody>
    );
  }

  const ALL_CARE_STATUS: CareJobRow["status"][] = ["open", "doing", "done", "cancelled"];
  const statusFilter = searchParams.status
    ? searchParams.status.split(",").filter((s): s is CareJobRow["status"] => (ALL_CARE_STATUS as string[]).includes(s))
    : undefined;

  const [jobsResult, unitsResult] = await Promise.all([
    listCareJobs(access.businessId, statusFilter),
    listUnitsForPicker(access.businessId),
  ]);
  if (!jobsResult.ok) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="정비 작업을 불러오지 못했습니다." description={jobsResult.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }

  const upcomingResult = await listUpcomingReservationUnitIds(
    access.businessId,
    jobsResult.data.filter((j) => j.status === "open" || j.status === "doing").map((j) => j.unitId)
  );

  return (
    <PageBody>
      <CareBoard
        businessId={access.businessId}
        jobs={jobsResult.data}
        units={unitsResult.ok ? unitsResult.data : []}
        canWrite={access.caps.includes("write")}
        preselectUnit={searchParams.unit}
        upcomingUnitIds={upcomingResult.ok ? Array.from(upcomingResult.data) : []}
      />
    </PageBody>
  );
}
