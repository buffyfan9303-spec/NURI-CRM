import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { listStudents, listGuardians } from "@/lib/domain/academy";
import { getAccess } from "../access";
import { StudentsBoard } from "@/components/academy/StudentsBoard";

export default async function StudentsPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="학생·보호자" />
        <Card><EmptyState title="이 업종에는 학생·보호자 화면이 없습니다." /></Card>
      </PageBody>
    );
  }
  const canReadPii = access.caps.includes("pii.read");
  const [students, guardians] = await Promise.all([
    listStudents(access.businessId, canReadPii),
    canReadPii ? listGuardians(access.businessId) : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  if (!students.ok) return <PageBody><PageHeader title="학생·보호자" /><Card><ErrorState title="불러오지 못했습니다." description={students.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  if (!guardians.ok) return <PageBody><PageHeader title="학생·보호자" /><Card><ErrorState title="불러오지 못했습니다." description={guardians.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;

  return (
    <PageBody>
      <StudentsBoard businessId={access.businessId} canWrite={access.caps.includes("write")} canReadPii={canReadPii} students={students.data} guardians={guardians.data} />
    </PageBody>
  );
}
