/** 월별 정산 보고서 순수 계산(components/building/settlement.ts) 자가검사. */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildSettlement } from "@/components/building/settlement";
import { buildReportWorkbook } from "@/components/building-ops/report-xlsx";
import type { BillRow, ReceivableRow } from "@/lib/domain/building-types";

const bill = (unit: string, lines: [string, number][], x: Partial<BillRow> = {}): BillRow => ({
  id: `b-${unit}-${Math.random()}`, business_id: "B", run_id: "R", building_id: "G", period: "2026-09", unit_id: unit, contract_id: null, bill_to_party_id: `p-${unit}`, tax_to_party_id: null,
  bill_kind: "regular", revision: 1, corrects_bill_id: null, supply: 0, vat: 0, exempt: 0,
  current_charge: lines.reduce((s, l) => s + l[1], 0), prior_unpaid: 0, late_fee: 0, credit: 0, amount_due: lines.reduce((s, l) => s + l[1], 0),
  trace: { lines: lines.map(([name, amount]) => ({ charge_type_id: name, std_category: "other", name, supply: amount, vat: 0, exempt: 0, amount, basis: {} })), current_charge: { supply: 0, vat: 0, exempt: 0, total: 0 }, prior_unpaid: 0, late_fee: { enabled: false, terms_ready: false, items: [], total: 0 }, credit: { available: 0, applied: 0 }, amount_due: 0, asof: "2026-09-30", vat_rate: 0.1 },
  created_at: "", ...x,
});
const rec = (unit: string, period: string, amount: number, paid: number, status: "open" | "paid" = "open"): ReceivableRow => ({ id: `r${Math.random()}`, business_id: "B", building_id: "G", bill_id: null, unit_id: unit, party_id: null, contract_id: null, period, kind: "bill", amount, paid, credit_applied: 0, status, due_date: null, created_at: "" });

describe("buildSettlement", () => {
  const s = buildSettlement({
    period: "2026-09",
    bills: [bill("102", [["전기", 1000], ["청소", 500]], { prior_unpaid: 300, amount_due: 1800 }), bill("101", [["전기", 2000]]), bill("101", [["전기", -100]], { bill_kind: "correction" })],
    prevBills: [bill("101", [["전기", 1500], ["승강기", 200]])],
    unitLabel: (u) => u, partyName: (p) => p ?? "",
    receivables: [rec("102", "2026-08", 300, 0), rec("102", "2026-09", 1500, 1000), rec("101", "2026-09", 1900, 1900, "paid"), rec("102", "2026-10", 999, 0)],
  });
  it("호실 순서·같은 호실 청구 합치기·합계 행", () => {
    expect(s.rows.map((r) => r.unitId)).toEqual(["101", "102"]);
    expect(s.rows[0].items["전기"]).toBe(1900);
    expect(s.total.items["전기"]).toBe(2900);
    expect(s.total.current).toBe(3400);
  });
  it("미납액은 이 달까지 열린 잔액만, 수납액 = 납부할 금액 − 미납액", () => {
    const r = s.rows[1];
    expect(r.left).toBe(800); // 300 + 500, 10월분 제외
    expect(r.paid).toBe(1000);
    expect(s.rows[0].left).toBe(0);
  });
  it("항목 비교: 지난달에만 있던 항목도 나오고 차이율은 지난달 0이면 null", () => {
    const e = s.compare.find((c) => c.name === "전기")!;
    expect([e.cur, e.prev, e.diff]).toEqual([2900, 1500, 1400]);
    expect(s.compare.find((c) => c.name === "승강기")).toMatchObject({ cur: 0, prev: 200, diff: -200 });
    expect(s.compare.find((c) => c.name === "청소")!.pct).toBeNull();
    expect(s.compareTotal.cur).toBe(3400);
  });
  it("엑셀 첫 시트 '월별 정산'이 화면과 같은 합계를 숫자 셀로 담는다", async () => {
    const report = { period: "2026-09", prev_period: "2026-08", total: 0, prev_total: 0, categories: [] };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildReportWorkbook({ buildingName: "누리타워", period: "2026-09", report, settlement: s })) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["월별 정산", "분류별 집계"]);
    const ws = wb.getWorksheet("월별 정산")!;
    const head = ws.getRow(3).values as unknown[];
    const total = ws.getRow(6);
    expect(total.getCell(1).value).toBe("합계 2호실");
    expect(total.getCell(head.indexOf("전기")).value).toBe(2900);
    expect(total.getCell(head.indexOf("이번 달 관리비")).value).toBe(3400);
    expect(total.getCell(head.indexOf("미납액")).value).toBe(800);
    expect(head).not.toContain("연체료");
  });
});
