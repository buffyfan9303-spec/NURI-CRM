"use client";

/**
 * 하루 보기. §5.6/§11-4 결함 수정: 예전엔 events.length===0이면 "일정 없음" 안내로 뷰
 * 전체를 대체했다(격자 자체가 없는 리스트 컴포넌트라 이 버그의 영향이 가장 컸다). 지금은
 * TimeGrid가 항상 시간축을 그리고, 0건이면 그냥 빈 시간축으로 남는다.
 */
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { TimeGrid } from "./TimeGrid";

export function DayView({
  days,
  todayKey,
  events,
  eventKinds,
  tz,
  selectedId,
  onSelectEvent,
}: {
  /** 1개(선택된 날짜). */
  days: string[];
  todayKey: string;
  events: CalendarEvent[];
  eventKinds: { kind: string; label: string }[];
  tz: string;
  selectedId: string | null;
  onSelectEvent: (id: string) => void;
}) {
  const eventsByDay = new Map([[days[0], events]]);
  return (
    <TimeGrid
      days={days}
      todayKey={todayKey}
      eventsByDay={eventsByDay}
      eventKinds={eventKinds}
      tz={tz}
      selectedId={selectedId}
      onSelectEvent={onSelectEvent}
    />
  );
}
