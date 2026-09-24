import { Card } from "@/components/ui/Card";
import { PageBody } from "@/components/ui/PageHeader";
import { RetryButton } from "@/components/rental/listkit";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage } from "@/lib/auth/access";
import { listTasks, getDailyChecklist } from "@/lib/domain/unmanned";
import { todayKeyInTz } from "@/lib/utils/datetime";
import { getAccess } from "../access";
import { TasksBoard } from "@/components/unmanned/TasksBoard";

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { due?: string };
}) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }
  const todayKey = todayKeyInTz(access.timezone);
  const [result, checklist] = await Promise.all([listTasks(access.businessId), getDailyChecklist(access.businessId, todayKey)]);
  if (!result.ok) {
    return <PageBody><Card><ErrorState title="업무를 불러오지 못했습니다." description={result.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  }
  // 홈 "오늘 보충/점검 미완료" 지표에서 넘어오면 오늘 이하 마감·미처리로 좁힌다.
  const tasks = searchParams.due === "today" ? result.data.filter((t) => t.status === "예정" && t.dueDate <= todayKey) : result.data;
  return (
    <PageBody>
      <TasksBoard businessId={access.businessId} canWrite={access.caps.includes("write")} tasks={tasks} todayKey={todayKey} dueToday={searchParams.due === "today"} checklist={checklist.ok ? checklist.data : null} />
    </PageBody>
  );
}
