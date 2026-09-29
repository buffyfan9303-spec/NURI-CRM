/**
 * 보고서 Excel 생성(서버 전용, exceljs). 시트 1 = 분류별 집계·전월 대비, 원장 데이터가 있으면 이어서 7시트(+감사).
 * 금액 셀은 숫자(정수 KRW)로 넣고 서식만 천 단위 쉼표를 쓴다. 문자열 합성 금액은 만들지 않는다.
 */
import ExcelJS from "exceljs";
import { STD_CATEGORIES, STD_CATEGORY_LABEL, type CategoryReport } from "@/lib/domain/building-types";

export interface ReportRow { key: string; label: string; supply: number; vat: number; exempt: number; amount: number; prev: number; diff: number }
export interface ReportTable { rows: ReportRow[]; total: number; prevTotal: number; prevOnly: number }

/** 서버 집계(값이 있는 분류만 옴)를 16분류 전체 행으로 펼치고, 전월에만 있던 금액은 별도 합계로 남긴다. */
export function tableFromReport(r: CategoryReport): ReportTable {
  const by = new Map(r.categories.map((c) => [c.std_category, c]));
  const rows = STD_CATEGORIES.map((k) => {
    const c = by.get(k);
    return { key: k, label: STD_CATEGORY_LABEL[k], supply: c?.supply ?? 0, vat: c?.vat ?? 0, exempt: c?.exempt ?? 0, amount: c?.amount ?? 0, prev: c?.prev_amount ?? 0, diff: c?.diff ?? 0 };
  });
  const prevShown = rows.reduce((s, x) => s + x.prev, 0);
  return { rows, total: r.total, prevTotal: r.prev_total, prevOnly: r.prev_total - prevShown };
}

const LABEL: Record<string, string> = {
  unit_no: "호실", dong: "동", floor: "층", use_kind: "용도", area: "전용면적", share: "지분", tenant: "입주자", biz_reg_no: "사업자번호", contract_from: "계약 시작", contract_to: "계약 종료",
  name: "이름", std_category: "분류", source: "원천", alloc: "배분", payer: "부담", tax: "세무", rate: "단가·정액", tax_approved: "세무 승인",
  kind: "구분", supply: "공급가", vat: "부가세", exempt: "면세", amount: "금액", vendor: "거래처", prev: "전월 지침", curr: "이번 지침", usage: "사용량", reason: "사유",
  bill_to: "청구 대상", revision: "회차", current_charge: "당월 부과", prior_unpaid: "전월 미납", late_fee: "연체료", credit: "선납", amount_due: "납부 요청액", lines: "항목",
  receiver: "받는 곳", receiver_bizno: "받는 곳 사업자번호", supplier: "공급자", total: "합계", status: "상태", nts_approval_no: "승인번호", blocks: "차단 사유",
  period: "청구월", paid: "수납", credit_applied: "크레딧 사용", balance: "잔액", due_date: "납기", paid_at: "입금일", method: "방법", reversed: "취소됨", at: "일시", actor: "처리자", action: "작업", target: "대상",
};
const SHEETS: [string, string][] = [["units", "호실"], ["charge_types", "항목"], ["sources", "자료"], ["bills", "청구"], ["tax_targets", "세무"], ["receivables", "미수"], ["payments", "수납"], ["audit", "감사"]];
const MONEY = new Set(["supply", "vat", "exempt", "amount", "current_charge", "prior_unpaid", "late_fee", "credit", "amount_due", "total", "tax", "paid", "credit_applied", "balance"]);

function cell(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? Object.values(x as object).join(":") : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function buildReportWorkbook(input: { buildingName: string; period: string; report: CategoryReport; ledger?: Record<string, unknown> | null }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const t = tableFromReport(input.report);
  const ws = wb.addWorksheet("분류별 집계");
  ws.addRow([`${input.buildingName} ${input.period} 관리비 분류별 집계`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const head = ws.addRow(["분류", "공급가", "부가세", "면세", "합계", `전월(${input.report.prev_period})`, "증감"]);
  head.font = { bold: true };
  for (const r of t.rows) ws.addRow([r.label, r.supply, r.vat, r.exempt, r.amount, r.prev, r.diff]);
  if (t.prevOnly !== 0) ws.addRow(["전월에만 있던 항목", 0, 0, 0, 0, t.prevOnly, -t.prevOnly]);
  const tot = ws.addRow(["합계", null, null, null, t.total, t.prevTotal, t.total - t.prevTotal]);
  tot.font = { bold: true };
  ws.columns = [{ width: 22 }, ...Array.from({ length: 6 }, () => ({ width: 16 }))];
  ws.eachRow((row, i) => { if (i >= 3) for (let c = 2; c <= 7; c++) row.getCell(c).numFmt = "#,##0"; });

  if (input.ledger) {
    for (const [key, name] of SHEETS) {
      const rows = input.ledger[key];
      if (!Array.isArray(rows)) continue;
      const s = wb.addWorksheet(name);
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r as object))));
      s.addRow(cols.map((c) => LABEL[c] ?? c)).font = { bold: true };
      for (const r of rows as Record<string, unknown>[]) s.addRow(cols.map((c) => cell(r[c])));
      cols.forEach((c, i) => { s.getColumn(i + 1).width = 16; if (MONEY.has(c)) s.getColumn(i + 1).numFmt = "#,##0"; });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
