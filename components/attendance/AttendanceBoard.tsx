"use client";

/**
 * 근태 보드 — 미용실·학원 공용. 예약 가능시간(근무표)과는 완전히 분리된 화면/데이터다.
 * 본인 출퇴근(attendance.self)과 전 직원 조회·보정(attendance.all)을 하나의 페이지에서
 * 서로 다른 섹션으로 보여준다(같은 폼에 섞지 않는다).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, StopCircle, CircleAlert, Check, TriangleAlert } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AttendanceRecord } from "@/lib/domain/attendance";
import { clockInAction, clockOutAction, correctAttendanceAction, approveAttendanceAction } from "@/lib/domain/attendance-actions";

function fmt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AttendanceBoard({
  businessId,
  canSelf,
  canAll,
  currentUserId,
  myRecords,
  allRecords,
}: {
  businessId: string;
  canSelf: boolean;
  canAll: boolean;
  currentUserId: string;
  myRecords: AttendanceRecord[];
  allRecords: AttendanceRecord[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [breakMin, setBreakMin] = React.useState("0");

  const myOpen = myRecords.find((r) => r.clockOut === null);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) {
        setError(r.message ?? "처리하지 못했습니다.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-eb px-3.5 py-2.5 text-[12.5px] text-et">
          <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {canSelf && (
        <Card className="p-4">
          <h2 className="mb-3 text-[13.5px] font-semibold text-t">본인 출퇴근</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12.5px] text-t2">
              {myOpen ? `${fmt(myOpen.clockIn)}부터 근무 중` : "현재 근무 중이 아닙니다"}
            </span>
            {!myOpen ? (
              <Button variant="primary" size="sm" loading={busy} onClick={() => run(() => clockInAction(businessId))}>
                <Play size={15} aria-hidden />
                출근
              </Button>
            ) : (
              <>
                <input
                  type="number"
                  min={0}
                  value={breakMin}
                  onChange={(e) => setBreakMin(e.target.value)}
                  className="h-9 w-20 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-2 text-[12.5px] text-t outline-none focus:border-[var(--accent)]"
                  aria-label="휴게시간(분)"
                />
                <span className="text-[11.5px] text-t3">분 휴게</span>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => run(() => clockOutAction(businessId, Number(breakMin) || 0))}
                >
                  <StopCircle size={15} aria-hidden />
                  퇴근
                </Button>
              </>
            )}
          </div>

          <h3 className="mb-1.5 mt-4 text-[12.5px] font-medium text-t2">내 최근 근무 기록</h3>
          {myRecords.length === 0 ? (
            <EmptyState title="근무 기록이 없습니다." />
          ) : (
            <ul className="flex flex-col gap-1">
              {myRecords.slice(0, 10).map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-[var(--r-sm)] bg-sf2 px-3 py-1.5 text-[12px] text-t2">
                  <span>{fmt(r.clockIn)} ~ {fmt(r.clockOut)}</span>
                  <span className="text-t3">휴게 {r.breakMinutes}분 {r.source !== "self" && `· ${r.source === "correction" ? "보정" : "관리자입력"}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {canAll && (
        <Card className="p-4">
          <h2 className="mb-3 text-[13.5px] font-semibold text-t">전 직원 근태 · 보정</h2>
          <CorrectionForm businessId={businessId} onDone={() => router.refresh()} />
          {allRecords.length === 0 ? (
            <EmptyState title="근태 기록이 없습니다." />
          ) : (
            <div className="mt-3 overflow-x-auto rounded-[var(--r-md)] border border-[var(--bd)]">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--bd)] bg-sf2 text-left text-t2">
                    <th className="px-2.5 py-2 font-medium">직원</th>
                    <th className="px-2.5 py-2 font-medium">근무일</th>
                    <th className="px-2.5 py-2 font-medium">출근</th>
                    <th className="px-2.5 py-2 font-medium">퇴근</th>
                    <th className="px-2.5 py-2 font-medium">휴게</th>
                    <th className="px-2.5 py-2 font-medium">상태</th>
                    <th className="px-2.5 py-2 font-medium">동작</th>
                  </tr>
                </thead>
                <tbody>
                  {allRecords.map((r) => {
                    const needsApproval = r.source !== "self" && !r.approvedAt;
                    const missingClockOut = !r.clockOut;
                    return (
                      <tr key={r.id} className="h-[44px] border-b border-[var(--bd)] last:border-b-0">
                        <td className="px-2.5 py-2 font-mono text-[11px] text-t2">
                          {r.userId.slice(0, 8)}…{r.userId === currentUserId && " (본인)"}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-t2">{r.clockIn ? r.clockIn.slice(0, 10) : "-"}</td>
                        <td className="px-2.5 py-2">{fmt(r.clockIn)}</td>
                        <td className="px-2.5 py-2">{fmt(r.clockOut)}</td>
                        <td className="px-2.5 py-2">{r.breakMinutes}분</td>
                        <td className="px-2.5 py-2">
                          {r.approvedAt ? (
                            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-okt"><Check size={13} />승인됨</span>
                          ) : needsApproval ? (
                            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-wt"><TriangleAlert size={13} />승인 대기 · {r.source === "correction" ? `보정(${r.correctionReason ?? ""})` : "관리자입력"}</span>
                          ) : missingClockOut ? (
                            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-t2"><Play size={13} />근무 중</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-t3"><Check size={13} />본인 기록</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2">
                          {needsApproval ? (
                            <Button variant="ghost" size="sm" loading={busy} onClick={() => run(() => approveAttendanceAction(businessId, r.id))}>
                              <Check size={13} aria-hidden />
                              승인
                            </Button>
                          ) : (
                            <span className="text-t3">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function CorrectionForm({ businessId, onDone }: { businessId: string; onDone: () => void }) {
  const [userId, setUserId] = React.useState("");
  const [workDate, setWorkDate] = React.useState("");
  const [clockIn, setClockIn] = React.useState("");
  const [clockOut, setClockOut] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!userId || !workDate || !clockIn || !reason.trim()) {
      setError("사용자 ID·근무일·출근시각·사유는 필수입니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await correctAttendanceAction(businessId, {
        userId,
        workDate,
        clockIn: new Date(`${workDate}T${clockIn}`).toISOString(),
        clockOut: clockOut ? new Date(`${workDate}T${clockOut}`).toISOString() : null,
        breakMinutes: 0,
        reason,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUserId(""); setWorkDate(""); setClockIn(""); setClockOut(""); setReason("");
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-3 grid grid-cols-2 gap-2 rounded-[var(--r-md)] border border-[var(--bd)] p-3 sm:grid-cols-3">
      <Input label="사용자 ID(uuid)" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="직원·권한 화면에서 확인" />
      <Input label="근무일" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
      <Input label="출근 시각" type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
      <Input label="퇴근 시각(선택)" type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
      <div className="col-span-2 sm:col-span-3">
        <Input label="보정 사유(필수)" value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
      {error && <p className="col-span-2 text-[12px] text-et sm:col-span-3">{error}</p>}
      <div className="col-span-2 sm:col-span-3">
        <Button type="submit" variant="secondary" size="sm" loading={busy}>보정 기록 추가</Button>
      </div>
    </form>
  );
}
