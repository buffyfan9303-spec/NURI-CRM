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

const STATUSES = ["출석", "지각", "결석", "조퇴"] as const;
const NOTICE_STATUSES = new Set<string>(["결석", "지각", "조퇴"]);
const ACTIVE_CLASS: Record<(typeof STATUSES)[number], string> = {
  출석: "border-[var(--okt)] bg-okb text-okt",
  지각: "border-[var(--wt)] bg-wb text-wt",
  결석: "border-[var(--et)] bg-eb text-et",
  조퇴: "border-[var(--wt)] bg-wb text-wt",
};

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
      <CardHead
        title={className}
        description={`${sessionDate}${sessionTime ? ` ${sessionTime}` : ""} · ${students.length}명${uncheckedCount > 0 ? ` · 미입력 ${uncheckedCount}명` : " · 전원 입력 완료"}`}
        action={canWrite && uncheckedCount > 0 ? (
          <Button size="sm" variant="secondary" loading={busy === "__all__"} disabled={busy !== null} onClick={markAllPresent}>
            <ListChecks size={14} aria-hidden />미입력 전원 출석
          </Button>
        ) : undefined}
      />
      {error && <Alert className="mb-3">{error}</Alert>}
      {students.length === 0 ? (
        <EmptyState title="이 회차에 등록된 학생이 없습니다." description="반·수강등록에서 학생을 등록하면 여기에 나타납니다." />
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-t3">
            {counts.map(([st, n]) => <li key={st}><span className="font-medium text-t2">{st}</span> <span className="tabular-nums">{n}</span></li>)}
          </ul>
          <ul className="-mx-4 flex flex-col divide-y divide-[var(--bd)] sm:-mx-5">
            {students.map((s) => {
              const marked = existing[s.id];
              const rowBusy = busy === s.id || busy === "__all__";
              return (
                <li key={s.id} className={cn("flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5", marked === undefined && "bg-wb/40")}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sf2 text-[11px] font-semibold text-t2" aria-hidden>{s.name.slice(0, 2)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-t">{s.name}</span>
                      <span className="block text-[11.5px] text-t3">{marked === undefined ? "미입력" : [s.grade, s.school].filter(Boolean).join(" · ") || "입력됨"}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span role="radiogroup" aria-label={`${s.name} 출결`} className="inline-flex rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-0.5">
                      {STATUSES.map((st) => {
                        const on = marked === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={!canWrite || rowBusy}
                            onClick={() => setStatus(s.id, st)}
                            className={cn(
                              "h-[32px] min-w-[52px] rounded-[8px] border px-2.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:min-w-[60px]",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
                              on ? ACTIVE_CLASS[st] : "border-transparent text-t2 hover:bg-sf2 hover:text-t"
                            )}
                          >
                            {st}
                          </button>
                        );
                      })}
                    </span>
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
