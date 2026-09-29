"use client";

import { useDraggable } from "@dnd-kit/core";
import { Circle, CheckCircle2, CircleX, HelpCircle } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { isDerivedEvent } from "@/lib/domain/calendar-shared";
import { formatInTz } from "@/lib/utils/datetime";
import { kindTagClass } from "./shared";

const STATUS_ICON = {
  planned: Circle,
  done: CheckCircle2,
  canceled: CircleX,
} as const;

/**
 * 격자 칸 안의 한 줄짜리 일정 칩. 색(kind) 하나에만 기대지 않도록 상태 아이콘을 함께 넣는다.
 * `canDrag`(=쓰기 권한)이면 dnd-kit useDraggable로 끌 수 있다 — 파생 일정(원 업무에서 만들어짐)은
 * canDrag와 무관하게 항상 잠금(수정은 원 업무에서만). mode="date": 날짜만 바뀌고 시각은 유지
 * (월 보기 칸, 주/일 보기의 "종일" 줄에서 쓴다 — 시간축 칸은 TimeGrid의 자체 드래그를 쓴다).
 */
export function EventChip({
  event,
  eventKinds,
  tz,
  selected,
  onClick,
  canDrag = false,
}: {
  event: CalendarEvent;
  eventKinds: { kind: string; label: string }[];
  tz: string;
  selected?: boolean;
  onClick: () => void;
  canDrag?: boolean;
}) {
  const StatusIcon = STATUS_ICON[event.status as keyof typeof STATUS_ICON] ?? HelpCircle;
  const derived = isDerivedEvent(event);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { event, mode: "date" as const },
    disabled: !canDrag || derived,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      title={
        derived
          ? `${event.title} — 원 업무에서 만든 일정(여기서 옮길 수 없음)`
          : `${event.title} — ${event.allDay ? "종일" : formatInTz(event.startsAt as string, tz, "HH:mm")}`
      }
      className={cn(
        // F21(axe target-size): .ev-tag 는 22px 라 WCAG 2.5.8 최소 24px 에 못 미쳤다(칩이 2px 간격으로 붙어 spacing 예외도 없음).
        // D2: 휴대폰(<640) 월 칸은 안쪽 폭 약 44px — 아이콘·시간이 자리를 먼저 차지해 제목이 0px 였다.
        // 휴대폰은 제목만 두 줄(28px 이상), 좁은 padding. 태블릿(<1024, 칸 약 110px)도 시간을 숨겨 제목("여성 커트")이 한 줄에 들어간다.
        // 시간·상태는 칩을 눌러 여는 상세와 title 로 본다. D2·D11
        "ev-tag flex min-h-[24px] w-full min-w-0 items-center gap-1 text-left max-sm:min-h-[28px] max-sm:px-1",
        kindTagClass(event.kind, eventKinds),
        selected && "outline outline-2 outline-offset-1 outline-[var(--accent)]",
        canDrag && !derived && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      {...(canDrag && !derived ? { ...attributes, ...listeners } : {})}
    >
      <StatusIcon size={10} className="shrink-0 max-sm:hidden" aria-hidden />
      {!event.allDay && <span className="shrink-0 font-normal max-lg:hidden">{formatInTz(event.startsAt as string, tz, "HH:mm")}</span>}
      <span className={cn("min-w-0 truncate max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:break-keep max-sm:leading-[14px] max-sm:[overflow-wrap:anywhere]", event.status === "canceled" && "line-through")}>
        {event.title}
      </span>
    </button>
  );
}
