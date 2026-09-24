/**
 * 월간 캘린더.
 * 기존 .cal-card/.cal-grid 디자인 1:1.
 *   - 요일 헤더 (일~토, 일/토 색)
 *   - 이전·다음 달 날짜는 회색 + 비활성
 *   - today: 네이비 원형 (DEMO_TODAY)
 *   - selected: 파랑 사각 배경 (today 와 겹치면 today 우선)
 *   - has-event: 하단 골드 점
 */
"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";

interface CalendarProps {
  year: number;
  month: number; // 1-12
  selectedDay: number;
  onSelectDay: (day: number) => void;
  eventDays: number[];
  todayYear: number;
  todayMonth: number; // 1-12
  todayDay: number;
}

interface DayCell {
  day: number;
  otherMonth: boolean;
}

function generateCells(year: number, month0: number): DayCell[] {
  const firstDay = new Date(year, month0, 1);
  const lastDay = new Date(year, month0 + 1, 0);
  const firstDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const prevMonthLastDay = new Date(year, month0, 0).getDate();

  const cells: DayCell[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    cells.push({ day: prevMonthLastDay - i, otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, otherMonth: false });
  }
  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - firstDayOfWeek - daysInMonth + 1;
    cells.push({ day: nextDay, otherMonth: true });
  }
  return cells;
}

const DAY_HEADERS = [
  { label: "일", colorClass: "text-[#c8564a]" },
  { label: "월", colorClass: "text-t3" },
  { label: "화", colorClass: "text-t3" },
  { label: "수", colorClass: "text-t3" },
  { label: "목", colorClass: "text-t3" },
  { label: "금", colorClass: "text-t3" },
  { label: "토", colorClass: "text-[#1840a0]" },
];

export function Calendar({
  year,
  month,
  selectedDay,
  onSelectDay,
  eventDays,
  todayYear,
  todayMonth,
  todayDay,
}: CalendarProps) {
  const cells = useMemo(() => generateCells(year, month - 1), [year, month]);
  const eventSet = useMemo(() => new Set(eventDays), [eventDays]);
  const isCurrentMonth = year === todayYear && month === todayMonth;

  return (
    <div className="bg-sf border border-bd rounded-xl p-5 shadow-card">
      <div className="flex items-start justify-between mb-[18px]">
        <div>
          <div className="text-[17px] font-extrabold tracking-[-.3px]">
            {year}년 {month}월
          </div>
          <div className="text-[11px] text-t3 mt-0.5">● 일정 있는 날</div>
        </div>
        <div className="flex gap-1">
          <NavBtn>‹</NavBtn>
          <NavBtn>›</NavBtn>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center gap-y-0.5">
        {DAY_HEADERS.map((h, i) => (
          <div
            key={i}
            className={cn(
              "text-[10px] py-1 pb-1.5 font-bold",
              h.colorClass
            )}
          >
            {h.label}
          </div>
        ))}

        {cells.map((c, i) => {
          const isToday =
            !c.otherMonth && isCurrentMonth && c.day === todayDay;
          const isSelected = !c.otherMonth && c.day === selectedDay;
          const hasEvent = !c.otherMonth && eventSet.has(c.day);
          return (
            <button
              key={i}
              type="button"
              onClick={() => !c.otherMonth && onSelectDay(c.day)}
              disabled={c.otherMonth}
              className={cn(
                "text-[13px] py-2 cursor-pointer relative rounded-[7px] transition-colors min-h-[34px] flex items-center justify-center leading-none",
                c.otherMonth
                  ? "text-t3 cursor-default"
                  : "text-t2 hover:bg-sf3 hover:text-t",
                isToday &&
                  "!bg-acc !text-white !rounded-full !w-[34px] !h-[34px] mx-auto font-extrabold",
                isSelected && !isToday && "!bg-ib !text-it font-bold"
              )}
            >
              {c.day}
              {hasEvent && (
                <span
                  className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full",
                    isToday ? "bg-white" : "bg-gold"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="w-7 h-7 border border-bd2 rounded-md bg-transparent text-t2 cursor-pointer text-[13px] flex items-center justify-center transition-colors hover:bg-sf2"
    >
      {children}
    </button>
  );
}
