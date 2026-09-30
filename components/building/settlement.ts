/**
 * 월별 정산 보고서의 순수 계산(서버·엑셀 공용). 원본 엑셀 "관리집계표"(호실 × 항목 열 + 맨 아래 합계)와
 * "관리비비교표"(항목별 금액)를 따른다. 구조 분석: docs/design-references/2026-09-30-cam-report-from-excel.md.
 * 금액은 전부 서버가 계산한 값(청구서 trace)을 더하기만 한다. 새 금액을 만들지 않는다.
 */
import type { BillRow, ReceivableRow } from "@/lib/domain/building-types";

export interface SettleRow {
  unitId: string; unitLabel: string; party: string;
  /** 항목 이름 → 금액(부가세 포함) */
  items: Record<string, number>;
  supply: number; vat: number; exempt: number;
  /** 이번 달 관리비(부가세 포함) */
  current: number; priorUnpaid: number; lateFee: number; credit: number;
  /** 이번 달 납부액(미납액·연체료 포함, 선납금 뺌) */
  due: number;
  /** 수납액 = 납부할 금액 − 미납액(0 아래로 내려가지 않음) */
  paid: number;
  /** 오늘 기준 이 달까지 미납액(열린 미수금의 잔액 합) */
  left: number;
}
export interface CompareRow { name: string; cur: number; prev: number; diff: number; pct: number | null }
export interface Settlement {
  items: string[];
  rows: SettleRow[];
  total: Omit<SettleRow, "unitId" | "unitLabel" | "party">;
  compare: CompareRow[];
  compareTotal: CompareRow;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function lineSums(bills: BillRow[]): { order: string[]; byName: Map<string, number> } {
  const order: string[] = [];
  const byName = new Map<string, number>();
  for (const b of bills) for (const l of b.trace?.lines ?? []) {
    if (!byName.has(l.name)) order.push(l.name);
    byName.set(l.name, (byName.get(l.name) ?? 0) + n(l.amount));
  }
  return { order, byName };
}

/** 잔액 = 금액 − 수납액 − 선납금 사용분(0 아래 없음). 열린(open) 것만. */
export const receivableLeft = (r: ReceivableRow) => (r.status === "open" ? Math.max(0, n(r.amount) - n(r.paid) - n(r.credit_applied)) : 0);

export function buildSettlement(input: {
  period: string;
  /** 이 달 확정본 청구(정기 + 확정된 고침). 같은 호실이 여러 장이면 더한다. */
  bills: BillRow[];
  prevBills: BillRow[];
  unitLabel: (unitId: string) => string;
  partyName: (partyId: string | null) => string;
  receivables: ReceivableRow[];
}): Settlement {
  const cur = lineSums(input.bills);
  const prev = lineSums(input.prevBills);
  const items = cur.order.filter((k) => cur.byName.get(k) !== 0);

  const leftByUnit = new Map<string, number>();
  for (const r of input.receivables) if (r.period <= input.period) leftByUnit.set(r.unit_id, (leftByUnit.get(r.unit_id) ?? 0) + receivableLeft(r));

  const by = new Map<string, SettleRow>();
  for (const b of input.bills) {
    let row = by.get(b.unit_id);
    if (!row) {
      row = { unitId: b.unit_id, unitLabel: input.unitLabel(b.unit_id), party: input.partyName(b.bill_to_party_id), items: {}, supply: 0, vat: 0, exempt: 0, current: 0, priorUnpaid: 0, lateFee: 0, credit: 0, due: 0, paid: 0, left: 0 };
      by.set(b.unit_id, row);
    }
    for (const l of b.trace?.lines ?? []) row.items[l.name] = (row.items[l.name] ?? 0) + n(l.amount);
    row.supply += n(b.supply); row.vat += n(b.vat); row.exempt += n(b.exempt);
    row.current += n(b.current_charge); row.priorUnpaid += n(b.prior_unpaid); row.lateFee += n(b.late_fee); row.credit += n(b.credit); row.due += n(b.amount_due);
  }
  // ponytail: 수납액은 "납부할 금액 − 오늘 미납액"으로 본다. 이 달 뒤에 생긴 고침·연체료가 있으면 조금 어긋날 수 있다(정확히는 입금 배정 행 합계가 필요).
  for (const row of by.values()) {
    row.left = leftByUnit.get(row.unitId) ?? 0;
    row.paid = Math.max(0, row.due - row.left);
  }
  const rows = Array.from(by.values()).sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, "ko", { numeric: true }));

  const total: Settlement["total"] = { items: {}, supply: 0, vat: 0, exempt: 0, current: 0, priorUnpaid: 0, lateFee: 0, credit: 0, due: 0, paid: 0, left: 0 };
  for (const r of rows) {
    for (const k of items) total.items[k] = (total.items[k] ?? 0) + (r.items[k] ?? 0);
    total.supply += r.supply; total.vat += r.vat; total.exempt += r.exempt; total.current += r.current; total.priorUnpaid += r.priorUnpaid;
    total.lateFee += r.lateFee; total.credit += r.credit; total.due += r.due; total.paid += r.paid; total.left += r.left;
  }

  const names = [...items, ...prev.order.filter((k) => !cur.byName.has(k) && prev.byName.get(k) !== 0)];
  const cmp = (name: string, c: number, p: number): CompareRow => ({ name, cur: c, prev: p, diff: c - p, pct: p !== 0 ? (c - p) / p : null });
  const compare = names.map((k) => cmp(k, cur.byName.get(k) ?? 0, prev.byName.get(k) ?? 0));
  const compareTotal = cmp("합계", compare.reduce((s, x) => s + x.cur, 0), compare.reduce((s, x) => s + x.prev, 0));
  return { items, rows, total, compare, compareTotal };
}
