import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "./parse";
import { detectHeaderRow, suggestMapping } from "./mapping";
import { validateRows } from "./validate";
import { buildKepcoMeterXlsx } from "./__fixtures__/build";

async function loadKepco() {
  const parsed = await parseSpreadsheet(await buildKepcoMeterXlsx(), "kepco.xlsx");
  const rows = parsed.sheets[0].rows;
  const header = detectHeaderRow(rows)!;
  const mapping = suggestMapping(header.headers);
  const dataRows = rows.slice(header.headerRowIndex + 1);
  return { dataRows, mapping };
}

describe("validateRows", () => {
  it("합계 행은 제외 처리한다", async () => {
    const { dataRows, mapping } = await loadKepco();
    const validated = validateRows(dataRows, mapping);
    const summary = validated.find((r) => dataRows[r.rowIndex]?.[0] === "합계");
    expect(summary?.excluded).toBe(true);
  });

  it("역전 검침(당월<전월)을 오류로 표시한다", async () => {
    const { dataRows, mapping } = await loadKepco();
    const validated = validateRows(dataRows, mapping);
    const b101 = validated.find((r) => r.values.room === "B101");
    expect(b101?.issues.some((i) => i.code === "REVERSED_READING")).toBe(true);
  });

  it("정상 행은 오류가 없다", async () => {
    const { dataRows, mapping } = await loadKepco();
    const validated = validateRows(dataRows, mapping);
    const room101 = validated.find((r) => r.values.room === "101호");
    expect(room101?.issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(room101?.normalized.usage).toBe(120);
  });

  it("사용량 불일치를 경고로 표시한다", async () => {
    const { mapping } = await loadKepco();
    const rows = [["101호", "M-1", "1000", "1120", "999", "kWh", "2026-08-31", ""]];
    const validated = validateRows(rows, mapping);
    expect(validated[0].issues.some((i) => i.code === "USAGE_MISMATCH")).toBe(true);
  });

  it("호실 목록에 없으면 차단(error)한다(V4)", async () => {
    const { mapping } = await loadKepco();
    const rows = [["999호", "M-9", "10", "20", "10", "kWh", "2026-08-31", ""]];
    const validated = validateRows(rows, mapping, { units: ["101호", "102호"] });
    const issue = validated[0].issues.find((i) => i.code === "ROOM_UNMATCHED");
    expect(issue?.level).toBe("error");
  });

  it("같은 호실·계량기·기간이 중복되면 차단(error)한다(V6)", async () => {
    const { mapping } = await loadKepco();
    const rows = [
      ["101호", "M-1", "1000", "1120", "120", "kWh", "2026-08-31", ""],
      ["101호", "M-1", "1000", "1120", "120", "kWh", "2026-08-31", ""],
    ];
    const validated = validateRows(rows, mapping, { period: "2026-08" });
    expect(validated[1].issues.some((i) => i.code === "DUPLICATE_ROW" && i.level === "error")).toBe(true);
  });

  it("금액에 소수점이 있으면 경고한다(D-7)", () => {
    const rows = [
      ["청구기간", "고객번호", "사용량", "기본요금", "사용요금", "부가세", "청구금액", "납기일"],
      ["2026-08", "W-1001", "15", "3000", "12000.5", "1500", "16500.5", "2026-09-25"],
    ];
    const header = detectHeaderRow(rows)!;
    const mapping = suggestMapping(header.headers);
    const validated = validateRows(rows.slice(1), mapping);
    expect(validated[0].issues.some((i) => i.code === "AMOUNT_DECIMAL_ROUNDED")).toBe(true);
  });
});
