/**
 * 차트 계열 고정 팔레트 — app/globals.css --ch-1..5 (dataviz 검증기 7/7 통과, 절대 변경 금지).
 *   예외: 공장 외 업종은 [data-accent="teal"] 범위에서 --ch-1 만 청록으로 덮는다(2026-09-25, ΔE 재검증 기록은 globals.css).
 * 순환 배정 금지: 호출부가 이미 고정 순서로 정렬한 배열의 인덱스를 그대로 넘긴다
 * (lib/domain/home-charts.ts의 foldTopN 참고) — 필터로 계열이 줄어도 같은 인덱스는 같은 색.
 */
export const CHART_COLORS = [
  "var(--ch-1)",
  "var(--ch-2)",
  "var(--ch-3)",
  "var(--ch-4)",
  "var(--ch-5)",
] as const;

/** "기타" 묶음 등 범주 없는 자리 — 상태색(okt/wt/et)도 6번째 계열색도 아닌 중립 텍스트 회색. */
export const CHART_OTHER_COLOR = "var(--t3)";

/** --ch-3(황토)는 흰 면 대비 2.97:1 — 색만으로 식별 금지, 직접 라벨 필수. 이 인덱스를 쓰는 곳은 라벨을 생략하면 안 된다. */
export const CH3_INDEX = 2;

export function chartColor(colorIndex: number | null): string {
  if (colorIndex === null || colorIndex < 0) return CHART_OTHER_COLOR;
  return CHART_COLORS[colorIndex % CHART_COLORS.length];
}
