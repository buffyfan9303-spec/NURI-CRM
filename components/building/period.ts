/**
 * 건물 관리비 청구월("YYYY-MM") 순수 헬퍼 — 서버·클라이언트 공용(import 부작용 없음).
 * DB 계약: bld_periods.period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'.
 */
import { todayKeyInTz } from "@/lib/utils/datetime";

export const isPeriod = (v: unknown): v is string => typeof v === "string" && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(v);

/** "2026-09" → "2026년 9월분" */
export function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  return `${Number(y)}년 ${Number(m)}월분`;
}

export function addMonths(p: string, n: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const currentPeriod = (tz: string) => todayKeyInTz(tz).slice(0, 7);

/** 셀렉트 후보: 선택한 달을 포함해 12개월 전 ~ 1개월 후, 최신이 위. */
export function periodOptions(selected: string, tz: string): string[] {
  const now = currentPeriod(tz);
  const set = new Set<string>([selected]);
  for (let i = -12; i <= 1; i++) set.add(addMonths(now, i));
  return Array.from(set).sort().reverse();
}

/** 화면 간 이동에 붙이는 쿼리 문자열. 건물이 없으면 월만. */
export const buildingQs = (buildingId: string | null | undefined, period: string) =>
  buildingId ? `?b=${buildingId}&p=${period}` : `?p=${period}`;
