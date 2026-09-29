import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "./parse";
import { ImportParseError } from "./types";
import {
  buildBankXlsx,
  buildKepcoMeterXlsx,
  buildLegacyMeterXls,
  buildMixedRoomNotationXlsx,
  buildWaterBillCsvCp949,
} from "./__fixtures__/build";

describe("parseSpreadsheet", () => {
  it("xlsx: 병합된 제목 행을 포함해도 데이터 행을 그대로 읽는다", async () => {
    const buf = await buildKepcoMeterXlsx();
    const parsed = await parseSpreadsheet(buf, "kepco.xlsx");
    expect(parsed.sheets).toHaveLength(1);
    const rows = parsed.sheets[0].rows;
    expect(rows[1]).toEqual(["호실", "계량기번호", "전월지침", "당월지침", "사용량", "단위", "검침일", "비고"]);
    expect(rows[2][0]).toBe("101호");
    expect(rows[2][3]).toBe("1120");
  });

  it("csv: CP949 인코딩을 자동 판별한다", async () => {
    const buf = buildWaterBillCsvCp949();
    const parsed = await parseSpreadsheet(buf, "water.csv");
    const rows = parsed.sheets[0].rows;
    expect(rows[0]).toEqual(["청구기간", "고객번호", "사용량", "기본요금", "사용요금", "부가세", "청구금액", "납기일"]);
    expect(rows[1][1]).toBe("W-1001");
  });

  it("xls: 공식 SheetJS(xlsx 패키지, 홈택스와 공유)로 읽는다", async () => {
    const parsed = await parseSpreadsheet(buildLegacyMeterXls(), "legacy.xls");
    const rows = parsed.sheets[0].rows;
    expect(rows[0]).toEqual(["호실", "전월지침", "당월지침", "사용량", "검침일"]);
    expect(rows[1][0]).toBe("201호");
  });

  it("깨진 xls 바이너리는 안내 메시지와 함께 거부한다", async () => {
    await expect(parseSpreadsheet(Buffer.from("dummy"), "old.xls")).rejects.toMatchObject({
      code: "UNSUPPORTED_XLS",
    });
  });

  it("10MB 초과 파일은 거부한다", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(parseSpreadsheet(big, "big.xlsx")).rejects.toBeInstanceOf(ImportParseError);
  });

  it("은행 거래내역 xlsx를 읽는다", async () => {
    const buf = await buildBankXlsx();
    const parsed = await parseSpreadsheet(buf, "bank.xlsx");
    expect(parsed.sheets[0].rows[1][5]).toBe("TXN-0001");
  });

  it("호실 표기가 섞인 파일을 읽는다", async () => {
    const buf = await buildMixedRoomNotationXlsx();
    const parsed = await parseSpreadsheet(buf, "rooms.xlsx");
    const rows = parsed.sheets[0].rows;
    expect(rows.map((r) => r[0])).toEqual(["호실", "101호", "1-102", "지하1층 101", "103"]);
  });
});
