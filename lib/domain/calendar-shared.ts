/**
 * 캘린더 순수 로직 — 서버(Server Component/Action)와 클라이언트 컴포넌트 양쪽에서
 * 안전하게 import할 수 있다(next/headers 등 서버 전용 API를 절대 끌어들이지 않는다).
 *
 * DB 접근이 필요한 함수(listEvents 등)는 lib/domain/calendar.ts에 있다 — 그 파일은
 * getServerSupabase()(next/headers)를 쓰므로 클라이언트 컴포넌트에서 import하면
 * 빌드가 깨진다. 클라이언트 쪽 컴포넌트는 반드시 이 파일에서만 값을 가져온다.
 */
import {
  startOfDayInTz,
  endOfDayExclusiveInTz,
  addDaysToKey,
  addMonthsToKey,
  monthGrid,
  weekKeysContaining,
} from "@/lib/utils/datetime";

export type CalendarView = "month" | "week" | "day" | "list";

export interface CalendarEvent {
  id: string;
  businessId: string;
  kind: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  eventDate: string | null;
  assignee: string | null;
  status: string;
  sourceTable: string | null;
  sourceId: string | null;
  notes: string | null;
  recurrenceId: string | null;
  recurrenceRule: string | null;
  isException: boolean;
  createdAt: string;
  createdBy: string | null;
}

export interface RawRow {
  id: string;
  business_id: string;
  kind: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  event_date: string | null;
  assignee: string | null;
  status: string;
  source_table: string | null;
  source_id: string | null;
  notes: string | null;
  recurrence_id: string | null;
  recurrence_rule: string | null;
  is_exception: boolean;
  created_at: string;
  created_by: string | null;
}

export function mapRow(r: RawRow): CalendarEvent {
  return {
    id: r.id,
    businessId: r.business_id,
    kind: r.kind,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    eventDate: r.event_date,
    assignee: r.assignee,
    status: r.status,
    sourceTable: r.source_table,
    sourceId: r.source_id,
    notes: r.notes,
    recurrenceId: r.recurrence_id,
    recurrenceRule: r.recurrence_rule,
    isException: r.is_exception,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

/** 파생 일정(원 업무 레코드에서 만들어진 일정)인가 — 캘린더에서 임의로 못 고친다. */
export function isDerivedEvent(e: Pick<CalendarEvent, "sourceTable" | "sourceId">): boolean {
  return !!(e.sourceTable && e.sourceId);
}

/** 정렬·구간필터에 쓸 "효과적 시작 순간"(종일 이벤트는 tz 자정). */
export function effectiveStart(e: CalendarEvent, tz: string): string {
  return e.allDay ? startOfDayInTz(e.eventDate as string, tz) : (e.startsAt as string);
}

export interface MemberOption {
  userId: string;
  role: string;
  isSelf: boolean;
  /** crm.business_members(0016) 표시이름. 화면은 role·id 대신 이 값을 우선 보여준다(CLICK-PATH-210). */
  displayName?: string;
}

/**
 * 파생 일정의 원 업무 화면(CLICK-PATH-225). calendar_events.source_table → /w/{id}/{path}.
 * 트리거가 쓰는 source_table 값(0007/0010/0011/0012)과 1:1. 새 파생 원천을 추가하면 여기도 추가한다.
 */
export const SOURCE_TABLE_NAV: Readonly<Record<string, string>> = {
  us_tasks: "tasks",
  salon_appointments: "services",
  acad_sessions: "timetable",
  factory_orders: "orders",
};

export function sourceNavPath(businessId: string, sourceTable: string | null | undefined): string | null {
  const seg = sourceTable ? SOURCE_TABLE_NAV[sourceTable] : undefined;
  return seg ? `/w/${businessId}/${seg}` : null;
}

export const STATUS_OPTIONS = [
  { value: "planned", label: "예정" },
  { value: "done", label: "완료" },
  { value: "canceled", label: "취소" },
] as const;

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

/** 보기(월/주/일/목록) + 기준 날짜 키로부터 조회 구간과 그리드 날짜들을 계산한다. */
export function computeRange(
  view: CalendarView,
  dateKey: string,
  tz: string
): { from: string; to: string; days: string[] } {
  if (view === "day") {
    return { from: startOfDayInTz(dateKey, tz), to: endOfDayExclusiveInTz(dateKey, tz), days: [dateKey] };
  }
  if (view === "week") {
    const days = weekKeysContaining(dateKey);
    return {
      from: startOfDayInTz(days[0], tz),
      to: endOfDayExclusiveInTz(days[days.length - 1], tz),
      days,
    };
  }
  // month, list: 같은 월 그리드(42칸)를 데이터 구간으로 쓴다.
  const [y, m] = dateKey.split("-").map(Number);
  const days = monthGrid(y, m, tz).flat();
  return {
    from: startOfDayInTz(days[0], tz),
    to: endOfDayExclusiveInTz(days[days.length - 1], tz),
    days,
  };
}

export function shiftDateKey(view: CalendarView, dateKey: string, direction: 1 | -1): string {
  if (view === "day") return addDaysToKey(dateKey, direction);
  if (view === "week") return addDaysToKey(dateKey, direction * 7);
  return addMonthsToKey(dateKey, direction);
}
