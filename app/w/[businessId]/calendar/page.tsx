/**
 * 전 업종 공통 캘린더 페이지.
 *
 * 계약 준수:
 *  - §5.1/§5.3: 상위 layout.tsx가 이미 checkAccess를 통과시켰더라도 여기서 다시
 *    checkAccess()를 부른다(레이아웃 통과를 믿지 않는다 — 프롬프트 지시사항).
 *  - §5.5: 미인증/소속없음/권한부족/서버오류를 서로 다른 화면으로 보여준다.
 *  - URL 쿼리(view/date/kinds/assignee/status/q)가 상태의 단일 출처다 — 새로고침·
 *    공유해도 같은 화면이 복원된다.
 */
import { redirect } from "next/navigation";
import { checkAccess, accessMessage } from "@/lib/auth/access";
import { INDUSTRY_DEFS } from "@/lib/industry/config";
import { listEvents, listAssignableMembers, computeRange, type CalendarView } from "@/lib/domain/calendar";
import { todayKeyInTz, isValidDateKey } from "@/lib/utils/datetime";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { RetryError } from "@/components/calendar/RetryError";
import { CalendarClient, type EventsState } from "@/components/calendar/CalendarClient";

const VALID_VIEWS: readonly CalendarView[] = ["month", "week", "day", "list"];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const access = await checkAccess(params.businessId, "view");

  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    const msg = accessMessage(access);
    return (
      <div className="flex h-full items-center justify-center p-6">
        {access.reason === "error" ? (
          <RetryError title={msg.title} description={msg.detail} />
        ) : (
          <ForbiddenState title={msg.title} description={msg.detail} />
        )}
      </div>
    );
  }

  const rawView = one(searchParams.view);
  const view: CalendarView = VALID_VIEWS.includes(rawView as CalendarView) ? (rawView as CalendarView) : "month";

  const todayKey = todayKeyInTz(access.timezone);
  const rawDate = one(searchParams.date);
  const dateKey = rawDate && isValidDateKey(rawDate) ? rawDate : todayKey;

  const kinds = (one(searchParams.kinds) ?? "").split(",").filter(Boolean);
  const assignee = one(searchParams.assignee);
  const status = one(searchParams.status);
  const q = one(searchParams.q);

  const range = computeRange(view, dateKey, access.timezone);
  const industry = INDUSTRY_DEFS[access.industry];

  const [eventsResult, membersResult] = await Promise.all([
    listEvents(
      access.businessId,
      { from: range.from, to: range.to, kinds: kinds.length ? kinds : undefined, assignee, status, q },
      access.timezone
    ),
    listAssignableMembers(access.businessId),
  ]);

  const eventsState: EventsState = eventsResult.ok
    ? { kind: "ok", events: eventsResult.events }
    : eventsResult.reason === "error"
      ? { kind: "error", ...accessMessage(eventsResult) }
      : eventsResult.reason === "unauthenticated"
        ? { kind: "error", ...accessMessage(eventsResult) } // 페이지 단계 인증은 이미 통과했으므로 극히 예외적인 경합 상황
        : { kind: "forbidden", ...accessMessage(eventsResult) };

  // 담당자 목록은 필터·표시 편의용 보조 데이터라 실패해도 화면 전체를 막지 않고 빈 목록으로 대체한다.
  const members = membersResult.ok ? membersResult.members : [];

  return (
    <CalendarClient
      businessId={access.businessId}
      timezone={access.timezone}
      industry={industry}
      view={view}
      dateKey={dateKey}
      todayKey={todayKey}
      days={range.days}
      filters={{ kinds, assignee, status, q }}
      eventsState={eventsState}
      members={members}
      canWrite={access.caps.includes("write")}
      canDelete={access.caps.includes("delete")}
    />
  );
}
