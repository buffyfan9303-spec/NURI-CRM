/**
 * 소유자·관리단 보고서의 순수 계산. 금액은 전부 서버가 준 정수 원(달별 분류 합계·예산·장부·지출)을 더하기만 한다.
 * 새 금액 규칙을 만들지 않는다. 보증금은 다루지 않는다.
 */
import { STD_CATEGORIES, STD_CATEGORY_LABEL, type BudgetRow, type CategoryReport, type ExpenseRow, type RepairFundRow, type StdCategory } from "@/lib/domain/building-types";

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export interface BudgetLine { cat: StdCategory; label: string; budget: number; actual: number; left: number; /** 실적 ÷ 예산. 예산이 0이면 null */ pct: number | null }

/** 분류별 예산 대비 실적(연초~이번 달 누계). 실적 = 그 달들의 확정 금액(서버 분류 보고서)을 분류마다 더한 값. */
export function budgetVsActual(budgets: BudgetRow[], yearReports: CategoryReport[]): { lines: BudgetLine[]; totalBudget: number; totalActual: number } {
  const bud = new Map(budgets.map((b) => [b.std_category, n(b.amount)]));
  const act = new Map<string, number>();
  for (const r of yearReports) for (const c of r.categories) act.set(c.std_category, (act.get(c.std_category) ?? 0) + n(c.amount));
  const lines = STD_CATEGORIES.map((cat) => {
    const budget = bud.get(cat) ?? 0, actual = act.get(cat) ?? 0;
    return { cat, label: STD_CATEGORY_LABEL[cat], budget, actual, left: budget - actual, pct: budget > 0 ? actual / budget : null };
  });
  return { lines, totalBudget: lines.reduce((s, l) => s + l.budget, 0), totalActual: lines.reduce((s, l) => s + l.actual, 0) };
}

/** 장부 한 줄의 잔액 영향: 적립·이자·바로잡기(±)는 더하고, 사용은 뺀다. */
export const fundSigned = (r: Pick<RepairFundRow, "kind" | "amount">) => (r.kind === "spend" ? -n(r.amount) : n(r.amount));

/** 그 달까지의 잔액과 그 달의 증감(rows 는 이미 그 달까지만 온 장부). */
export function fundSummary(rows: RepairFundRow[], period: string): { balance: number; monthChange: number } {
  let balance = 0, monthChange = 0;
  for (const r of rows) { if (r.period > period) continue; balance += fundSigned(r); if (r.period === period) monthChange += fundSigned(r); }
  return { balance, monthChange };
}

/** 그 달 지출을 항목 이름별로 더해 큰 순서로 limit 개. */
export function topExpenses(expenses: ExpenseRow[], nameOf: (chargeTypeId: string) => string, limit = 5): { name: string; amount: number }[] {
  const by = new Map<string, number>();
  for (const e of expenses) { const k = nameOf(e.charge_type_id); by.set(k, (by.get(k) ?? 0) + n(e.amount)); }
  return Array.from(by, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, limit);
}
