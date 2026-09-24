/**
 * 시간 계약 유틸 (docs/crm-contract.md §4).
 *
 *  - 저장은 timestamptz(UTC), 표시는 사업장 tz(기본 Asia/Seoul).
 *  - 날짜 전용 값(all_day 이벤트의 event_date)은 tz 변환을 절대 거치지 않는다 —
 *    변환하면 서쪽 tz에서 "전날로 밀리는" 버그가 난다.
 *  - 기간은 [start, end) 반개구간으로 통일한다.
 *
 * 구현 메모(왜 date-fns의 addDays/addMonths를 안 쓰는가):
 *   date-fns의 Date 조작 함수(addDays, addMonths, setDate …)는 전부 Date의
 *   "로컬" getter/setter(getDate/setDate 등)를 쓴다. 이 로컬 값은 Date 객체가
 *   아니라 **JS 엔진이 돌아가는 프로세스의 시스템 타임존**에 좌우된다. 즉 서버의
 *   OS 타임존이 UTC가 아니면 조용히 하루가 밀릴 수 있다. 그래서 날짜 키(YYYY-MM-DD)
 *   산술은 전부 Date.UTC()/getUTC*()만 사용해 시스템 타임존과 완전히 무관하게 만든다.
 *   date-fns는 실제 순간(instant) 두 개를 비교하는 순수 epoch 연산에만 쓴다
 *   (그 경우엔 시스템 타임존이 끼어들 여지가 없다).
 */
import { compareAsc } from "date-fns";

export const DEFAULT_TZ = "Asia/Seoul";

const DAY_MS = 86_400_000;
const WEEKDAY_KO_SHORT = ["일", "월", "화", "수", "목", "금", "토"] as const; // getUTCDay() 인덱스(0=일)

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/* ────────────────────────────────────────────────────────────
   날짜 키(YYYY-MM-DD) 저수준 유틸 — Date.UTC/getUTC*만 사용
   ──────────────────────────────────────────────────────────── */

export function isValidDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseDateKey(dateKey: string): { y: number; m: number; d: number } {
  if (!isValidDateKey(dateKey)) throw new Error(`잘못된 날짜 키: ${dateKey}`);
  const [y, m, d] = dateKey.split("-").map(Number);
  return { y, m, d };
}

function epochToDateKeyUTC(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function dateKeyToEpochUTC(dateKey: string): number {
  const { y, m, d } = parseDateKey(dateKey);
  return Date.UTC(y, m - 1, d);
}

/** 날짜 키에 N일을 더한다(시스템 타임존 영향 없음). */
export function addDaysToKey(dateKey: string, n: number): string {
  return epochToDateKeyUTC(dateKeyToEpochUTC(dateKey) + n * DAY_MS);
}

/** 날짜 키에 N개월을 더한다. 말일 보정(예: 1/31 + 1개월 → 2/28). */
export function addMonthsToKey(dateKey: string, n: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12; // 0-11
  const daysInTargetMonth = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, daysInTargetMonth);
  return `${pad(ny, 4)}-${pad(nm + 1)}-${pad(nd)}`;
}

/** dateKey를 포함하는 주(월요일 시작) 7개 날짜 키. */
export function weekKeysContaining(dateKey: string): string[] {
  const epoch = dateKeyToEpochUTC(dateKey);
  const weekday = new Date(epoch).getUTCDay(); // 0=일..6=토
  const mondayOffsetDays = (weekday + 6) % 7; // 월요일까지 며칠 전인지
  const mondayEpoch = epoch - mondayOffsetDays * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => epochToDateKeyUTC(mondayEpoch + i * DAY_MS));
}

/**
 * 월 달력 6주(42칸) 그리드. 월요일 시작으로 고정한다(요구사항: "일관되게").
 * tz는 그리드 자체의 날짜 산술에는 필요 없다(달력 날짜는 순간이 아니다) —
 * "오늘이 어느 tz 날짜인가"는 호출부가 todayKeyInTz()로 별도로 구한다.
 */
export function monthGrid(year: number, month: number, _tz: string): string[][] {
  void _tz;
  const firstOfMonthEpoch = Date.UTC(year, month - 1, 1);
  const firstWeekday = new Date(firstOfMonthEpoch).getUTCDay();
  const mondayOffsetDays = (firstWeekday + 6) % 7;
  const gridStartEpoch = firstOfMonthEpoch - mondayOffsetDays * DAY_MS;

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(epochToDateKeyUTC(gridStartEpoch + (w * 7 + d) * DAY_MS));
    }
    weeks.push(week);
  }
  return weeks;
}

/** "2026년 9월" — 날짜 키의 연/월에서 tz 변환 없이 바로 만든다. */
export function formatMonthTitle(dateKey: string): string {
  const { y, m } = parseDateKey(dateKey);
  return `${y}년 ${m}월`;
}

/** "9월 12일 (금)" — 날짜 키 자체의 요일(순간이 아님, tz 무관하게 확정적). */
export function formatDayTitle(dateKey: string): string {
  const { m, d } = parseDateKey(dateKey);
  const weekday = new Date(dateKeyToEpochUTC(dateKey)).getUTCDay();
  return `${m}월 ${d}일 (${WEEKDAY_KO_SHORT[weekday]})`;
}

export { WEEKDAY_KO_SHORT };

/* ────────────────────────────────────────────────────────────
   tz ↔ 순간(instant) 변환 — Intl.DateTimeFormat 기반
   ──────────────────────────────────────────────────────────── */

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
function getPartsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

