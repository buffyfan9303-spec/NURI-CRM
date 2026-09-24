import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { listEnrollments, listStudents, listClasses, listInvoiceBalances, listGuardians } from "@/lib/domain/academy";
import { getAccess } from "../access";
import { TuitionBoard } from "@/components/academy/TuitionBoard";

export default async function TuitionPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { status?: string };
}) {
  const access = await getAccess(params.businessId, "revenue.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="수강료·미납" />
        <Card><EmptyState title="이 업종에는 수강료·미납 화면이 없습니다." /></Card>
      </PageBody>
    );
  }
  const canReadPii = access.caps.includes("pii.read");
  const [enrollments, students, classes, invoices, guardians] = await Promise.all([
    listEnrollments(access.businessId), listStudents(access.businessId, false), listClasses(access.businessId), listInvoiceBalances(access.businessId),
    // 미납 안내 문구에 넣을 보호자 대표번호 — pii.read 없으면 애초에 조회하지 않는다(계약 §5-2).
    canReadPii ? listGuardians(access.businessId) : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  for (const r of [enrollments, students, classes, invoices]) {
    if (!r.ok) return <PageBody><PageHeader title="수강료·미납" /><Card><ErrorState title="불러오지 못했습니다." description={r.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  }
  // 학생당 대표번호 = 첫 보호자(별도 "대표" 플래그가 없어 등록 순서 첫 번째를 쓴다).
  const guardianPhoneByStudent: Record<string, string> = {};
  if (guardians.ok) {
    for (const g of guardians.data) if (!guardianPhoneByStudent[g.studentId] && g.phone) guardianPhoneByStudent[g.studentId] = g.phone;
  }
  return (
    <PageBody>
      <TuitionBoard
        businessId={access.businessId}
        canWrite={access.caps.includes("write")}
        canRefund={access.caps.includes("refund")}
        enrollments={enrollments.ok ? enrollments.data : []}
        students={students.ok ? students.data : []}
        classes={classes.ok ? classes.data : []}
        invoices={invoices.ok ? invoices.data : []}
        businessName={access.businessName}
        guardianPhoneByStudent={guardianPhoneByStudent}
        // 홈 "미납" 지표(?status=미납)에서 넘어오면 그 탭으로 연다 — 전체 목록은 그대로 두고 탭만 좁힌다.
        initialStatus={searchParams.status}
      />
    </PageBody>
  );
}
