/** 소유자 보고서 순수 계산 회귀: 예산 대비 실적, 장기수선 잔액(사용은 빼기), 주요 지출. */
import { describe, expect, it } from "vitest";
import { budgetVsActual, fundSummary, topExpenses } from "@/components/building/owners-report";
import type { BudgetRow, CategoryReport, ExpenseRow, RepairFundRow } from "@/lib/domain/building-types";

const cat = (std_category: string, amount: number) => ({ std_category, supply: amount, vat: 0, exempt: 0, amount, prev_amount: 0, diff: 0 });
const rep = (period: string, cs: ReturnType<typeof cat>[]) => ({ period, prev_period: "", categories: cs, total: 0, prev_total: 0 }) as unknown as CategoryReport;
const bud = (std_category: string, amount: number | null) => ({ std_category, amount }) as BudgetRow;
const fund = (period: string, kind: RepairFundRow["kind"], amount: number | null) => ({ period, kind, amount }) as RepairFundRow;

describe("budgetVsActual", () => {
  it("달마다 분류 금액을 누계로 더하고 예산과 비교한다", () => {
    const r = budgetVsActual([bud("cleaning", 1_000_000), bud("security", 0), bud("elevator", null)], [rep("2026-01", [cat("cleaning", 300_000), cat("security", 50_000)]), rep("2026-02", [cat("cleaning", 400_000)])]);
    const c = r.lines.find((l) => l.cat === "cleaning")!;
    expect(c).toMatchObject({ budget: 1_000_000, actual: 700_000, left: 300_000, pct: 0.7 });
    expect(r.lines.find((l) => l.cat === "security")).toMatchObject({ budget: 0, actual: 50_000, left: -50_000, pct: null });
    expect(r.lines.find((l) => l.cat === "elevator")!.budget).toBe(0); // 금액 가림(null)은 0
    expect(r.totalBudget).toBe(1_000_000);
    expect(r.totalActual).toBe(750_000);
    expect(r.lines).toHaveLength(16);
  });
});
describe("fundSummary", () => {
  it("적립·이자·바로잡기는 더하고 사용은 빼며, 그 달 증감을 따로 준다", () => {
    const rows = [fund("2026-07", "contribution", 1_000_000), fund("2026-08", "spend", 300_000), fund("2026-09", "contribution", 500_000), fund("2026-09", "interest", 2_000), fund("2026-09", "adjust", -1_000), fund("2026-10", "contribution", 9_999_999)];
    expect(fundSummary(rows, "2026-09")).toEqual({ balance: 1_201_000, monthChange: 501_000 });
  });
});
describe("topExpenses", () => {
  it("항목 이름별로 합쳐 큰 순서로 자른다", () => {
    const ex = [{ charge_type_id: "a", amount: 100 }, { charge_type_id: "b", amount: 500 }, { charge_type_id: "a", amount: 450 }, { charge_type_id: "c", amount: null }] as ExpenseRow[];
    expect(topExpenses(ex, (id) => `항목${id}`, 2)).toEqual([{ name: "항목a", amount: 550 }, { name: "항목b", amount: 500 }]);
  });
});
