/**
 * 캘린더 화면 전용 표시 헬퍼(순수 함수). 새 색상은 추가하지 않고 globals.css에
 * 이미 있는 토큰(.tg-*, Badge)만 재사용한다.
 */
import type { BadgeKind } from "@/components/ui/Badge";
import type { CalendarEvent, MemberOption } from "@/lib/domain/calendar-shared";
import { sourceNavPath } from "@/lib/domain/calendar-shared";
import { formatInTz, eventDayKey } from "@/lib/utils/datetime";

/** 이벤트를 tz 날짜 키별로 묶는다(종일/시간 이벤트 공통 규칙은 eventDayKey가 담당). */
export function groupEventsByDay(events: CalendarEvent[], tz: string): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = eventDayKey({ allDay: e.allDay, eventDate: e.eventDate, startsAt: e.startsAt }, tz);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

/** 종류(kind)는 업종 eventKinds 순서대로 4색을 순환한다(기존 .ev-tag .tg-* 토큰). */
const TAG_CLASSES = ["tg-ord", "tg-ok", "tg-del", "tg-prod"] as const;

export function kindTagClass(kind: string, eventKinds: { kind: string }[]): string {
  const idx = eventKinds.findIndex((k) => k.kind === kind);
  return TAG_CLASSES[idx >= 0 ? idx % TAG_CLASSES.length : 0];
}

export function kindLabel(kind: string, eventKinds: { kind: string; label: string }[]): string {
  return eventKinds.find((k) => k.kind === kind)?.label ?? kind;
}

export function statusBadgeKind(status: string): BadgeKind {
  if (status === "done") return "success";
  if (status === "canceled") return "error";
  if (status === "planned") return "info";
  return "warning"; // 알 수 없는 상태값(파생 데이터 등) — 눈에 띄게 warning으로
}

export function memberLabel(userId: string | null, members: MemberOption[]): string {
  if (!userId) return "담당자 미지정";
  const m = members.find((x) => x.userId === userId);
  if (!m) return "알 수 없음";
  const name = m.displayName || userId.slice(0, 8);
  return m.isSelf ? `나 (${m.role})` : `${name} · ${m.role}`;
}

export function formatEventTimeLabel(e: CalendarEvent, tz: string): string {
  if (e.allDay) return "종일";
  const start = e.startsAt ? formatInTz(e.startsAt, tz, "HH:mm") : "--:--";
  if (!e.endsAt) return start;
  return `${start}–${formatInTz(e.endsAt, tz, "HH:mm")}`;
}

/**
 * 파생 일정의 원 업무로 가는 링크(CLICK-PATH-225). source_table → nav path 매핑은
 * lib/domain/calendar-shared.ts의 SOURCE_TABLE_NAV가 단일 출처다.
 */
export function sourceLinkPath(businessId: string, sourceTable: string | null): string | null {
  return sourceNavPath(businessId, sourceTable);
}
