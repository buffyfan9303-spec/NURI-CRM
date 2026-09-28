"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { EventChip } from "./EventChip";
import { groupEventsByDay } from "./shared";
import { useHolidayMap } from "@/lib/holidays";

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
  /** 일정 등록 권한 — 있어야 빈 날짜 선택이 등록 폼으로 이어지고, 일정을 끌어서 옮길 수 있다(수동 일정만). */
  canCreate: boolean;
  /** §11-4: 빈 날짜 선택 → 그 날짜가 입력된 등록 폼. */
  onCreateDay: (dateKey: string) => void;
}) {
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = React.useState(() => Math.max(0, days.indexOf(todayKey)));

  const byDay = React.useMemo(() => groupEventsByDay(events, tz), [events, tz]);
  const holidayMap = useHolidayMap(days);

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

  // F21(axe aria-required-parent): gridcell 은 row → grid 안에 있어야 한다. CSS grid 배치는 그대로 두고
  // 주 단위 row 를 display:contents 로 끼운다(시각 변화 없음). 다른 업종 캘린더도 이 컴포넌트를 쓴다.
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="flex h-full flex-col" role="grid" aria-label="월간 달력">
      <div className="grid grid-cols-7 border-b border-[var(--bd)] text-center text-[11.5px] font-medium text-t3" role="row">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="py-2" role="columnheader">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {weeks.map((week, wi) => (
        <div key={wi} role="row" className="contents">
        {week.map((dateKey, di) => {
          const idx = wi * 7 + di;
          const inMonth = dateKey.slice(0, 7) === monthKey;
          const isToday = dateKey === todayKey;
          const isWeekend = idx % 7 >= 5; // 헤더 순서가 월..토(5)·일(6)
          const dayEvents = byDay.get(dateKey) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          const hasEvents = dayEvents.length > 0;
          const holidayLabel = holidayMap[dateKey];
          const dayLabel = `${hasEvents || !canCreate ? `${dateKey} 하루 보기로 이동` : `${dateKey} 일정 등록`}${holidayLabel ? `, ${holidayLabel}` : ""}`;
          return (
            <MonthCell
              key={dateKey}
              dateKey={dateKey}
              idx={idx}
              focused={idx === focusIdx}
              setCellRef={(el) => {
                cellRefs.current[idx] = el;
              }}
              onFocus={() => setFocusIdx(idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onCellClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                activateDay(idx);
              }}
              onDoubleClick={() => onOpenDay(dateKey)}
              canDrag={canCreate}
              ariaLabel={`${dateKey}${holidayLabel ? ` ${holidayLabel}` : ""}${hasEvents ? ` 일정 ${dayEvents.length}건` : ""}`}
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
                  // html{font-size:14px} 라 h-6 은 21px 였다 — px 로 24px(WCAG 2.5.8 최소), 터치 화면은 28px(칸 전체가 같은 동작).
                  "flex h-[24px] w-[24px] shrink-0 items-center justify-center self-start rounded-full text-[12px] [@media(pointer:coarse)]:h-[28px] [@media(pointer:coarse)]:w-[28px]",
                  isToday ? "bg-[var(--accent-strong)] font-semibold text-[var(--accent-contrast)]" : holidayLabel ? "text-et" : "text-t2",
                  !inMonth && "text-t3"
                )}
                aria-label={dayLabel}
              >
                {Number(dateKey.slice(8, 10))}
              </button>
              {holidayLabel && (
                <span className="-mt-0.5 block truncate text-[10.5px] font-medium leading-tight text-et" title={holidayLabel}>
                  {holidayLabel}
                </span>
              )}
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((ev) => (
                  <EventChip
                    key={ev.id}
                    event={ev}
                    eventKinds={eventKinds}
                    tz={tz}
                    selected={ev.id === selectedId}
                    onClick={() => onSelectEvent(ev.id)}
                    canDrag={canCreate}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(dateKey)}
                    className="min-h-[24px] text-left text-[11px] font-medium text-t3 hover:text-t2"
                  >
                    +{overflow}개 더
                  </button>
                )}
              </div>
            </MonthCell>
          );
        })}
        </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 날짜 칸 하나. useDroppable은 컴포넌트당 한 번만 불러야 해서(hooks 규칙) .map 안에 바로
 * 못 쓰고 이 하위 컴포넌트로 뺐다 — 드롭 대상 id는 `day:${dateKey}`(TimeGrid 컬럼과 같은 규칙,
 * CalendarClient의 onDragEnd가 접두사로 구분한다).
 */
function MonthCell({
  dateKey,
  idx,
  focused,
  setCellRef,
  onFocus,
  onKeyDown,
  onCellClick,
  onDoubleClick,
  canDrag,
  ariaLabel,
  className,
  children,
}: {
  dateKey: string;
  idx: number;
  focused: boolean;
  setCellRef: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCellClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  canDrag: boolean;
  ariaLabel: string;
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dateKey}`, disabled: !canDrag });
  return (
    <div
      ref={(el) => {
        setCellRef(el);
        setNodeRef(el);
      }}
      role="gridcell"
      aria-label={ariaLabel}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={onCellClick}
      onDoubleClick={onDoubleClick}
      data-idx={idx}
      className={cn(className, isOver && canDrag && "bg-ib ring-1 ring-inset ring-[var(--accent)]")}
    >
      {children}
    </div>
  );
}