/** epoch(ms) 순간이 tz에서 어떤 벽시계 값으로 보이는지. */
function zonedPartsFromEpoch(epochMs: number, tz: string): ZonedParts {
  const parts = getPartsFormatter(tz).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hourRaw = get("hour");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hourRaw === "24" ? 0 : Number(hourRaw), // 일부 로케일이 자정을 24로 표기
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function zonedParts(iso: string, tz: string): ZonedParts {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) throw new Error(`유효하지 않은 시각: ${iso}`);
  return zonedPartsFromEpoch(ms, tz);
}

/** 해당 epoch 순간에 tz가 UTC보다 몇 ms 앞서 있는지(예: Asia/Seoul → +9h). */
function tzOffsetMs(epochMs: number, tz: string): number {
  const p = zonedPartsFromEpoch(epochMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - epochMs;
}

/** tz 벽시계 값(연-월-일 시:분:초)을 실제 UTC epoch(ms)로 역변환한다. */
function zonedWallClockToUtcMs(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string
): number {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const offset1 = tzOffsetMs(guess, tz);
  let utc = guess - offset1;
  const offset2 = tzOffsetMs(utc, tz);
  if (offset2 !== offset1) utc = guess - offset2; // DST 전환 경계 보정(KST엔 없지만 범용성 위해)
  return utc;
}

/**
 * UTC 순간을 tz 벽시계 값을 담은 "가짜 UTC" Date로 바꾼다.
 * ⚠ 이 Date는 실제 순간이 아니다. 반드시 getUTC*() 로만 읽어라(로컬 getter 금지) —
 * 로컬 getter를 쓰면 실행 서버의 시스템 타임존이 다시 섞여 들어간다.
 */
export function toZoned(iso: string, tz: string): Date {
  const p = zonedParts(iso, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/** 'YYYY-MM-DD' — tz 자정 경계에서 전날/다음날로 밀리는 버그의 진원지. */
export function dayKeyInTz(iso: string, tz: string): string {
  const p = zonedParts(iso, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** tz 기준 오늘의 날짜 키. */
export function todayKeyInTz(tz: string): string {
  return dayKeyInTz(new Date().toISOString(), tz);
}

/** dateKey(tz 지역 날짜) 00:00:00의 UTC ISO 순간. */
export function startOfDayInTz(dateKey: string, tz: string): string {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(zonedWallClockToUtcMs(y, m, d, 0, 0, 0, tz)).toISOString();
}

/**
 * 폼 입력(날짜 키 + 'HH:mm')을 tz 기준으로 해석해 UTC ISO로 바꾼다.
 * 사용자가 사업장 tz의 벽시계로 시각을 입력하는 화면(일정 등록 폼)에서 쓴다.
 */
export function localDateTimeToUtcIso(dateKey: string, time: string, tz: string): string {
  const { y, m, d } = parseDateKey(dateKey);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`잘못된 시간 형식: ${time}`);
  const h = Number(match[1]);
  const mi = Number(match[2]);
  return new Date(zonedWallClockToUtcMs(y, m, d, h, mi, 0, tz)).toISOString();
}

/** [start, end) 반개구간의 배타적 끝 — 다음날 00:00:00. */
export function endOfDayExclusiveInTz(dateKey: string, tz: string): string {
  return startOfDayInTz(addDaysToKey(dateKey, 1), tz);
}

const TOKEN_RE = /yyyy|MM|M|dd|d|HH|H|hh|h|mm|ss|a|EEEE|EEE/g;

/** tz 벽시계 값을 간단한 토큰(yyyy/MM/dd/HH/mm/ss/a/EEE 등)으로 포맷한다. */
export function formatInTz(iso: string, tz: string, pattern: string): string {
  const p = zonedParts(iso, tz);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const map: Record<string, string> = {
    yyyy: pad(p.year, 4),
    MM: pad(p.month),
    M: String(p.month),
    dd: pad(p.day),
    d: String(p.day),
    HH: pad(p.hour),
    H: String(p.hour),
    hh: pad(hour12),
    h: String(hour12),
    mm: pad(p.minute),
    ss: pad(p.second),
    a: p.hour < 12 ? "오전" : "오후",
    EEEE: `${WEEKDAY_KO_SHORT[weekday]}요일`,
    EEE: WEEKDAY_KO_SHORT[weekday],
  };
  return pattern.replace(TOKEN_RE, (tok) => map[tok] ?? tok);
}

/* ────────────────────────────────────────────────────────────
   구간/이벤트 규칙
   ──────────────────────────────────────────────────────────── */

/** [aStart,aEnd) 와 [bStart,bEnd) 가 겹치는가. 끝점이 맞닿으면 겹치지 않는다. */
export function overlaps(
  aStart: string | number,
  aEnd: string | number,
  bStart: string | number,
  bEnd: string | number
): boolean {
  const toMs = (v: string | number) => (typeof v === "number" ? v : new Date(v).getTime());
  return toMs(aStart) < toMs(bEnd) && toMs(bStart) < toMs(aEnd);
}

/** 두 순간을 date-fns로 비교 — 이건 getTime() 기반이라 시스템 타임존과 무관하다. */
export function compareInstants(a: string, b: string): number {
  return compareAsc(new Date(a), new Date(b));
}

export interface EventDayKeyInput {
  allDay: boolean;
  eventDate: string | null;
  startsAt: string | null;
}

/**
 * 종일/시간 일정을 통일해 "이 이벤트가 표시되는 tz 날짜 키"를 구한다.
 * 종일 이벤트는 event_date를 그대로 쓴다 — tz 변환을 하면 안 된다(계약 §4).
 */
export function eventDayKey(event: EventDayKeyInput, tz: string): string {
  if (event.allDay) {
    if (!event.eventDate) throw new Error("all_day 이벤트에 event_date가 없습니다");
    return event.eventDate;
  }
  if (!event.startsAt) throw new Error("시간 이벤트에 starts_at이 없습니다");
  return dayKeyInTz(event.startsAt, tz);
}
