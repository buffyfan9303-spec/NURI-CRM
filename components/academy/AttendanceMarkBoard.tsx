"use client";

/**
 * 학생 출결 입력. 강사 근태(app/w/[businessId]/staff-shift, crm.attendance_records)와는
 * 완전히 다른 데이터/화면 경로다 — 절대 같은 페이지에 섞지 않는다(명세 §3-7).
 *
 * 레퍼런스: 클래스업 출결 — 학생 한 줄에 상태 4개를 세그먼트로, 결석·지각·조퇴는 보호자 알림 문구로 바로 이어진다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { MailCheck, ListChecks } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardHead, Alert } from "@/components/rental/listkit";
import { cn } from "@/lib/utils/cn";
import type { AcadStudent } from "@/lib/domain/academy";
import { markStudentAttendance } from "@/lib/domain/academy-actions";
import { academyAttendanceNotice } from "@/lib/domain/messages";
import { MessageActions } from "@/components/common/MessageActions";
import { Segmented } from "@/components/common/Segmented";

const STATUSES = ["출석", "지각", "결석", "조퇴"] as const;
const NOTICE_STATUSES = new Set<string>(["결석", "지각", "조퇴"]);
const TONE: Record<(typeof STATUSES)[number], "success" | "warning" | "error"> = { 출석: "success", 지각: "warning", 결석: "error", 조퇴: "warning" };
const DOT: Record<(typeof STATUSES)[number], string> = { 출석: "bg-okt", 지각: "bg-wt", 결석: "bg-et", 조퇴: "bg-wt" };

export function AttendanceMarkBoard({ businessId, businessName, canWrite, sessionId, className, sessionDate, sessionTime, students, existing }: {
  businessId: string; businessName: string; canWrite: boolean; sessionId: string; className: string; sessionDate: string; sessionTime?: string; students: AcadStudent[]; existing: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [noticeFor, setNoticeFor] = React.useState<AcadStudent | null>(null);

  const setStatus = async (studentId: string, status: string) => {
    if (existing[studentId] === status) return;
    setBusy(studentId); setError(null);
    try {
      const r = await markStudentAttendance(businessId, { sessionId, studentId, status });
      if (!r.ok) { setError(r.message); return; }
      router.refresh();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(null); }
  };

  // CLICK-PATH-205: 미입력 학생을 "전원 출석"으로 한 번에 채운다 — 개별로 누를 필요 없게.
  const markAllPresent = async () => {
    setBusy("__all__"); setError(null);
    try {
      const targets = students.filter((s) => existing[s.id] === undefined);
      for (const s of targets) {
        const r = await markStudentAttendance(businessId, { sessionId, studentId: s.id, status: "출석" });
        if (!r.ok) { setError(r.message); return; }
      }
      router.refresh();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(null); }
  };

  const uncheckedCount = students.filter((s) => existing[s.id] === undefined).length;
  const counts = STATUSES.map((st) => [st, students.filter((s) => existing[s.id] === st).length] as const);

  return (
    <Card className="p-4 sm:p-5">
      {/* A4: 휴대폰(<sm)은 머리를 세로로 — 버튼이 부제목을 눌러 "미/입력"으로 끊기지 않게 제목 아래 전폭. */}
      <CardHead
        title={className}
        description={`${sessionDate}${sessionTime ? ` ${sessionTime}` : ""} · ${students.length}명${uncheckedCount > 0 ? ` · 미입력 ${uncheckedCount}명` : " · 전원 입력 완료"}`}
        className="max-sm:flex-col max-sm:items-stretch max-sm:gap-2"
        action={canWrite && uncheckedCount > 0 ? (
          <Button size="sm" variant="secondary" className="max-sm:min-h-[44px] max-sm:w-full" loading={busy === "__all__"} disabled={busy !== null} onClick={markAllPresent}>
            <ListChecks size={14} aria-hidden />미입력 전원 출석
          </Button>
        ) : undefined}
      />
      {error && <Alert className="mb-3">{error}</Alert>}
      {students.length === 0 ? (
        <EmptyState title="이 회차에 등록된 학생이 없습니다." description="반·수강등록에서 학생을 등록하면 여기에 나타납니다." />
      ) : (
        <>
          {/* 요약: 상태별 건수 + 진행 막대(입력 완료 비율). */}
          <div className="mb-3 flex flex-col gap-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-t3">
              {counts.map(([st, n]) => (
                <li key={st} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", DOT[st])} aria-hidden />
                  <span className="font-medium text-t2">{st}</span> <span className="tabular-nums">{n}</span>
                </li>
              ))}
              <li className="ml-auto tabular-nums">입력 {students.length - uncheckedCount}/{students.length}</li>
            </ul>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-sf2" role="progressbar" aria-label="출결 입력 진행" aria-valuemin={0} aria-valuemax={students.length} aria-valuenow={students.length - uncheckedCount}>
              <span className="block h-full rounded-full bg-[var(--accent-strong)] transition-[width] duration-3 ease-out" style={{ width: `${students.length ? ((students.length - uncheckedCount) / students.length) * 100 : 0}%` }} />
            </span>
          </div>
          <ul className="-mx-4 flex flex-col sm:-mx-5">
            {students.map((s) => {
              const marked = existing[s.id];
              const rowBusy = busy === s.id || busy === "__all__";
              return (
                <li key={s.id} className={cn("flex flex-col gap-2 border-l-2 border-t border-t-[var(--bd)] px-4 py-2.5 transition-colors duration-1 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-5", marked === undefined ? "border-l-[var(--wt)] bg-wb" : "border-l-transparent")}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", marked ? "bg-sf2 text-t2" : "bg-sf text-wt shadow-[inset_0_0_0_1px_var(--wt)]")} aria-hidden>{s.name.slice(0, 2)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-t">{s.name}</span>
                      <span className={cn("block text-[12px]", marked === undefined ? "font-medium text-wt" : "text-t3")}>{marked === undefined ? "미입력" : [s.grade, s.school].filter(Boolean).join(" · ") || "입력됨"}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {/* 세그먼트: 활성 조각이 상태 색(출석 녹색·지각/조퇴 주황·결석 빨강)으로 미끄러진다. */}
                    <Segmented
                      role="radiogroup"
                      ariaLabel={`${s.name} 출결`}
                      value={marked && (STATUSES as readonly string[]).includes(marked) ? (marked as (typeof STATUSES)[number]) : null}
                      onChange={(st) => setStatus(s.id, st)}
                      disabled={!canWrite || rowBusy}
                      options={STATUSES.map((st) => ({ value: st, label: st, tone: TONE[st] }))}
                      className="max-sm:flex-1"
                    />
                    {marked && NOTICE_STATUSES.has(marked) ? (
                      <button
                        type="button"
                        onClick={() => setNoticeFor(s)}
                        title="보호자 안내 문구"
                        aria-label={`${s.name} 보호자 안내 문구`}
                        className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[var(--r-md)] border border-[var(--bd)] text-t2 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
                      >
                        <MailCheck size={15} aria-hidden />
                      </button>
                    ) : (
                      <span className="hidden h-[36px] w-[36px] shrink-0 sm:block" aria-hidden />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal open={!!noticeFor} onClose={() => setNoticeFor(null)} title="결석·지각·조퇴 안내 문구">
        {noticeFor && (
          <MessageActions
            title="보호자 안내"
            text={academyAttendanceNotice({
              businessName,
              studentName: noticeFor.name,
              className,
              sessionDate,
              status: existing[noticeFor.id] as "결석" | "지각" | "조퇴",
            })}
          />
        )}
      </Modal>
    </Card>
  );
}
