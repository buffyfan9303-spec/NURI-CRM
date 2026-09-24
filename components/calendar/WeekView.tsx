"use client";

/**
 * 주 보기. §5.6/§11-4: 예전엔 일 단위 카드 목록이라 시간축·현재 시간선·겹침 배치가
 * 전혀 없었다. 이제 TimeGrid를 공유해 하루 보기와 같은 시간축 위에서 7일을 나란히 본다.
 */
import * as React from "react";
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { TimeGrid } from "./TimeGrid";
import { groupEventsByDay } from "./shared";

export function WeekView({
  days,
  todayKey,
  events,
  eventKinds,
  tz,
  selectedId,
  onSelectEvent,
  onOpenDay,
}: {
  /** 7개 */
  days: string[];
  todayKey: string;
  events: CalendarEvent[];
  eventKinds: { kind: string; label: string }[];
  tz: string;
  selectedId: string | null;
  onSelectEvent: (id: string) => void;
  onOpenDay: (dateKey: string) => void;
}) {
  const byDay = React.useMemo(() => groupEventsByDay(events, tz), [events, tz]);
  return (
    <TimeGrid
      days={days}
      todayKey={todayKey}
      eventsByDay={byDay}
      eventKinds={eventKinds}
      tz={tz}
      selectedId={selectedId}
      onSelectEvent={onSelectEvent}
      onOpenDay={onOpenDay}
    />
  );
}
