/**
 * 주문 목록/칸반에서 쓰는 D-Day 계산 — 순수 함수, 실제 오늘 날짜 기준(데모 고정값 없음).
 * 날짜 키(YYYY-MM-DD) 산술은 Date.UTC만 써서 시스템 타임존 영향을 없앤다
 * (lib/utils/datetime.ts와 동일한 원칙, 파일은 별도 소유라 직접 import하지 않고 재구현).
 */
export type DDayKind = "over" | "today" | "soon" | "ok" | "none";

export interface DDayInfo {
  kind: DDayKind;
  days: number | null;
  label: string;
}

function toEpochUTC(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function ddayInfo(dueDate: string | null, todayKey: string): DDayInfo {
  if (!dueDate) return { kind: "none", days: null, label: "-" };
  const diffDays = Math.round((toEpochUTC(dueDate) - toEpochUTC(todayKey)) / 86_400_000);
  if (diffDays < 0) return { kind: "over", days: diffDays, label: `D+${Math.abs(diffDays)} 초과` };
  if (diffDays === 0) return { kind: "today", days: 0, label: "D-DAY" };
  if (diffDays <= 3) return { kind: "soon", days: diffDays, label: `D-${diffDays}` };
  return { kind: "ok", days: diffDays, label: `D-${diffDays}` };
}
