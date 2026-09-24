"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent, MemberOption } from "@/lib/domain/calendar-shared";
import { STATUS_LABEL } from "@/lib/domain/calendar-shared";
import { formatDayTitle } from "@/lib/utils/datetime";
import { Badge } from "@/components/ui/Badge";
import { kindTagClass, kindLabel, statusBadgeKind, formatEventTimeLabel, memberLabel, groupEventsByDay } from "./shared";

export function ListView({
  days,
  events,
  eventKinds,
  tz,
  members,
  selectedId,
  onSelectEvent,
}: {
  days: string[];
  events: CalendarEvent[];
  eventKinds: { kind: string; label: string }[];
  tz: string;
  members: MemberOption[];
  selectedId: string | null;
  onSelectEvent: (id: string) => void;
}) {
  const byDay = React.useMemo(() => groupEventsByDay(events, tz), [events, tz]);
  const daysWithEvents = days.filter((d) => (byDay.get(d) ?? []).length > 0);

  return (
    <div className="scrollable h-full overflow-y-auto p-3">
      {daysWithEvents.map((dateKey) => (
        <section key={dateKey} className="mb-4">
          <h3 className="mb-1.5 px-1 text-[12.5px] font-semibold text-t2">{formatDayTitle(dateKey)}</h3>
          <ul className="flex flex-col gap-1.5">
            {(byDay.get(dateKey) ?? []).map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(ev.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf px-3 py-2 text-left hover:bg-sf2",
                    ev.id === selectedId && "border-[var(--accent)]"
                  )}
                >
                  <span className={`ev-tag shrink-0 ${kindTagClass(ev.kind, eventKinds)}`}>
                    {kindLabel(ev.kind, eventKinds)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-t">{ev.title}</span>
                  <span className="shrink-0 text-[11.5px] text-t3">{formatEventTimeLabel(ev, tz)}</span>
                  <span className="hidden shrink-0 text-[11.5px] text-t3 sm:inline">
                    {memberLabel(ev.assignee, members)}
                  </span>
                  <Badge kind={statusBadgeKind(ev.status)} className="shrink-0">
                    {STATUS_LABEL[ev.status] ?? ev.status}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
