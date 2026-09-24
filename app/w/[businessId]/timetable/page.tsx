import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { listClasses, listSessions } from "@/lib/domain/academy";
import { todayKeyInTz } from "@/lib/utils/datetime";
import { getAccess } from "../access";
import { TimetableBoard } from "@/components/academy/TimetableBoard";

export default async function TimetablePage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="시간표" />
        <Card><EmptyState title="이 업종에는 시간표 화면이 없습니다." /></Card>
      </PageBody>
    );
  }
  // 홈·출결과 같은 tz 기준 "오늘"(서버 UTC 로 자르면 KST 저녁에 하루 어긋난다).
  const today = todayKeyInTz(access.timezone);
  const [classes, sessions] = await Promise.all([listClasses(access.businessId), listSessions(access.businessId, undefined, today)]);
  if (!classes.ok) return <PageBody><PageHeader title="시간표" /><Card><ErrorState title="불러오지 못했습니다." description={classes.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;
  if (!sessions.ok) return <PageBody><PageHeader title="시간표" /><Card><ErrorState title="불러오지 못했습니다." description={sessions.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>;

  return (
    <PageBody>
      <TimetableBoard businessId={access.businessId} canWrite={access.caps.includes("write")} classes={classes.data} sessions={sessions.data} />
    </PageBody>
  );
}
