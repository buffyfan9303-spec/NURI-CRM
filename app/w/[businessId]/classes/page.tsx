import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { listClassrooms, listClasses, listStudents, listActiveMembers } from "@/lib/domain/academy";
import { getAccess } from "../access";
import { ClassesBoard } from "@/components/academy/ClassesBoard";

export default async function ClassesPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="반·수강등록" />
        <Card><EmptyState title="이 업종에는 반·수강등록 화면이 없습니다." /></Card>
      </PageBody>
    );
  }
  const [classrooms, classes, students, teachers] = await Promise.all([
    listClassrooms(access.businessId),
    listClasses(access.businessId),
    listStudents(access.businessId, false),
    listActiveMembers(access.businessId),
  ]);
  for (const r of [classrooms, classes, students, teachers]) {
    if (!r.ok) return <PageBody><PageHeader title="반·수강등록" /><Card><ErrorState title="불러오지 못했습니다." description={r.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  }
  return (
    <PageBody>
      <ClassesBoard
        businessId={access.businessId}
        canWrite={access.caps.includes("write")}
        classrooms={classrooms.ok ? classrooms.data : []}
        classes={classes.ok ? classes.data : []}
        students={students.ok ? students.data : []}
        teachers={teachers.ok ? teachers.data : []}
      />
    </PageBody>
  );
}
