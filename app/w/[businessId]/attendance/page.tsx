/**
 * 학생 출결. crm.acad_attendance 전용 — 강사 근태(app/w/[businessId]/staff-shift)와
 * 데이터·경로·메뉴가 전부 분리되어 있다.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardHead, RetryButton } from "@/components/rental/listkit";
import { QrCode } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { accessMessage } from "@/lib/auth/access";
import { listClasses, listSessions, listEnrolledStudents, listStudentAttendance } from "@/lib/domain/academy";
import { getAccess } from "../access";
import { AttendanceMarkBoard } from "@/components/academy/AttendanceMarkBoard";
import { todayKeyInTz, formatInTz } from "@/lib/utils/datetime";

const CHIP = "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-sm)] border px-3 text-[12.5px] font-medium transition-colors [@media(pointer:coarse)]:min-h-[44px]";

export default async function StudentAttendancePage({ params, searchParams }: { params: { businessId: string }; searchParams: { sessionId?: string; unmarked?: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }

  if (access.industry !== "academy") {
    return (
      <PageBody>
        <PageHeader title="학생 출결" />
        <Card><EmptyState title="이 업종에는 학생 출결 화면이 없습니다." /></Card>
      </PageBody>
    );
  }

  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [classes, sessions] = await Promise.all([listClasses(access.businessId), listSessions(access.businessId, undefined, from)]);
  for (const r of [classes, sessions]) {
    if (!r.ok) {
      return (
        <PageBody>
          <PageHeader title="학생 출결" />
          <Card><ErrorState title="불러오지 못했습니다." description={r.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card>
        </PageBody>
      );
    }
  }
  if (!classes.ok || !sessions.ok) return null;

  // 결함(부수 발견): 기존 코드는 서버 UTC 로 "오늘"을 계산했다 — 홈(getAcademyToday)과 같은 tz 기준으로 맞춘다.
  const today = todayKeyInTz(access.timezone);

  // 결함(§11-5): 홈의 "출결 미확인" 지표(getAcademyToday.attendanceUnmarkedCount)와 정확히 같은
  // 정의(오늘 회차 중 출결 기록이 0건 · 휴강 제외)로 오늘 회차별 미확인 여부를 계산한다.
  const todaySessions = sessions.data.filter((s) => s.sessionDate === today && s.status !== "휴강");
  const todayAttendance = await Promise.all(todaySessions.map((s) => listStudentAttendance(s.id)));
  const unmarkedTodayIds = new Set(
    todaySessions.filter((_, i) => todayAttendance[i].ok && todayAttendance[i].data.length === 0).map((s) => s.id)
  );

  const filterUnmarked = searchParams.unmarked === "1";
  const visibleSessions = filterUnmarked ? sessions.data.filter((s) => unmarkedTodayIds.has(s.id)) : sessions.data;

  const selected = searchParams.sessionId
    ? sessions.data.find((s) => s.id === searchParams.sessionId)
    : filterUnmarked
      ? visibleSessions[0]
      : sessions.data.find((s) => s.sessionDate === today) ?? sessions.data[0];

  const className = (id: string) => classes.data.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const canWrite = access.caps.includes("write");

  let markSection = <Card><EmptyState title="표시할 회차가 없습니다." description="시간표에서 회차를 먼저 생성하세요." /></Card>;
  if (selected) {
    const [students, attendance] = await Promise.all([listEnrolledStudents(selected.classId), listStudentAttendance(selected.id)]);
    if (students.ok && attendance.ok) {
      const existing = Object.fromEntries(attendance.data.map((a) => [a.studentId, a.status]));
      markSection = (
        <AttendanceMarkBoard
          businessId={access.businessId}
          businessName={access.businessName}
          canWrite={canWrite}
          sessionId={selected.id}
          className={className(selected.classId)}
          sessionDate={selected.sessionDate}
          sessionTime={`${formatInTz(selected.startAt, access.timezone, "HH:mm")}–${formatInTz(selected.endAt, access.timezone, "HH:mm")}`}
          students={students.data}
          existing={existing}
        />
      );
    } else {
      markSection = <Card><ErrorState title="불러오지 못했습니다." description={!students.ok ? students.message : (!attendance.ok ? attendance.message : undefined)} /><div className="flex justify-center pb-6"><RetryButton /></div></Card>;
    }
  }

  // 날짜별로 묶어 회차 선택 칩을 그린다(최근 7일 ~ 예정).
  const byDate = new Map<string, typeof visibleSessions>();
  for (const s of visibleSessions) byDate.set(s.sessionDate, [...(byDate.get(s.sessionDate) ?? []), s]);

  return (
    <PageBody>
      <PageHeader
        title="학생 출결"
        description="회차를 고른 뒤 학생별 출결을 입력합니다. 결석·지각·조퇴는 보호자 안내 문구로 바로 이어집니다."
        actions={canWrite ? <Link href={`/kiosk/${access.businessId}/attendance`}><Button variant="secondary"><QrCode size={15} aria-hidden />등원 키오스크</Button></Link> : undefined}
      />

      <Card className="mb-4 p-4 sm:p-5">
        <CardHead
          title={filterUnmarked ? "오늘 출결 미확인 회차" : "회차 선택"}
          description={filterUnmarked ? `${visibleSessions.length}건 · 출결 기록이 없는 오늘 회차` : "최근 7일 ~ 예정 회차"}
          action={
            filterUnmarked ? (
              <Link href="?" className={cn(CHIP, "border-[var(--bd)] text-t2 hover:bg-sf2")}>전체 회차 보기</Link>
            ) : unmarkedTodayIds.size > 0 ? (
              <Link href="?unmarked=1" className={cn(CHIP, "border-[var(--wt)] bg-wb text-wt")}>미확인 {unmarkedTodayIds.size}건만</Link>
            ) : undefined
          }
        />
        {visibleSessions.length === 0 ? (
          <EmptyState
            title={filterUnmarked ? "출결 미확인 회차가 없습니다." : "회차가 없습니다."}
            description={filterUnmarked ? "오늘 회차는 전부 출결이 기록됐습니다." : undefined}
            action={filterUnmarked ? <Link href="?" className={cn(CHIP, "border-[var(--bd2)] text-t")}>전체 회차 보기</Link> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                <span className={cn("w-[112px] shrink-0 pt-[9px] text-[12px] font-medium tabular-nums", date === today ? "text-[var(--accent-ink)]" : "text-t3")}>{date}{date === today && " 오늘"}</span>
                <div className="scrollable -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
                  {list.map((s) => {
                    const on = selected?.id === s.id;
                    const un = unmarkedTodayIds.has(s.id);
                    return (
                      <Link
                        key={s.id}
                        href={`?sessionId=${s.id}${filterUnmarked ? "&unmarked=1" : ""}`}
                        aria-current={on ? "true" : undefined}
                        className={cn(CHIP, on ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] bg-sf text-t2 hover:bg-sf2 hover:text-t")}
                      >
                        <span className="tabular-nums">{formatInTz(s.startAt, access.timezone, "HH:mm")}</span>
                        <span className="max-w-[180px] truncate">{className(s.classId)}</span>
                        {s.status === "휴강" && <span className="text-[11px] text-et">휴강</span>}
                        {un && <span className="h-1.5 w-1.5 rounded-full bg-[var(--wt)]" aria-label="미확인" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {markSection}
    </PageBody>
  );
}
