/**
 * 공휴일 단일 출처. `@hyunbinseo/holidays-kr`(우주항공청 월력요항, 대체공휴일 포함)를 기본으로 쓰고,
 * `KASI_SERVICE_KEY`가 있으면 서버에서만 천문연 특일 API(getRestDeInfo)로 임시공휴일을 보강한다.
 * 클라이언트·서버 어디서나 import 가능 — KASI 보강만 서버 전용(모듈 메모리 캐시).
 */
import * as React from "react";
import { getHolidayPreset } from "@hyunbinseo/holidays-kr";

type YearPreset = Readonly<Record<string, readonly string[]>>;

const presetCache = new Map<string, Promise<YearPreset>>();

function presetFor(year: string): Promise<YearPreset> {
  const cached = presetCache.get(year);
  if (cached) return cached;
  const p = getHolidayPreset(year).catch(() => ({}) as YearPreset);
  presetCache.set(year, p);
  return p;
}

/** KASI 특일 API 응답 한 달치. 서버에서만 호출·캐시(모듈 메모리, 프로세스 생존 동안 유지). */
const kasiCache = new Map<string, Promise<Record<string, string>>>();

async function kasiMonth(year: string, month: string): Promise<Record<string, string>> {
  const key = `${year}-${month}`;
  let p = kasiCache.get(key);
  if (p) return p;
  p = (async () => {
    const serviceKey = process.env.KASI_SERVICE_KEY;
    if (!serviceKey || typeof window !== "undefined") return {};
    try {
      const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${serviceKey}&solYear=${year}&solMonth=${month}&_type=json&numOfRows=100`;
      const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });
      if (!res.ok) return {};
      const json = await res.json();
      const items = json?.response?.body?.items?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      const out: Record<string, string> = {};
      for (const it of list) {
        if (it?.isHoliday !== "Y") continue;
        const d = String(it.locdate);
        const dateKey = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        out[dateKey] = it.dateName ?? "임시공휴일";
      }
      return out;
    } catch {
      return {};
    }
  })();
  kasiCache.set(key, p);
  return p;
}

/** 날짜 키(YYYY-MM-DD)의 공휴일 이름들(패키지+KASI 보강 병합, 중복 제거). 없으면 빈 배열. */
export async function holidayNames(dateKey: string): Promise<string[]> {
  const year = dateKey.slice(0, 4);
  const month = dateKey.slice(5, 7);
  const [preset, kasi] = await Promise.all([presetFor(year), kasiMonth(year, month)]);
  const names = new Set(preset[dateKey] ?? []);
  const kasiName = kasi[dateKey];
  if (kasiName) names.add(kasiName);
  return [...names];
}

/** 대표 이름 1개(뱃지용). 없으면 null. */
export async function holidayName(dateKey: string): Promise<string | null> {
  const names = await holidayNames(dateKey);
  return names[0] ?? null;
}

export async function isHoliday(dateKey: string): Promise<boolean> {
  return (await holidayNames(dateKey)).length > 0;
}

/** [startKey, endKey] 구간(양끝 포함)의 공휴일을 dateKey → 이름 맵으로 반환. */
export async function holidaysInRange(startKey: string, endKey: string): Promise<Record<string, string>> {
  const startYear = Number(startKey.slice(0, 4));
  const endYear = Number(endKey.slice(0, 4));
  const out: Record<string, string> = {};
  for (let y = startYear; y <= endYear; y++) {
    const preset = await presetFor(String(y));
    for (const [dateKey, names] of Object.entries(preset)) {
      if (dateKey >= startKey && dateKey <= endKey) out[dateKey] = names[0];
    }
  }
  if (typeof window === "undefined" && process.env.KASI_SERVICE_KEY) {
    const months = new Set<string>();
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) months.add(`${y}-${String(m).padStart(2, "0")}`);
    }
    for (const ym of months) {
      const [y, m] = ym.split("-");
      const kasi = await kasiMonth(y, m);
      for (const [dateKey, name] of Object.entries(kasi)) {
        if (dateKey >= startKey && dateKey <= endKey) out[dateKey] = name;
      }
    }
  }
  return out;
}

/** 캘린더 셀용: 보이는 날짜 키 목록의 공휴일 맵(dateKey → 이름)을 비동기로 채워 반환한다. */
export function useHolidayMap(days: string[]): Record<string, string> {
  const [map, setMap] = React.useState<Record<string, string>>({});
  const rangeKey = days.length ? `${days[0]}~${days[days.length - 1]}` : "";
  React.useEffect(() => {
    if (!rangeKey) return;
    let alive = true;
    const [start, end] = rangeKey.split("~");
    holidaysInRange(start, end).then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);
  return map;
}
