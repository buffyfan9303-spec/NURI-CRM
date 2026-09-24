/**
 * 학생 상세. §5.7: 상세에서 연결할 핵심 동작 = 학생 상세, 새 수강 등록, 출결 기록, 허용된 수납.
 * pii.read 없으면 보호자 연락처 조회 자체를 하지 않는다(customers/[id]/page.tsx와 같은 규칙).
 * revenue.read 없으면 수강료·미납 조회 자체를 하지 않는다(tuition/page.tsx와 같은 게이팅).
 */
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import {
  getStudent,
  listGuardiansForStudent,
  listEnrollmentsForStudent,
  listAttendanceForStudent,
  listInvoiceBalances,
  listClasses,
} from "@/lib/domain/academy";
import { getAccess } from "../../access";
import { StudentDetail } from "@/components/academy/StudentDetail";

export default async function StudentDetailPage({
  params,
}: {
  params: { businessId: string; id: string };
}) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </div>
    );
  }

  const canReadPii = access.caps.includes("pii.read");
  const canRevenue = access.caps.includes("revenue.read");
  const canWrite = access.caps.includes("write");

  const studentRes = await getStudent(access.businessId, params.id, canReadPii);
  if (!studentRes.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="학생을 불러오지 못했습니다." description={studentRes.message} />
        </Card>
      </div>
    );
  }

  // pii.read 없으면 보호자 조회 자체를 하지 않는다(§3-7). revenue.read 없으면 청구서 조회 자체를 하지 않는다.
  const [guardiansRes, enrollmentsRes, attendanceRes, invoicesRes, classesRes] = await Promise.all([
    canReadPii ? listGuardiansForStudent(access.businessId, params.id) : Promise.resolve(null),
    listEnrollmentsForStudent(access.businessId, params.id),
    listAttendanceForStudent(access.businessId, params.id),
    canRevenue ? listInvoiceBalances(access.businessId) : Promise.resolve(null),
    // 반 목록 자체는 민감정보가 아니다(classes/page.tsx도 view만 요구) — write 없어도 "수강 등록"
    // 버튼을 disabled+사유로 보여주려면 옵션 목록이 필요하다(§5.8: 숨기지 않고 이유를 보여준다).
    listClasses(access.businessId),
  ]);

  if (!enrollmentsRes.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="수강 이력을 불러오지 못했습니다." description={enrollmentsRes.message} />
        </Card>
      </div>
    );
  }
  if (!attendanceRes.ok) {
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          <ErrorState title="출결 이력을 불러오지 못했습니다." description={attendanceRes.message} />
        </Card>
      </div>
    );
  }

  const enrollmentIds = new Set(enrollmentsRes.data.map((e) => e.id));
  const invoices =
    invoicesRes && invoicesRes.ok ? invoicesRes.data.filter((inv) => enrollmentIds.has(inv.enrollmentId)) : [];
  const invoicesError = invoicesRes && !invoicesRes.ok ? invoicesRes.message : null;

  return (
    <div className="mx-auto max-w-[900px] p-4 md:p-6">
      <StudentDetail
        businessId={access.businessId}
        student={studentRes.data}
        canReadPii={canReadPii}
        canRevenue={canRevenue}
        canWrite={canWrite}
        guardians={guardiansRes && guardiansRes.ok ? guardiansRes.data : []}
        guardiansError={guardiansRes && !guardiansRes.ok ? guardiansRes.message : null}
        enrollments={enrollmentsRes.data}
        attendance={attendanceRes.data}
        invoices={invoices}
        invoicesError={invoicesError}
        classesForEnroll={classesRes && classesRes.ok ? classesRes.data.filter((c) => c.active) : []}
      />
    </div>
  );
}
