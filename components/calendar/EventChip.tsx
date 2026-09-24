"use client";

import { Circle, CheckCircle2, CircleX, HelpCircle } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { formatInTz } from "@/lib/utils/datetime";
import { kindTagClass } from "./shared";

const STATUS_ICON = {
  planned: Circle,
  done: CheckCircle2,
  canceled: CircleX,
} as const;

/** 격자 칸 안의 한 줄짜리 일정 칩. 색(kind) 하나에만 기대지 않도록 상태 아이콘을 함께 넣는다. */
export function EventChip({
  event,
  eventKinds,
  tz,
  selected,
  onClick,
}: {
  event: CalendarEvent;
  eventKinds: { kind: string; label: string }[];
  tz: string;
  selected?: boolean;
  onClick: () => void;
}) {
  const StatusIcon = STATUS_ICON[event.status as keyof typeof STATUS_ICON] ?? HelpCircle;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${event.title} — ${event.allDay ? "종일" : formatInTz(event.startsAt as string, tz, "HH:mm")}`}
      className={cn(
        "ev-tag flex w-full min-w-0 items-center gap-1 truncate text-left",
        kindTagClass(event.kind, eventKinds),
        selected && "outline outline-2 outline-offset-1 outline-[var(--accent)]"
      )}
    >
      <StatusIcon size={10} className="shrink-0" aria-hidden />
      {!event.allDay && <span className="shrink-0 font-normal">{formatInTz(event.startsAt as string, tz, "HH:mm")}</span>}
      <span className="min-w-0 truncate">{event.title}</span>
    </button>
  );
}
