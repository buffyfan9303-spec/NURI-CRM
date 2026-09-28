"use client";

/**
 * 주/일 보기 공용 시간축(§5.6): 영업시간 중심으로 시작하되 비영업 구간도 접근 가능,
 * 현재 시간선, 겹치는 일정의 나란한 배치. 데이터가 0건이어도 이 격자 자체는 항상 그려진다
 * (결함 #1과 같은 종류의 "빈 결과=빈 화면" 치환을 만들지 않는다).
 */
import * as React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/lib/domain/calendar-shared";
import { isDerivedEvent } from "@/lib/domain/calendar-shared";
import { formatInTz, formatDayTitle } from "@/lib/utils/datetime";
import { EventChip } from "./EventChip";
import { kindTagClass, formatEventTimeLabel } from "./shared";

/** px / 1시간. CalendarClient의 onDragEnd가 세로 픽셀 이동량을 분 단위로 환산할 때 같은 값을 쓴다. */
export const ROW_HEIGHT = 48;
// ponytail: 사업장별 영업시간 설정이 아직 없어 고정값을 쓴다. crm.businesses에 영업시간
// 컬럼이 생기면 여기 상수 대신 그 값을 props로 받아 대체한다.
const BUSINESS_START = 8;
const BUSINESS_END = 20;

function minutesOfDay(iso: string, tz: string): number {
  return Number(formatInTz(iso, tz, "HH")) * 60 + Number(formatInTz(iso, tz, "mm"));
}

interface Positioned {
  event: CalendarEvent;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/**
 * 겹치는 시간대 일정을 나란한 레인에 배치한다.
 * ponytail: 첫 빈 레인에 그리디 배치 — 폭을 최소로 재분배하는 최적 패킹은 아니지만
 * 하루 안에서 실제로 겹치는 일정 수(보통 한 자릿수)에서는 결과 차이가 거의 없다.
 * 자리 배분이 눈에 띄게 어색해지면 구간 그래프 채색 알고리즘으로 교체.
 */
function layoutDay(dayEvents: CalendarEvent[], tz: string, boundStart: number, boundEnd: number): Positioned[] {
  const items = dayEvents
    .filter((e) => !e.allDay && e.startsAt)
    .map((e) => {
      const s = minutesOfDay(e.startsAt as string, tz);
      const eMin = e.endsAt ? minutesOfDay(e.endsAt, tz) : s + 30;
      return { event: e, start: Math.max(s, boundStart), end: Math.min(Math.max(eMin, s + 15), boundEnd) };
    })
    .filter((x) => x.end > boundStart && x.start < boundEnd && x.end > x.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds: number[] = [];
  const placed: { event: CalendarEvent; start: number; end: number; lane: number }[] = [];
  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    placed.push({ ...item, lane });
  }
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({
    event: p.event,
    top: ((p.start - boundStart) / 60) * ROW_HEIGHT,
    height: Math.max(((p.end - p.start) / 60) * ROW_HEIGHT, 20),
    lane: p.lane,
    lanes,
  }));
}

