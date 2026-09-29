/**
 * 값 정규화: 헤더 문자열, 금액(원), 날짜(YYYY-MM-DD), 기간(YYYY-MM), 호실 키.
 */

import { localDateTimeToUtcIso } from "@/lib/utils/datetime";

/** 헤더 비교용 정규화: 공백/기호 제거, 소문자화, 괄호 안 단위 제거. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\([^)]*\)/g, "") // 사용량(kWh) → 사용량
    .replace(/[\s\-_./·:,]/g, "")
    .toLowerCase();
}

/** 문자열 해시(FNV-1a 32bit) — 저장용 지문. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function fingerprint(headers: string[]): string {
  return fnv1a(headers.map(normalizeHeader).join("|"));
}

/** "1,000원", "(1,000)", "-1000", "1000-" 등을 정수 KRW로. 파싱 불가면 null. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "-") return null;
  let negative = false;
  let body = s;
  if (/^\(.*\)$/.test(body)) {
    negative = true;
    body = body.slice(1, -1);
  }
  if (body.endsWith("-")) {
    negative = true;
    body = body.slice(0, -1);
  }
  if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  }
  body = body.replace(/원/g, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(body)) return null;
  const n = Math.round(Number(body));
  return negative ? -n : n;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** 엑셀 일련번호, yyyy.mm.dd / yyyy-mm-dd / yy/mm/dd / yyyy-mm 등을 YYYY-MM-DD로. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // 엑셀 날짜 일련번호(순수 숫자, 대략 1900~2100년 범위)
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 80000) {
      const ms = EXCEL_EPOCH_MS + serial * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  const m1 = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(s);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;

  const m2 = /^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(s);
  if (m2) return `20${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;

  const m3 = /^(\d{4})[.\-/](\d{1,2})$/.exec(s);
  if (m3) return `${m3[1]}-${m3[2].padStart(2, "0")}-01`;

  return null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const validYmd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const DT_RE = /^(?:(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})|(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})|(\d{1,2})[.\-/](\d{1,2}))\.?(?:[\sT]+(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM|오전|오후)?)?$/i;

/**
 * 은행 거래일시 → 사업장 현지 벽시계 문자열 "YYYY-MM-DD HH:mm[:ss]"(시각 없으면 "YYYY-MM-DD"). 못 읽으면 null.
 * 받는 형식: 2026-09-01 14:23:05 · 2026/09/01 14:23 · 2026.09.01 오후 2:23:05 · 20260901142305 · 202609011423 · 20260901
 * · 09-01 14:23(연도 없음: ref 기준 가장 가까운 과거, ref 보다 31일 넘게 앞서면 전년) · 엑셀 일련번호(소수부=시각).
 * 시간대 표시(Z, +09:00)는 읽지 않는다(null). 어느 시간대인지 몰라 사업장 시각으로 잘못 넣는 것보다 건너뛰게 한다.
 * ref 는 YYYY-MM-DD(기본 오늘).
 */
export function parseDateTime(raw: string, ref: string = new Date().toISOString().slice(0, 10)): string | null {
  const s = raw.trim();
  if (!s) return null;
  const fmt = (y: number, mo: number, d: number, time: [number, number, number | null] | null): string | null => {
    if (!validYmd(y, mo, d)) return null;
    const date = `${y}-${pad2(mo)}-${pad2(d)}`;
    if (!time) return date;
    const [h, mi, se] = time;
    if (h > 23 || mi > 59 || (se ?? 0) > 59) return null;
    return `${date} ${pad2(h)}:${pad2(mi)}${se === null ? "" : `:${pad2(se)}`}`;
  };

  const c = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?$/.exec(s);
  if (c) return fmt(+c[1], +c[2], +c[3], c[4] ? [+c[4], +c[5], c[6] ? +c[6] : null] : null);

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial <= 20000 || serial >= 80000) return null;
    const iso = new Date(EXCEL_EPOCH_MS + Math.round(serial * 86400) * 1000).toISOString();
    return Number.isInteger(serial) ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  }

  const m = DT_RE.exec(s);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if (m[4]) { y = 2000 + +m[4]; mo = +m[5]; d = +m[6]; }
  else {
    mo = +m[7]; d = +m[8]; y = +ref.slice(0, 4);
    if (Date.UTC(y, mo - 1, d) - Date.parse(`${ref}T00:00:00Z`) > 31 * 86400000) y -= 1;
  }
  let time: [number, number, number | null] | null = null;
  if (m[10] !== undefined) {
    let h = +m[10];
    const ap = (m[9] ?? m[13] ?? "").toUpperCase();
    if (ap) {
      if (h < 1 || h > 12) return null;
      const pm = ap === "PM" || ap === "오후";
      h = pm ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
    }
    time = [h, +m[11], m[12] ? +m[12] : null];
  }
  return fmt(y, mo, d, time);
}

/** parseDateTime 결과(현지 벽시계)를 사업장 시간대 기준 UTC ISO 로. 시각이 없으면 12:00(수기 입금 등록과 같은 기준). 못 읽으면 null. */
export function txnLocalToIso(local: string, tz: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(local);
  if (!m) return null;
  try { return new Date(Date.parse(localDateTimeToUtcIso(m[1], m[2] ?? "12:00", tz)) + (m[3] ? Number(m[3]) * 1000 : 0)).toISOString(); } catch { return null; }
}

/** "2026.08", "2026-08-01~2026-08-31", "26년 8월" 등 → "2026-08". */
export function normalizePeriod(raw: string): string | null {
  const s = raw.trim();
  const m1 = /(\d{4})[.\-년\s]*(\d{1,2})/.exec(s);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}`;
  const m2 = /(\d{2})[.\-년\s]*(\d{1,2})월/.exec(s);
  if (m2) return `20${m2[1]}-${m2[2].padStart(2, "0")}`;
  return null;
}

export type RoomMatchType = "exact" | "fuzzy" | "none";

/** "101호", "1-101", "B101", "지하1층 101" 등을 비교 가능한 키로 통일. */
export function normalizeRoomRaw(raw: string): string {
  let s = raw.trim().toUpperCase();
  s = s.replace(/지하\s*(\d*)\s*층?/g, (_, n: string) => `B${n || "1"}`);
  s = s.replace(/[호실세대]/g, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/[-.]/g, "-");
  return s;
}

export interface RoomMatchResult {
  key: string;
  matchType: RoomMatchType;
  matched?: string;
}

/** 알려진 호실 목록과 정확/유사(끝자리 일치)/불일치를 구분한다. */
export function matchRoom(raw: string, knownRooms?: string[]): RoomMatchResult {
  const key = normalizeRoomRaw(raw);
  if (!knownRooms || knownRooms.length === 0) return { key, matchType: "none" };
  const normalizedKnown = knownRooms.map((r) => ({ orig: r, norm: normalizeRoomRaw(r) }));
  const exact = normalizedKnown.find((k) => k.norm === key);
  if (exact) return { key, matchType: "exact", matched: exact.orig };
  // 퍼지: 숫자만 뽑아 끝자리(호실번호)가 같으면 유사
  const digits = key.replace(/\D/g, "");
  const fuzzy = normalizedKnown.find((k) => {
    const kd = k.norm.replace(/\D/g, "");
    return digits.length > 0 && kd.length > 0 && kd.slice(-3) === digits.slice(-3);
  });
  if (fuzzy) return { key, matchType: "fuzzy", matched: fuzzy.orig };
  return { key, matchType: "none" };
}
