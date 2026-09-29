/** 검침 화면의 순수 계산·붙여넣기 해석. 표시용이다 — 실제 사용량·역전 판정은 서버(DB 제약)가 한다. */
import type { ReadingReason } from "@/lib/domain/building-types";

export type ReadingState = "empty" | "invalid" | "ok" | "reversed" | "over_max";

/** 사용량 = (이번 - 전월) × 배율. */
export function usageOf(prev: number, curr: number, multiplier: number): number {
  return Math.round((curr - prev) * multiplier * 1000) / 1000;
}

export function readingState(prev: number, currText: string, maxReading: number | null): ReadingState {
  const t = currText.trim();
  if (t === "") return "empty";
  const v = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(v) || v < 0) return "invalid";
  if (maxReading !== null && v > maxReading) return "over_max";
  if (v < prev) return "reversed";
  return "ok";
}

/**
 * 역전 사유별 사용량 제안(사용자가 고칠 수 있는 초깃값).
 * 한 바퀴(rollover)는 (최대지침+1 - 전월 + 이번) × 배율, 교체(replaced)는 새 계량기가 0에서 시작했다고 보고 이번 지침 × 배율.
 * 오입력·추정은 알 수 없으므로 빈 값 — 사용자가 직접 넣어야 저장된다.
 */
export function suggestOverride(reason: ReadingReason | "", prev: number, curr: number, multiplier: number, maxReading: number | null): string {
  if (reason === "rollover" && maxReading !== null) return String(Math.round((maxReading + 1 - prev + curr) * multiplier * 1000) / 1000);
  if (reason === "replaced") return String(Math.round(curr * multiplier * 1000) / 1000);
  return "";
}

/** 엑셀 열 복사 붙여넣기 → 칸별 문자열. 줄바꿈으로 나누고 첫 열만, 천단위 쉼표 제거. 끝의 빈 줄은 버린다. */
export function parsePasteColumn(text: string): string[] {
  const rows = text.replace(/\r/g, "").split("\n");
  while (rows.length > 1 && rows[rows.length - 1].trim() === "") rows.pop();
  return rows.map((r) => (r.split("\t")[0] ?? "").trim().replace(/,/g, ""));
}
