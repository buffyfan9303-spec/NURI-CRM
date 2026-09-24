/**
 * D-Day 계산 + 칩 데이터 생성.
 * 기존 _dday / _ddayChip 의 안전한 date-fns 버전.
 *
 * 데모 데이터가 2026년 기준이므로 '오늘' 은 고정된 2026-05-15 로 둔다.
 * Phase 2 백엔드 연동 시 new Date() 로 교체.
 */
import { differenceInCalendarDays, parse, isValid } from "date-fns";
import type { Order } from "@/types/order";

export const DEMO_TODAY = new Date(2026, 4, 15); // 2026-05-15 (월 인덱스 0-기반)

/**
 * 'YYYY.MM.DD' 또는 'YYYY-MM-DD' 형식 문자열을 Date 로 파싱.
 * 잘못된 입력 시 null.
 */
export function parseOrdDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const normalized = s.replace(/\./g, "-");
  const d = parse(normalized, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

/**
 * 오늘로부터 배송예정일까지 일수.
 *   음수: 납기 초과
 *   0:   D-DAY
 *   양수: 남은 일수
 *   null: 날짜 파싱 실패
 */
export function ddayFromToday(
  delStr: string | null | undefined,
  today: Date = DEMO_TODAY
): number | null {
  const d = parseOrdDate(delStr);
  if (!d) return null;
  return differenceInCalendarDays(d, today);
}

export type DDayKind = "over" | "today" | "soon" | "ok" | "done" | "none";

export interface DDayChipData {
  kind: DDayKind;
  label: string;
}

/**
 * 주문에서 D-Day 칩 데이터 생성.
 * UI 컴포넌트(DDayChip)가 이를 받아 색·아이콘과 함께 렌더.
 */
export function ddayChip(o: Pick<Order, "st" | "del">): DDayChipData {
  if (o.st === "배송완료") return { kind: "done", label: "완료" };
  const d = ddayFromToday(o.del);
  if (d === null) return { kind: "done", label: "—" };
  if (d < 0) return { kind: "over", label: `D+${Math.abs(d)} 초과` };
  if (d === 0) return { kind: "today", label: "D-DAY" };
  if (d <= 3) return { kind: "soon", label: `D-${d}` };
  return { kind: "ok", label: `D-${d}` };
}
