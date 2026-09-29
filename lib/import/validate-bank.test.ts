import { describe, expect, it } from "vitest";
import { suggestMapping } from "./mapping";
import { validateRows } from "./validate";

const HEADER = ["거래일시", "적요", "입금액", "출금액", "잔액", "거래고유번호"];

describe("validateRows — 은행(bank)", () => {
  it("잔액 연속성이 깨지면 경고한다(V9)", () => {
    const mapping = suggestMapping(HEADER, "bank");
    const rows = [
      ["2026-08-05", "101호 관리비", "165000", "", "5165000", "TXN-1"],
      // 다음 행 잔액이 입금액만큼 늘지 않음 → 누락 거래 의심
      ["2026-08-06", "102호 관리비", "98000", "", "5300000", "TXN-2"],
    ];
    const validated = validateRows(rows, mapping);
    expect(validated[1].issues.some((i) => i.code === "BALANCE_MISMATCH")).toBe(true);
  });

  it("입금자명·금액이 일치해도 자동 배정하지 않고 후보로만 제시한다(V11)", () => {
    const mapping = suggestMapping(HEADER, "bank");
    const rows = [["2026-08-05", "101호 홍길동", "165000", "", "5165000", "TXN-1"]];
    const validated = validateRows(rows, mapping, { expectedCharges: { "101호": 165000 } });
    const candidate = validated[0].issues.find((i) => i.code === "DEPOSIT_CANDIDATE");
    expect(candidate).toBeTruthy();
    // 자동 배정 금지: 은행 소스는 room 필드 매핑이 없으므로 normalized.room이 절대 채워지지 않는다.
    expect(validated[0].normalized.room).toBeUndefined();
  });

  it("완전히 같은 거래가 반복되면 두 번째부터 조용히 제외한다(V10)", () => {
    const mapping = suggestMapping(HEADER, "bank");
    const rows = [
      ["2026-08-05", "101호 관리비", "165000", "", "5165000", "TXN-1"],
      ["2026-08-05", "101호 관리비", "165000", "", "5165000", "TXN-1"],
    ];
    const validated = validateRows(rows, mapping);
    expect(validated[0].excluded).toBe(false);
    expect(validated[1].excluded).toBe(true);
  });

  it("시각 포함 거래일시를 읽고, 못 읽은 입금 행은 '건너뜀' 경고를 남긴다(0033 C7)", () => {
    const mapping = suggestMapping(HEADER, "bank");
    const rows = [
      ["2026-09-01 14:23:05", "101호", "165000", "", "5165000", "T1"],
      ["", "102호", "98000", "", "5263000", "T2"],
      ["일시불명", "103호", "50000", "", "5313000", "T3"],
      ["2026-09-02 10:00", "출금", "", "10000", "5303000", "T4"],
    ];
    const v = validateRows(rows, mapping);
    expect(v[0].normalized.txnDatetime).toBe("2026-09-01 14:23:05");
    expect(v[0].issues.some((i) => i.code === "TXN_DATE_MISSING")).toBe(false);
    expect(v[1].normalized.txnDatetime).toBeNull();
    expect(v[1].issues.find((i) => i.code === "TXN_DATE_MISSING")?.level).toBe("warning");
    expect(v[2].issues.find((i) => i.code === "TXN_DATE_MISSING")?.message).toContain("일시불명");
    expect(v[3].issues.some((i) => i.code === "TXN_DATE_MISSING")).toBe(false); // 출금 행은 가져오지 않는다
  });
});
