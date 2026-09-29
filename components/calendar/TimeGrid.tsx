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
import { kindTagClass, formatEventTimeLabel, shortHolidayLabel } from "./shared";
import { useHolidayMap } from "@/lib/holidays";

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

  // D12: 주 보기 머리글에도 월 보기와 같은 공휴일 표시(빨간 날짜 + 이름). 이름 줄은 휴대폰에서 자리를 미리 잡아(14px) 도착해도 높이가 안 변한다.
  const holidayMap = useHolidayMap(days);

  const allDayByDay = React.useMemo(
    () => new Map(days.map((d) => [d, (eventsByDay.get(d) ?? []).filter((e) => e.allDay)])),
    [days, eventsByDay]
  );
  const hasAnyAllDay = Array.from(allDayByDay.values()).some((v) => v.length > 0);

  // 시간축 폭: 휴대폰 44px, sm 이상 56px — CSS 변수라 SSR/CSR 차이가 없다.
  // 주 보기(7열)는 <640 에서 열 최소폭 96px 을 두고 가로 스크롤한다(검토 P2: 40px 열은 "11…/남…" 만 보였다).
  // 시간축·모서리·종일 칸은 sticky left 로 남겨 어느 열을 보든 시각을 읽을 수 있다.
  const gridTemplateColumns = `var(--gutter) repeat(${days.length}, minmax(var(--col-min), 1fr))`;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    // 가로 스크롤이 생겼을 때만 오늘(없으면 첫 열) 열이 시간축 바로 옆에 오도록 맞춘다.
    const box = scrollRef.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const col = box.querySelector<HTMLElement>("[data-today-col]");
    const gutter = box.querySelector<HTMLElement>("[data-gutter]");
    if (!col || !gutter) return;
    box.scrollLeft = col.getBoundingClientRect().left - box.getBoundingClientRect().left - gutter.offsetWidth + box.scrollLeft;
  }, [days]);
  const hideHourLabel = (h: number) => nowMinutes !== null && days.includes(todayKey) && Math.abs(h * 60 - nowMinutes) < 20 && h * 60 >= boundStartMin;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowFullDay(true)}
          className="shrink-0 border-b border-[var(--bd)] bg-sf2 px-3 py-1.5 text-left text-[12px] text-t2 hover:text-t"
        >
          비영업 시간에 일정 {hiddenCount}건이 더 있습니다 — 눌러서 전체 시간 보기
        </button>
      )}
      {showFullDay && (
        <button
          type="button"
          onClick={() => setShowFullDay(false)}
          className="shrink-0 border-b border-[var(--bd)] bg-sf2 px-3 py-1.5 text-left text-[12px] text-t2 hover:text-t"
        >
          영업시간({BUSINESS_START}–{BUSINESS_END}시)만 보기로 돌아가기
        </button>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className={cn("grid [--col-min:0px] [--gutter:44px] sm:[--gutter:56px]", days.length > 1 && "max-sm:[--col-min:96px]")}
          style={{ gridTemplateColumns }}
        >
          <div data-gutter className="sticky left-0 top-0 z-20 border-b border-[var(--bd)] bg-sf" />
          {days.map((d) => {
            const isToday = d === todayKey;
            const headerClass = cn(
              "sticky top-0 z-10 flex w-full min-w-0 flex-wrap items-center justify-center gap-x-1.5 border-b border-l border-[var(--bd)] bg-sf px-1 py-1.5 text-[12px] font-medium transition-colors duration-1 [@media(pointer:coarse)]:min-h-[44px]",
              isToday ? "text-[var(--accent-ink)]" : "text-t2",
              onOpenDay && "hover:bg-sf2"
            );
            // 주 보기: 요일은 작게, 날짜 숫자는 굵게(오늘은 accent 원). 일 보기(1열)는 전체 제목 그대로.
            const holiday = holidayMap[d];
            const label =
              days.length > 1 ? (
                <>
                  <span className="text-[12px] text-t3">{formatDayTitle(d).match(/\((.)\)/)?.[1] ?? ""}</span>
                  <span
                    className={cn(
                      "inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-full px-1 text-[13px] font-semibold tabular-nums",
                      isToday ? "bg-[var(--accent-strong)] text-[var(--accent-contrast)]" : holiday ? "text-et" : "text-t"
                    )}
                  >
                    {Number(d.slice(8, 10))}
                  </span>
                  {/* 이름은 항상 아래 줄 전폭 14px 고정 슬롯(비어도 유지 → 도착해도 CLS 0, 어느 폭에서도 줄바꿈 없음).
                      열이 좁은 <1024 는 짧은 이름("개천절(대체)"), 원래 이름은 aria-label. */}
                  <span className="h-[14px] basis-full truncate text-center text-[12px] font-medium leading-[14px] text-et" title={holiday}>
                    {holiday && (
                      <>
                        <span className="lg:hidden">{shortHolidayLabel(holiday)}</span>
                        <span className="max-lg:hidden">{holiday}</span>
                      </>
                    )}
                  </span>
                </>
              ) : (
                <>
                  {formatDayTitle(d)}
                  {isToday && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-strong)]" aria-hidden />}
                </>
              );
            const todayAttr = isToday || (!days.includes(todayKey) && d === days[0]) ? { "data-today-col": "" } : {};
            return onOpenDay ? (
              <button key={d} type="button" onClick={() => onOpenDay(d)} className={headerClass} aria-label={`${d}${holiday ? ` ${holiday}` : ""} 하루 보기로 이동`} {...todayAttr}>
                {label}
              </button>
            ) : (
              <div key={d} className={headerClass} {...todayAttr}>
                {label}
              </div>
            );
          })}

          {hasAnyAllDay && (
            <>
              <div className="sticky left-0 z-[3] border-b border-[var(--bd)] bg-sf px-1.5 py-1 text-right text-[12px] text-t3">종일</div>
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

          <div className="sticky left-0 z-[3] bg-sf" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute inset-x-0 -translate-y-1/2 pr-1.5 text-right text-[12px] tabular-nums text-t3"
                style={{ top: (h - startHour) * ROW_HEIGHT }}
              >
                {h === startHour || hideHourLabel(h) ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
            {nowMinutes !== null && nowMinutes >= boundStartMin && nowMinutes < boundEndMin && days.includes(todayKey) && (
              <span
                className="absolute right-1 z-[2] -translate-y-1/2 rounded-[var(--r-xs)] bg-[var(--accent-strong)] px-1 text-[12px] font-semibold tabular-nums leading-[16px] text-[var(--accent-contrast)]"
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
                      // D3: 두 줄(시간 14px + 제목 16px + 여백 8px = 38px)이 안 들어가는 짧은 일정(30분=24px)은 한 줄 "10:50 남성 커트".
                      // 열이 좁은 <1024(96~136px)는 한 줄에 시간까지 못 넣어 제목만 — 시각은 시간축 위치가 말해 준다.
                      "ev-tag absolute justify-start gap-0 overflow-hidden rounded-[var(--r-sm)] border-l-[3px] border-l-current px-1.5 text-left leading-tight shadow-card transition-[box-shadow] duration-1 hover:shadow-raised",
                      height < 40 ? "flex-row items-center py-0" : "flex-col py-1 [&>span]:w-full [&>span]:shrink-0",
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
                    <span className={cn("block text-[12px] font-medium tabular-nums opacity-90", height < 40 ? "mr-1 shrink-0 max-lg:hidden" : "truncate")}>
                      {height < 40 ? formatEventTimeLabel(event, tz).split("–")[0] : formatEventTimeLabel(event, tz)}
                    </span>
                    <span className="block min-w-0 truncate font-semibold">{event.title}</span>
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
