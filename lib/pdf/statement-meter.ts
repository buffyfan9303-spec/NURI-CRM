/**
 * 명세서 계량기 표 보강(2026-09-30 P1-1)의 순수 함수: 단가(서버 trace basis 그대로)와 "같은 건물 평균 대비" 사용량.
 * 사용량은 서버 검침 자료로 이미 정해진 값(usage_override 또는 (이번−전월)×배율)만 쓰고, 여기서는 평균만 낸다. 금액을 새로 만들지 않는다.
 * 개인정보: 다른 호실의 이름·호실·사용량은 결과에 없다. 평균과 그 표본 수만 나간다.
 */

/** 이 수 미만이면 평균을 보이지 않는다(2개면 내 값을 빼고 상대 사용량이 그대로 드러남). */
export const MIN_AVG_METERS = 3;

export interface UsageSample { kind: string; unitLabel: string; usage: number }
export interface UsageAvg { avg: number; count: number }

const round1 = (n: number) => Math.round(n * 10) / 10;
const keyOf = (kind: string, unitLabel: string) => `${kind}\u0000${unitLabel}`;

/**
 * 같은 건물·같은 달·같은 종류(+단위) 계량기의 평균 사용량.
 * 사용량 0 이하(빈 호실·미사용)는 평균에서 뺀다 — 비어 있는 호실이 평균을 깎지 않게. 표본이 MIN_AVG_METERS 미만이면 그 종류는 평균 없음.
 */
export function usageAverages(samples: UsageSample[]): Map<string, UsageAvg> {
  const g = new Map<string, number[]>();
  for (const s of samples) {
    if (!(s.usage > 0)) continue;
    const k = keyOf(s.kind, s.unitLabel);
    g.set(k, [...(g.get(k) ?? []), s.usage]);
  }
  const out = new Map<string, UsageAvg>();
  for (const [k, v] of g) if (v.length >= MIN_AVG_METERS) out.set(k, { avg: round1(v.reduce((a, b) => a + b, 0) / v.length), count: v.length });
  return out;
}
export const avgFor = (m: Map<string, UsageAvg>, kind: string, unitLabel: string) => m.get(keyOf(kind, unitLabel)) ?? null;

/** 평균 대비 비율(정수 %). 평균이 0 이면 null. */
export const pctVsAvg = (usage: number, avg: number): number | null => (avg > 0 ? Math.round(((usage - avg) / avg) * 100) : null);

const qty = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** "평균 1,234 kWh (계량기 7개) · 평균보다 +12%" 한 줄. 평균이 없으면 null. */
export function avgText(usage: number, a: UsageAvg | null, unit: string): string | null {
  if (!a) return null;
  const p = pctVsAvg(usage, a.avg);
  return `건물 평균 ${qty(a.avg)} ${unit}(${a.count}곳)${p === null ? "" : ` · ${p === 0 ? "평균과 같음" : `평균보다 ${p > 0 ? "+" : "−"}${Math.abs(p)}%`}`}`;
}

/**
 * 검침 단가: 이 종류 검침 항목 줄의 서버 basis.rate. 줄이 여러 개인데 단가가 서로 다르면(또는 하나도 없으면) null — 하나를 골라 보이지 않는다.
 * 비용을 사용량 비율로 나눠 청구한 항목(basis 에 rate 없음)은 단가가 없다.
 */
export function meterUnitPrice(lines: { charge_type_id: string; basis: Record<string, unknown> }[], isKind: (chargeTypeId: string) => boolean): number | null {
  const rates = new Set<number>();
  for (const l of lines) {
    if (!isKind(l.charge_type_id)) continue;
    const r = l.basis?.rate;
    if (l.basis?.method === "meter_usage" && typeof r === "number" && Number.isFinite(r)) rates.add(r);
  }
  return rates.size === 1 ? [...rates][0] : null;
}