export function TimeGrid({
  days,
  todayKey,
  eventsByDay,
  eventKinds,
  tz,
  selectedId,
  onSelectEvent,
  onOpenDay,
  canDrag = false,
}: {
  /** 주 보기는 7개, 일 보기는 1개. */
  days: string[];
  todayKey: string;
  eventsByDay: Map<string, CalendarEvent[]>;
  eventKinds: { kind: string; label: string }[];
  tz: string;
  selectedId: string | null;
  onSelectEvent: (id: string) => void;
  /** 있으면 날짜 헤더를 눌러 하루 보기로 이동(주 보기에서만 사용). */
  onOpenDay?: (dateKey: string) => void;
  /** 쓰기 권한 — 있어야 시간대 칸에 일정을 끌어다 옮길 수 있다(파생 일정은 여전히 잠금). */
  canDrag?: boolean;
}) {
  const [showFullDay, setShowFullDay] = React.useState(false);
  const startHour = showFullDay ? 0 : BUSINESS_START;
  const endHour = showFullDay ? 24 : BUSINESS_END;
  const hours = React.useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const boundStartMin = startHour * 60;
  const boundEndMin = endHour * 60;
  const gridHeight = hours.length * ROW_HEIGHT;

  const hiddenCount = React.useMemo(() => {
    if (showFullDay) return 0;
    let n = 0;
    for (const key of days) {
      for (const e of eventsByDay.get(key) ?? []) {
        if (e.allDay || !e.startsAt) continue;
        const s = minutesOfDay(e.startsAt, tz);
        const eMin = e.endsAt ? minutesOfDay(e.endsAt, tz) : s + 30;
        if (eMin <= boundStartMin || s >= boundEndMin) n++;
      }
    }
    return n;
  }, [days, eventsByDay, showFullDay, boundStartMin, boundEndMin, tz]);

  // 현재 시각선 — tz 고정 유틸(formatInTz)만 사용, toLocaleString 직접 호출 금지 원칙 준수.
  const [nowMinutes, setNowMinutes] = React.useState<number | null>(null);
  React.useEffect(() => {
    function tick() {
      setNowMinutes(minutesOfDay(new Date().toISOString(), tz));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [tz]);

  const allDayByDay = React.useMemo(
    () => new Map(days.map((d) => [d, (eventsByDay.get(d) ?? []).filter((e) => e.allDay)])),
    [days, eventsByDay]
  );
  const hasAnyAllDay = Array.from(allDayByDay.values()).some((v) => v.length > 0);

  // 시간축 폭: 휴대폰 44px(360px 화면에서 7열이 45px 씩 나온다), sm 이상 56px — CSS 변수라 SSR/CSR 차이가 없다.
  const gridTemplateColumns = `var(--gutter) repeat(${days.length}, minmax(0, 1fr))`;
  const hideHourLabel = (h: number) => nowMinutes !== null && days.includes(todayKey) && Math.abs(h * 60 - nowMinutes) < 20 && h * 60 >= boundStartMin;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowFullDay(true)}
          className="shrink-0 border-b border-[var(--bd)] bg-sf2 px-3 py-1.5 text-left text-[11.5px] text-t2 hover:text-t"
        >
          비영업 시간에 일정 {hiddenCount}건이 더 있습니다 — 눌러서 전체 시간 보기
        </button>
      )}
      {showFullDay && (
        <button
          type="button"
          onClick={() => setShowFullDay(false)}
          className="shrink-0 border-b border-[var(--bd)] bg-sf2 px-3 py-1.5 text-left text-[11.5px] text-t2 hover:text-t"
        >
          영업시간({BUSINESS_START}–{BUSINESS_END}시)만 보기로 돌아가기
        </button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid [--gutter:44px] sm:[--gutter:56px]" style={{ gridTemplateColumns }}>
          <div className="sticky top-0 z-10 border-b border-[var(--bd)] bg-sf" />
          {days.map((d) => {
            const isToday = d === todayKey;
            const headerClass = cn(
              "sticky top-0 z-10 flex w-full items-center justify-center gap-1.5 border-b border-l border-[var(--bd)] bg-sf py-1.5 text-[12px] font-medium transition-colors duration-1 [@media(pointer:coarse)]:min-h-[44px]",
              isToday ? "text-[var(--accent-ink)]" : "text-t2",
              onOpenDay && "hover:bg-sf2"
            );
            // 주 보기: 요일은 작게, 날짜 숫자는 굵게(오늘은 accent 원). 일 보기(1열)는 전체 제목 그대로.
            const label =
              days.length > 1 ? (
                <>
                  <span className="text-[11px] text-t3">{formatDayTitle(d).match(/\((.)\)/)?.[1] ?? ""}</span>
                  <span
                    className={cn(
                      "inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-full px-1 text-[13px] font-semibold tabular-nums",
                      isToday ? "bg-[var(--accent-strong)] text-[var(--accent-contrast)]" : "text-t"
                    )}
                  >
                    {Number(d.slice(8, 10))}
                  </span>
                </>
              ) : (
                <>
                  {formatDayTitle(d)}
                  {isToday && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-strong)]" aria-hidden />}
                </>
              );
            return onOpenDay ? (
              <button key={d} type="button" onClick={() => onOpenDay(d)} className={headerClass} aria-label={`${d} 하루 보기로 이동`}>
                {label}
              </button>
            ) : (
              <div key={d} className={headerClass}>
                {label}
              </div>
            );
          })}

          {hasAnyAllDay && (
            <>
              <div className="border-b border-[var(--bd)] px-1.5 py-1 text-right text-[10px] text-t3">종일</div>
              {days.map((d) => (
                <AllDayCell key={`ad-${d}`} dateKey={d} canDrag={canDrag}>
                  {(allDayByDay.get(d) ?? []).map((ev) => (
                    <EventChip
                      key={ev.id}
                      event={ev}
                      eventKinds={eventKinds}
                      tz={tz}
                      selected={ev.id === selectedId}
                      onClick={() => onSelectEvent(ev.id)}
                      canDrag={canDrag}
                    />
                  ))}
                </AllDayCell>
              ))}
            </>
          )}

          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute inset-x-0 -translate-y-1/2 pr-1.5 text-right text-[11px] tabular-nums text-t3"
                style={{ top: (h - startHour) * ROW_HEIGHT }}
              >
                {h === startHour || hideHourLabel(h) ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
            {nowMinutes !== null && nowMinutes >= boundStartMin && nowMinutes < boundEndMin && days.includes(todayKey) && (
              <span
                className="absolute right-1 z-[2] -translate-y-1/2 rounded-[var(--r-xs)] bg-[var(--accent-strong)] px-1 text-[10px] font-semibold tabular-nums leading-[16px] text-[var(--accent-contrast)]"
                style={{ top: ((nowMinutes - boundStartMin) / 60) * ROW_HEIGHT }}
                aria-hidden
              >
                {String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:{String(nowMinutes % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          {days.map((d) => {
            const positioned = layoutDay(eventsByDay.get(d) ?? [], tz, boundStartMin, boundEndMin);
            const showNowLine =
              d === todayKey && nowMinutes !== null && nowMinutes >= boundStartMin && nowMinutes < boundEndMin;
            return (
              <TimeColumn key={d} dateKey={d} height={gridHeight} canDrag={canDrag}>
                {hours.map((h) => (
                  <React.Fragment key={h}>
                    <div className="absolute inset-x-0 border-t border-[var(--bd)]" style={{ top: (h - startHour) * ROW_HEIGHT }} />
                    {/* 30분 보조선(점선) — Cal.com 주 보기와 같은 위계. */}
                    <div className="absolute inset-x-0 border-t border-dashed border-[var(--bd)]" style={{ top: (h - startHour) * ROW_HEIGHT + ROW_HEIGHT / 2 }} />
                  </React.Fragment>
                ))}
                {showNowLine && (
                  <div
                    className="absolute inset-x-0 z-10 flex items-center"
                    style={{ top: ((nowMinutes as number) - boundStartMin) / 60 * ROW_HEIGHT }}
                    aria-hidden
                  >
                    <span className="-ml-[3px] h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent-strong)]" />
                    <span className="h-px flex-1 bg-[var(--accent-strong)]" />
                  </div>
                )}
                {positioned.map(({ event, top, height, lane, lanes }) => (
                  <TimeEventButton
                    key={event.id}
                    event={event}
                    onClick={() => onSelectEvent(event.id)}
                    title={`${event.title} — ${formatEventTimeLabel(event, tz)}`}
                    canDrag={canDrag}
                    className={cn(
                      "ev-tag absolute flex-col justify-start gap-0 overflow-hidden [&>span]:w-full rounded-[var(--r-sm)] border-l-[3px] border-l-current px-1.5 py-1 text-left leading-tight shadow-card transition-[box-shadow] duration-1 hover:shadow-raised",
                      kindTagClass(event.kind, eventKinds),
                      event.id === selectedId && "outline outline-2 outline-offset-1 outline-[var(--accent)]"
                    )}
                    style={{
                      top,
                      height,
                      left: `calc(${(100 / lanes) * lane}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    <span className="block truncate text-[11px] font-medium tabular-nums opacity-90">{formatEventTimeLabel(event, tz)}</span>
                    <span className="block truncate font-semibold">{event.title}</span>
                  </TimeEventButton>
                ))}
              </TimeColumn>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** "종일" 줄의 하루 칸 — 드롭 대상 id `allday:${dateKey}`(날짜만 바뀜, CalendarClient가 접두사로 판정). */
function AllDayCell({ dateKey, canDrag, children }: { dateKey: string; canDrag: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${dateKey}`, disabled: !canDrag });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-0.5 border-b border-l border-[var(--bd)] p-1",
        isOver && canDrag && "bg-ib ring-1 ring-inset ring-[var(--accent)]"
      )}
    >
      {children}
    </div>
  );
}

/** 시간축 하루 컬럼 — 드롭 대상 id `day:${dateKey}`(날짜+시각 모두 바뀜). */
function TimeColumn({
  dateKey,
  height,
  canDrag,
  children,
}: {
  dateKey: string;
  height: number;
  canDrag: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dateKey}`, disabled: !canDrag });
  return (
    <div
      ref={setNodeRef}
      className={cn("relative border-l border-[var(--bd)]", isOver && canDrag && "bg-ib")}
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * 시간대에 배치된 일정 버튼. mode="time"이라 CalendarClient의 onDragEnd가 세로 이동 픽셀을
 * 분 단위로 환산해 시각을 바꾼다(칼럼이 바뀌면 날짜도 함께 바뀐다). 파생 일정은 항상 잠금.
 */
function TimeEventButton({
  event,
  onClick,
  title,
  canDrag,
  className,
  style,
  children,
}: {
  event: CalendarEvent;
  onClick: () => void;
  title: string;
  canDrag: boolean;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const derived = isDerivedEvent(event);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { event, mode: "time" as const },
    disabled: !canDrag || derived,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      title={derived ? `${title}（원 업무에서 만든 일정 — 여기서 옮길 수 없음）` : title}
      className={cn(className, canDrag && !derived && "cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
      style={style}
      {...(canDrag && !derived ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </button>
  );
}
