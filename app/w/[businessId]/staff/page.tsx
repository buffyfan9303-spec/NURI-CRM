/**
 * 직원·권한 관리. staff.manage 없으면 ForbiddenState(계약 §5, 서버 강제 실증).
 */
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage, CAP_LABEL } from "@/lib/auth/access";
import { listStaff } from "@/lib/domain/staff";
import { getAccess } from "../access";
import { StaffTable } from "./StaffTable";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function StaffPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "staff.manage");

  if (!access.ok) {
    if (access.reason === "unauthenticated") {
      // layout이 이미 리다이렉트했어야 한다 — 여기 도달하면 방어적으로만 처리.
      return null;
    }
    const msg = accessMessage(access);
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ForbiddenState title={msg.title} description={msg.detail} />
        </Card>
      </div>
    );
  }

  const staff = await listStaff(access.businessId);
  if (!staff.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="직원 목록을 불러오지 못했습니다." description={staff.message} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6">
      {/* C6: 개발자 문구(Supabase Auth·user_id) 대신 사용자에게 필요한 한 줄만. */}
      <PageHeader title="직원·권한 관리" description="역할·권한 변경은 즉시 저장됩니다." />
      <StaffTable
        businessId={access.businessId}
        currentUserId={access.userId}
        memberships={staff.memberships}
        roleTemplates={staff.roleTemplates}
        capLabels={CAP_LABEL}
        industry={access.industry}
      />
    </div>
  );
}
