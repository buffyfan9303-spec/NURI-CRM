"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { CalendarEvent, MemberOption } from "@/lib/domain/calendar-shared";
import { STATUS_OPTIONS } from "@/lib/domain/calendar-shared";
import {
  createEvent,
  updateEvent,
  updateEventStatus,
  type CalendarEventInput,
  type MutateEventResult,
} from "@/lib/domain/calendar-actions";
import { dayKeyInTz, formatInTz, localDateTimeToUtcIso } from "@/lib/utils/datetime";
import { memberLabel } from "./shared";

export function EventFormModal({
  open,
  onClose,
  businessId,
  tz,
  eventKinds,
  members,
  initial,
  defaultDateKey,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  tz: string;
  eventKinds: { kind: string; label: string }[];
  members: MemberOption[];
  /** 있으면 수정 모드(파생 일정이면 이 모달을 열지 않는 건 호출부 책임). */
  initial?: CalendarEvent | null;
  defaultDateKey?: string;
  onSaved: (event: CalendarEvent) => void;
}) {
  const isEdit = !!initial;

  const [kind, setKind] = React.useState(initial?.kind ?? eventKinds[0]?.kind ?? "");
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [allDay, setAllDay] = React.useState(initial?.allDay ?? false);
  const [dateKey, setDateKey] = React.useState(
    initial ? (initial.allDay ? (initial.eventDate as string) : dayKeyInTz(initial.startsAt as string, tz)) : defaultDateKey ?? dayKeyInTz(new Date().toISOString(), tz)
  );
  const [startTime, setStartTime] = React.useState(
    initial && !initial.allDay && initial.startsAt ? formatInTz(initial.startsAt, tz, "HH:mm") : "09:00"
  );
  const [endTime, setEndTime] = React.useState(
    initial && !initial.allDay && initial.endsAt ? formatInTz(initial.endsAt, tz, "HH:mm") : ""
  );
  const [assignee, setAssignee] = React.useState(initial?.assignee ?? "");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [status, setStatus] = React.useState(initial?.status ?? "planned");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 모달을 다시 열 때(다른 일정 수정 등) 초기값을 새로 반영한다.
  React.useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? eventKinds[0]?.kind ?? "");
    setTitle(initial?.title ?? "");
    setAllDay(initial?.allDay ?? false);
    setDateKey(
      initial
        ? initial.allDay
          ? (initial.eventDate as string)
          : dayKeyInTz(initial.startsAt as string, tz)
        : defaultDateKey ?? dayKeyInTz(new Date().toISOString(), tz)
    );
    setStartTime(initial && !initial.allDay && initial.startsAt ? formatInTz(initial.startsAt, tz, "HH:mm") : "09:00");
    setEndTime(initial && !initial.allDay && initial.endsAt ? formatInTz(initial.endsAt, tz, "HH:mm") : "");
    setAssignee(initial?.assignee ?? "");
    setNotes(initial?.notes ?? "");
    setStatus(initial?.status ?? "planned");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // 중복 제출 방지(클라이언트 pending 가드)
    setSaving(true);
    setError(null);

    const input: CalendarEventInput = allDay
      ? { kind, title, allDay: true, eventDate: dateKey, assignee: assignee || null, notes: notes || null }
      : {
          kind,
          title,
          allDay: false,
          startsAt: localDateTimeToUtcIso(dateKey, startTime, tz),
          endsAt: endTime ? localDateTimeToUtcIso(dateKey, endTime, tz) : null,
          assignee: assignee || null,
          notes: notes || null,
        };

    let result: MutateEventResult;
    try {
      result = isEdit ? await updateEvent(businessId, initial!.id, input) : await createEvent(businessId, input);
      if (result.ok && isEdit && status !== initial!.status) {
        const statusResult = await updateEventStatus(businessId, initial!.id, status);
        if (statusResult.ok) {
          result = statusResult;
        } else {
          // 본문 저장은 이미 성공했다 — 모달은 열어둔 채 상태변경 실패만 알린다(닫으면 이 메시지를 못 본다).
          setSaving(false);
          setError(`나머지 내용은 저장됐지만 상태 변경에 실패했습니다: ${statusResult.message}`);
          return;
        }
      }
    } catch {
      result = { ok: false, reason: "error", message: "요청을 보내지 못했습니다. 네트워크를 확인해 주세요." };
    }

    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.event);
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "일정 수정" : "일정 등록"}>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="종류" htmlFor="ev-kind" required>
          <select
            id="ev-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            required
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 text-sm text-t outline-none focus:border-[var(--accent)]"
          >
            {eventKinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>

        <Input label="제목" id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />

        <Field label="날짜/시간" htmlFor="ev-date" required>
          <div className="flex flex-col gap-2">
            <label className="flex min-h-[36px] items-center gap-2 text-[13px] text-t2">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
              종일
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="ev-date"
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                required
                className="h-11 min-w-[150px] flex-1 rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]"
              />
              {!allDay && (
                <>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    aria-label="시작 시각"
                    className="h-11 w-[110px] rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]"
                  />
                  <span className="flex items-center text-t3">–</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    aria-label="종료 시각(선택)"
                    className="h-11 w-[110px] rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]"
                  />
                </>
              )}
            </div>
          </div>
        </Field>

        <Field label="담당자" htmlFor="ev-assignee">
          <select
            id="ev-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 text-sm text-t outline-none focus:border-[var(--accent)]"
          >
            <option value="">담당자 미지정</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {memberLabel(m.userId, members)}
              </option>
            ))}
          </select>
        </Field>

        {isEdit && (
          <Field label="상태" htmlFor="ev-status">
            <select
              id="ev-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 text-sm text-t outline-none focus:border-[var(--accent)]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="메모" htmlFor="ev-notes">
          <textarea
            id="ev-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 py-2.5 text-sm text-t outline-none focus:border-[var(--accent)]"
          />
        </Field>

        <FormError message={error ?? undefined} />

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "저장" : "등록"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
