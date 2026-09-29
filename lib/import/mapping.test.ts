import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "./parse";
import { detectHeaderRow, suggestMapping } from "./mapping";
import { buildBankXlsx, buildKepcoMeterXlsx, buildWaterBillCsvCp949 } from "./__fixtures__/build";

describe("detectHeaderRow + suggestMapping", () => {
  it("한전식 검침 파일: 제목행을 건너뛰고 실제 머리글 행을 찾는다", async () => {
    const parsed = await parseSpreadsheet(await buildKepcoMeterXlsx(), "kepco.xlsx");
    const header = detectHeaderRow(parsed.sheets[0].rows);
    expect(header?.headerRowIndex).toBe(1);
    expect(header?.sourceKind).toBe("meter");

    const mapping = suggestMapping(header!.headers);
    expect(mapping.sourceKind).toBe("meter");
    expect(mapping.mapping.room).toBe(0);
    expect(mapping.mapping.prevReading).toBe(2);
    expect(mapping.mapping.currReading).toBe(3);
    expect(mapping.mapping.usage).toBe(4);
  });

  it("수도 CSV: bill 소스로 추정하고 필드를 매핑한다", async () => {
    const parsed = await parseSpreadsheet(buildWaterBillCsvCp949(), "water.csv");
    const header = detectHeaderRow(parsed.sheets[0].rows);
    expect(header?.sourceKind).toBe("bill");
    const mapping = suggestMapping(header!.headers);
    expect(mapping.mapping.totalAmount).toBe(6);
    expect(mapping.mapping.period).toBe(0);
  });

  it("은행 거래내역: bank 소스로 추정한다", async () => {
    const parsed = await parseSpreadsheet(await buildBankXlsx(), "bank.xlsx");
    const header = detectHeaderRow(parsed.sheets[0].rows);
    expect(header?.sourceKind).toBe("bank");
    const mapping = suggestMapping(header!.headers);
    expect(mapping.mapping.depositAmount).toBe(2);
    expect(mapping.mapping.txnId).toBe(5);
  });

  it("같은 헤더는 같은 지문을 낸다(매핑 템플릿 재사용용)", async () => {
    const parsed = await parseSpreadsheet(await buildKepcoMeterXlsx(), "kepco.xlsx");
    const header = detectHeaderRow(parsed.sheets[0].rows)!;
    const m1 = suggestMapping(header.headers);
    const m2 = suggestMapping(header.headers);
    expect(m1.fingerprint).toBe(m2.fingerprint);
  });
});
