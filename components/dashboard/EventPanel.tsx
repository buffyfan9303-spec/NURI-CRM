/**
 * 일정 패널 — 선택된 날짜의 이벤트 목록.
 * 기존 .ev-panel/.ev-item 디자인 1:1.
 *
 *   - 빈 일정: 캘린더-off 아이콘 + 안내
 *   - 이벤트 클릭: onCustomerClick 호출 → 상세 패널 (Phase 1.6)
 */
"use client";

import { IconCalendarOff } from "@tabler/icons-react";
import { SEED_CALENDAR_EVENTS } from "@/lib/data/seed";
import { STATUS_EVENT_TAG } from "@/lib/constants/statusMaps";
import type { OrderStatus } from "@/types/order";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

interface EventPanelProps {
  year: number;
  month: number; // 1-12
  selectedDay: number;
  onCustomerClick?: (name: string) => void;
}

export function EventPanel({
  year,
  month,
  selectedDay,
  onCustomerClick,
}: EventPanelProps) {
  const events = SEED_CALENDAR_EVENTS[selectedDay] ?? [];
  const dayName =
    DAY_NAMES[new Date(year, month - 1, selectedDay).getDay()] ?? "";

  return (
    <div className="bg-sf border border-bd rounded-xl p-5 shadow-card flex flex-col">
      <div className="mb-3.5 pb-3 border-b border-bd">
        <div className="text-[9px] font-bold text-t3 uppercase tracking-[1px] mb-1">
          일정
        </div>
        <div className="text-[15px] font-bold text-t">
          {month}월 {selectedDay}일 ({dayName})
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-center text-t3 text-xs py-10 flex flex-col items-center gap-2">
          <IconCalendarOff size={28} className="text-bd2" />
          해당 날짜에 일정이 없습니다
        </div>
      ) : (
        <div>
          {events.map((e, i) => {
            const tag = STATUS_EVENT_TAG[e.type as OrderStatus] ?? "tg-ord";
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCustomerClick?.(e.name)}
                className="w-full text-left p-3 px-3.5 border border-bd rounded-[9px] mb-2 cursor-pointer transition-colors hover:bg-sf2 hover:border-bd2 last:mb-0 block"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-bold text-acc tracking-[-.1px]">
                    {e.name}
                  </span>
                  <span className={`ev-tag ${tag}`}>{e.type}</span>
                </div>
                <div className="text-xs text-t2 mb-1.5">{e.item}</div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="text-[11px] text-t2">
                    <span className="text-t3 mr-1 font-bold">주문일</span>
                    {e.ord}
                  </div>
                  <div className="text-[11px] text-t2">
                    <span className="text-t3 mr-1 font-bold">배송예정</span>
                    {e.del}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
