"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { EventChip } from "./EventChip";
import { groupEventsByDay } from "./shared";

const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];
const MAX_VISIBLE = 3;

export function MonthView({
  days,
  monthKey,
  todayKey,
  events,
  eventKinds,
  tz,
  selectedId,
  onSelectEvent,
  onOpenDay,
  canCreate,
  onCreateDay,
}: {
  /** 42개 날짜 키 */
  days: string[];
  /** 'YYYY-MM' — 이번 달인지 판정용 */
  monthKey: string;
  todayKey: string;
  events: CalendarEvent[];
  eventKinds: { kind: string; label: string }[];
  tz: string;
  selectedId: string | null;
  onSelectEvent: (id: string) => void;
  onOpenDay: (dateKey: string) => void;
  /** 일정 등록 권한 — 있어야 빈 날짜 선택이 등록 폼으로 이어진다. */
  canCreate: boolean;
  /** §11-4: 빈 날짜 선택 → 그 날짜가 입력된 등록 폼. */
  onCreateDay: (dateKey: string) => void;
}) {
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = React.useState(() => Math.max(0, days.indexOf(todayKey)));

  const byDay = React.useMemo(() => groupEventsByDay(events, tz), [events, tz]);

  function moveFocus(next: number) {
    const clamped = Math.max(0, Math.min(days.length - 1, next));
    setFocusIdx(clamped);
    cellRefs.current[clamped]?.focus();
  }

  /** 이벤트가 있으면 하루 보기로, 없으면(§11-4) 그 날짜가 입력된 등록 폼으로. */
  function activateDay(idx: number) {
    const dateKey = days[idx];
    const hasEvents = (byDay.get(dateKey) ?? []).length > 0;
    if (!hasEvents && canCreate) onCreateDay(dateKey);
    else onOpenDay(dateKey);
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        moveFocus(idx + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(idx - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(idx + 7);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(idx - 7);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activateDay(idx);
        break;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-[var(--bd)] text-center text-[11.5px] font-medium text-t3">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((dateKey, idx) => {
          const inMonth = dateKey.slice(0, 7) === monthKey;
          const isToday = dateKey === todayKey;
          const isWeekend = idx % 7 >= 5; // 헤더 순서가 월..토(5)·일(6)
          const dayEvents = byDay.get(dateKey) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          const hasEvents = dayEvents.length > 0;
          const dayLabel = hasEvents || !canCreate ? `${dateKey} 하루 보기로 이동` : `${dateKey} 일정 등록`;
          return (
            <div
              key={dateKey}
              ref={(el) => {
                cellRefs.current[idx] = el;
              }}
              role="gridcell"
              tabIndex={idx === focusIdx ? 0 : -1}
              onFocus={() => setFocusIdx(idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onDoubleClick={() => onOpenDay(dateKey)}
              className={cn(
                "flex min-h-[92px] flex-col gap-1 border-b border-r border-[var(--bd)] p-1.5 outline-none",
                // §5.6 주말의 "작은" 명도 구분 — 새 색 추가 없이 기존 sf2(보조 영역) 토큰만 재사용한다.
                // 참고: 이 프로젝트의 색 토큰은 var(--x) 기반이라 bg-x/NN 같은 opacity modifier가
                // 실제로는 CSS를 생성하지 않는다(확인함) — 반드시 불투명 유틸 클래스만 쓸 것.
                (!inMonth || isWeekend) && "bg-sf2",
                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
              )}
            >
              <button
                type="button"
                onClick={() => activateDay(idx)}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-[12px]",
                  isToday ? "bg-[var(--accent-strong)] font-semibold text-[var(--accent-contrast)]" : "text-t2",
                  !inMonth && "text-t3"
                )}
                aria-label={dayLabel}
              >
                {Number(dateKey.slice(8, 10))}
              </button>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((ev) => (
                  <EventChip
                    key={ev.id}
                    event={ev}
                    eventKinds={eventKinds}
                    tz={tz}
                    selected={ev.id === selectedId}
                    onClick={() => onSelectEvent(ev.id)}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(dateKey)}
                    className="text-left text-[10.5px] font-medium text-t3 hover:text-t2"
                  >
                    +{overflow}개 더
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
