/**
 * 업종 홈 시각화(KPI 스파크라인·영역차트·도넛·가로막대)가 공유하는 순수 집계 헬퍼.
 * next/headers를 쓰지 않는다 — Home 컴포넌트(클라이언트)도 타입만 가져다 쓸 수 있게.
 *
 * dataviz 비협상 규칙(docs/crm-reference-extract.md §5) 중 이 파일이 담당하는 부분:
 *   - 범주 색은 고정 순서로 배정하고 필터로 계열이 줄어도 색이 바뀌지 않는다
 *     → foldTopN()은 "값 내림차순"이 아니라 호출부가 이미 고정한 우선순위 배열을
 *       그대로 받아 앞의 n개만 색을 배정한다(호출부가 도메인마다 고정 순서를 정의).
 *   - 5개 넘으면 상위 4개 + "기타"(중립색, 6번째 계열색 아님).
 *   - 전월(또는 기준 구간)이 0이면 무한대 증감률을 만들지 않는다 → computeDeltaPct.
 */

/** 금액(toLocaleString 금지 — lib/domain/money.ts formatKRW와 같은 정수 콤마 규칙). */
export function formatCount(n: number, unit = "건"): string {
  const v = Math.trunc(n);
  return `${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${unit}`;
}

export interface MonthPoint {
  /** "YYYY-MM" */
  key: string;
  /** 축 라벨(예: "3월"). */
  label: string;
  value: number;
}

/** 최근 n개월(이번 달 포함) 월 키. 오래된 → 최근 순. */
export function lastNMonthKeys(todayKey: string, n: number): string[] {
  const y = Number(todayKey.slice(0, 4));
  const m = Number(todayKey.slice(5, 7));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    out.push(`${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}

export function monthKeyLabel(key: string): string {
  return `${Number(key.slice(5, 7))}월`;
}

/** amounts는 key("YYYY-MM") → 합계 맵. 없는 달은 0. */
export function buildMonthlySeries(monthKeys: string[], amounts: Map<string, number>): MonthPoint[] {
  return monthKeys.map((key) => ({ key, label: monthKeyLabel(key), value: amounts.get(key) ?? 0 }));
}

export interface DistributionInput {
  key: string;
  label: string;
  value: number;
}
export interface DistributionSlice extends DistributionInput {
  /** null = "기타"(중립색, 색 배정 없음). */
  colorIndex: number | null;
}
export interface FoldedDistribution {
  total: number;
  slices: DistributionSlice[];
}

/**
 * 상위 n개(이미 고정 순서로 정렬돼 들어온 items 기준) + "기타".
 * items가 n개 이하면 전부 그대로 색을 배정하고 "기타"를 만들지 않는다.
 */
export function foldTopN(items: DistributionInput[], n = 4): FoldedDistribution {
  const nonZero = items.filter((i) => i.value > 0);
  const total = nonZero.reduce((s, i) => s + i.value, 0);
  if (nonZero.length <= n) {
    return { total, slices: nonZero.map((i, idx) => ({ ...i, colorIndex: idx })) };
  }
  const top = nonZero.slice(0, n);
  const restSum = nonZero.slice(n).reduce((s, i) => s + i.value, 0);
  const slices: DistributionSlice[] = top.map((i, idx) => ({ ...i, colorIndex: idx }));
  if (restSum > 0) slices.push({ key: "__other__", label: "기타", value: restSum, colorIndex: null });
  return { total, slices };
}

/** 기준값(baseline)이 0 이하면 null(무한대 증감률 금지). 반올림 정수 %. */
export function computeDeltaPct(current: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return Math.round(((current - baseline) / baseline) * 100);
}

/**
 * KPI 카드 스파크라인용 — 마지막 값(오늘)을 그 앞 구간 평균과 비교한다.
 * 일별 스냅샷 지표(오늘 피팅/출고/납기 등)는 좋다/나쁘다를 서버가 함부로 판정하지 않는다 —
 * 화살표 방향만 보여주고 색은 중립(deltaGood: null)으로 둔다.
 */
export function trendDelta(points: number[]): { deltaPct: number | null; deltaGood: null } {
  if (points.length < 2) return { deltaPct: null, deltaGood: null };
  const current = points[points.length - 1];
  const baseline = points.slice(0, -1).reduce((s, v) => s + v, 0) / (points.length - 1);
  return { deltaPct: computeDeltaPct(current, baseline), deltaGood: null };
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  href?: string;
  /** 항목마다 단위가 다를 때(예: 자재는 "마"/"개"가 섞인다) 차트 기본 단위 대신 이 값을 쓴다. */
  unit?: string;
}
