/**
 * 건물 화면 공통 문맥(서버 전용): URL `?b=<building_id>&p=YYYY-MM` → 선택 건물·청구월·청구월 행.
 * 없으면 첫 건물·이번 달(사업장 tz). 모든 건물 nav 페이지가 이걸 먼저 부른다.
 */
import { getPeriod, listBuildings } from "@/lib/domain/building";
import type { BuildingRow, PeriodRow } from "@/lib/domain/building-types";
import { buildingQs, currentPeriod, isPeriod } from "./period";

export interface BuildingContext {
  buildings: BuildingRow[];
  /** 건물이 하나도 없으면 null — 화면은 EmptyState("건물을 먼저 등록하세요"). */
  building: BuildingRow | null;
  period: string;
  /** 청구월 행이 아직 없으면 null(자료 수집 전). */
  periodRow: PeriodRow | null;
  /** 다른 건물 화면으로 넘길 쿼리("?b=..&p=.."). */
  qs: string;
}

export type BuildingContextResult = { ok: true; data: BuildingContext } | { ok: false; message: string };

export async function resolveBuildingContext(
  businessId: string,
  tz: string,
  sp: { b?: string; p?: string } | undefined,
): Promise<BuildingContextResult> {
  const res = await listBuildings(businessId);
  if (!res.ok) return res;
  const building = res.data.find((b) => b.id === sp?.b) ?? res.data[0] ?? null;
  const period = isPeriod(sp?.p) ? sp.p : currentPeriod(tz);
  let periodRow: PeriodRow | null = null;
  if (building) {
    const pr = await getPeriod(building.id, period);
    if (!pr.ok) return pr;
    periodRow = pr.data;
  }
  return { ok: true, data: { buildings: res.data, building, period, periodRow, qs: buildingQs(building?.id, period) } };
}
