import { describe, it, expect } from "vitest";
import { toKRW, isValidKRW, formatKRW, parseKRW } from "./money";

describe("toKRW", () => {
  it("소수를 절단하고 비유한값은 0", () => {
    expect(toKRW(1234.9)).toBe(1234);
    expect(toKRW(-1234.9)).toBe(-1234);
    expect(toKRW(NaN)).toBe(0);
    expect(toKRW(Infinity)).toBe(0);
  });
});

describe("isValidKRW", () => {
  it("0 이상 정수만 통과", () => {
    expect(isValidKRW(0)).toBe(true);
    expect(isValidKRW(1000)).toBe(true);
    expect(isValidKRW(-1)).toBe(false);
    expect(isValidKRW(1.5)).toBe(false);
    expect(isValidKRW("1000")).toBe(false);
  });
});

describe("formatKRW", () => {
  it("천 단위 콤마 + 원, null/undefined는 대시", () => {
    expect(formatKRW(150000)).toBe("150,000원");
    expect(formatKRW(0)).toBe("0원");
    expect(formatKRW(-5000)).toBe("-5,000원");
    expect(formatKRW(null)).toBe("—");
    expect(formatKRW(undefined)).toBe("—");
  });
});

describe("parseKRW", () => {
  it("숫자 아닌 문자 제거 후 정수로", () => {
    expect(parseKRW("150,000")).toBe(150000);
    expect(parseKRW("150000원")).toBe(150000);
    expect(parseKRW("")).toBe(0);
    expect(parseKRW("원")).toBe(0);
  });
});
