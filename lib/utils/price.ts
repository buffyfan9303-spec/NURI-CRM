/**
 * 주문 가격 자동 산출.
 * 기존 calculateTotalPrice 로직과 동일:
 *   1. 품목명에서 BASE_PRICE 키워드를 검색 → 가장 큰 값을 base 로
 *   2. 원단행 각각의 (단가 × m) 합산
 *   3. base + fabricCost 를 천단위 콤마 문자열로 반환
 */
import type { Fabric } from "@/types/fabric";
import type { OrderFabric } from "@/types/order";
import { BASE_PRICE_DEFAULTS, DEFAULT_FABRIC_M } from "@/lib/constants/basePrice";

export function basePriceForItem(
  itemText: string,
  table: Record<string, number> = BASE_PRICE_DEFAULTS
): number {
  const lower = itemText.toLowerCase();
  let max = 0;
  for (const key of Object.keys(table)) {
    if (lower.includes(key)) max = Math.max(max, table[key]);
  }
  return max;
}

export function fabricCostFromRows(
  rows: OrderFabric[],
  fabrics: Fabric[]
): number {
  let total = 0;
  for (const row of rows) {
    if (!row.fabricId) continue;
    const fab = fabrics.find((f) => f.id === row.fabricId);
    if (fab) total += fab.price * (row.m || DEFAULT_FABRIC_M);
  }
  return total;
}

export function calculateOrderPrice(args: {
  itemText: string;
  rows: OrderFabric[];
  fabrics: Fabric[];
  basePriceTable?: Record<string, number>;
}): { total: number; display: string } {
  const base = basePriceForItem(args.itemText, args.basePriceTable);
  const fabricCost = fabricCostFromRows(args.rows, args.fabrics);
  const total = base + fabricCost;
  return {
    total,
    display: total > 0 ? total.toLocaleString() : "",
  };
}

/** '1,850,000' / '₩1,850,000' / 1850000 을 숫자로 — 회계 통계용 */
export function parsePriceString(p: string | number | null | undefined): number {
  if (p == null) return 0;
  if (typeof p === "number") return p;
  return parseInt(String(p).replace(/[^0-9]/g, ""), 10) || 0;
}
