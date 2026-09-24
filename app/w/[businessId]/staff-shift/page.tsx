/**
 * "staff-shift" 경로도 업종에 따라 다르다(config.ts 나비게이션 공유):
 *   - 미용실: 근무표(예약 가능시간, staff.manage) + 본인/전체 출퇴근(attendance.*)
 *   - 학원: 강사 근태(attendance.*)만 — 학생 출결(app/w/[businessId]/attendance)과는 별개 화면.
 * 공장은 사용자 필수 요구로 이 화면 자체가 없어야 한다 — industry로 명시적으로 막는다.
 */
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { getServerSupabase } from "@/lib/supabase/server";
import { listStaffProfiles, listSchedules, listTimeOff } from "@/lib/domain/salon";
import { listStaff } from "@/lib/domain/staff";
import { listMyAttendance, listAllAttendance } from "@/lib/domain/attendance";
import { getAccess } from "../access";
import { ScheduleEditor } from "@/components/salon/ScheduleEditor";
import { AttendanceBoard } from "@/components/attendance/AttendanceBoard";

export default async function StaffShiftPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  // 공장에는 근태 메뉴·화면 자체가 없어야 한다(사용자 필수 요구) — industry는 권한 근거는 아니지만
  // "어떤 화면을 보여줄지"는 결정할 수 있다(계약 §1 취지: 업종은 화면 세트를 정한다).
  if (access.industry === "factory") {
    return (
      <PageBody>
        <Card>
          <ForbiddenState title="이 업종에는 근태 화면이 없습니다." description="공장 사업장은 공정 작업시간과 근태를 구분해 관리하며, 근태 메뉴 자체를 제공하지 않습니다." />
        </Card>
      </PageBody>
    );
  }

  const sb = getServerSupabase();
  const { data: biz } = await sb.schema("crm").from("businesses").select("attendance_enabled").eq("id", access.businessId).maybeSingle();
  const attendanceEnabled = biz?.attendance_enabled === true;

  const canSelf = access.caps.includes("attendance.self");
  const canAll = access.caps.includes("attendance.all");
  const canManageSchedule = access.industry === "salon" && access.caps.includes("staff.manage");

  const [myAttendance, allAttendance] = await Promise.all([
    canSelf ? listMyAttendance(access.businessId) : Promise.resolve({ ok: true as const, data: [] }),
    canAll ? listAllAttendance(access.businessId) : Promise.resolve({ ok: true as const, data: [] }),
  ]);

  let scheduleSection = null;
  if (access.industry === "salon") {
    const [profiles, schedules, timeOff, staffList] = await Promise.all([
      listStaffProfiles(access.businessId),
      listSchedules(access.businessId),
      listTimeOff(access.businessId),
      canManageSchedule ? listStaff(access.businessId) : Promise.resolve({ ok: true as const, memberships: [], roleTemplates: [] }),
    ]);
    scheduleSection = (
      <section aria-labelledby="schedule-h" className="mb-6">
        <h2 id="schedule-h" className="mb-3 text-[var(--fs-card)] font-semibold text-t">근무표(예약 가능시간)</h2>
        <ScheduleEditor
          businessId={access.businessId}
          canManage={canManageSchedule}
          memberships={(staffList.ok && "memberships" in staffList ? staffList.memberships : []).map((m) => ({ id: m.id, userId: m.userId }))}
          profiles={profiles.ok ? profiles.data : []}
          schedules={schedules.ok ? schedules.data : []}
          timeOff={timeOff.ok ? timeOff.data : []}
        />
      </section>
    );
  }

  const isSalon = access.industry === "salon";
  return (
    <PageBody>
      <PageHeader
        title={isSalon ? "근무표·출퇴근" : "강사 근태"}
        description={isSalon ? "예약을 받을 근무시간(계획)과 실제 출퇴근 기록(사실)을 따로 관리합니다." : "강사 출퇴근 기록. 학생 출결은 '학생 출결' 화면에서 처리합니다."}
      />
      {scheduleSection}
      <section aria-labelledby="attendance-h">
        {isSalon && <h2 id="attendance-h" className="mb-3 text-[var(--fs-card)] font-semibold text-t">출퇴근</h2>}
        {!attendanceEnabled ? (
          <Card>
            <ErrorState title="근태 기능이 꺼져 있습니다." description="이 사업장은 근태 기능을 사용하지 않도록 설정되어 있습니다. 관리자에게 활성화를 요청하세요." />
          </Card>
        ) : (
          <AttendanceBoard
            businessId={access.businessId}
            canSelf={canSelf}
            canAll={canAll}
            currentUserId={access.userId}
            myRecords={myAttendance.ok ? myAttendance.data : []}
            allRecords={allAttendance.ok ? allAttendance.data : []}
          />
        )}
      </section>
    </PageBody>
  );
}
