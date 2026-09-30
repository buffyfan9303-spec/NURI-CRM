/**
 * 상가 14항목 내역 웹 화면의 순수 집계(서버·테스트 공용). 항목 매핑·10만 원 미만 규칙은 명세서와 같은 lib/pdf/statement-p0.ts 의 law14Table 을 그대로 쓴다.
 * 금액은 서버가 확정한 청구(trace.lines)를 더하기만 한다. 새 금액을 만들지 않는다.
 */
import type { BillRow } from "@/lib/domain/building-types";
import { law14Table, LAW14, type Law14Table } from "@/lib/pdf/statement-p0";

export interface Law14UnitRow { unitId: string; unitLabel: string; party: string; table: Law14Table }
export interface Law14Building {
  /** LAW14 순서(1~14호)의 건물 합계. 10만 원 미만 호실의 금액도 들어 있다(건물 합계는 관리자용). */
  amounts: number[];
  other: number;
  rent: number;
  monthlyFee: number;
  /** 항목별 금액을 숨기는 호실 수. */
  hiddenUnits: number;
}

/** 같은 호실에 정기+고침 청구가 여러 장이면 줄을 합쳐 한 표로 만든다(월별 정산 보고서와 같은 방식). */
export function law14ByUnit(bills: BillRow[], unitLabel: (id: string) => string, partyName: (id: string | null) => string): Law14UnitRow[] {
  const by = new Map<string, { party: string | null; lines: NonNullable<BillRow["trace"]>["lines"] }>();
  for (const b of bills) {
    const e = by.get(b.unit_id) ?? { party: b.bill_to_party_id, lines: [] };
    e.lines = e.lines.concat(b.trace?.lines ?? []);
    by.set(b.unit_id, e);
  }
  return Array.from(by, ([unitId, e]) => ({ unitId, unitLabel: unitLabel(unitId), party: partyName(e.party), table: law14Table(e.lines) }))
    .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, "ko", { numeric: true }));
}

export function law14Building(rows: Law14UnitRow[]): Law14Building {
  const t: Law14Building = { amounts: LAW14.map(() => 0), other: 0, rent: 0, monthlyFee: 0, hiddenUnits: 0 };
  for (const r of rows) {
    r.table.rows.forEach((x, i) => { t.amounts[i] += x.amount; });
    for (const o of r.table.outside) { if (o.kind === "rent") t.rent += o.amount; else t.other += o.amount; }
    t.monthlyFee += r.table.monthlyFee;
    if (r.table.amountsHidden) t.hiddenUnits += 1;
  }
  return t;
}
