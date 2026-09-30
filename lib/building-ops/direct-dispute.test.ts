/** 호실별 따로 넣는 금액 입력 검증 회귀(감면은 음수, 0·소수·글자는 거절). */
import { describe, expect, it } from "vitest";
import { parseSignedWon, directErrorText, DIRECT_LOCKED_NOTE } from "@/components/building-ops/direct-charge-ui";

describe("parseSignedWon", () => {
  it("감면은 음수, 쉼표·유니코드 마이너스·원 글자 허용", () => {
    expect(parseSignedWon("-10,000")).toEqual({ ok: true, value: -10000 });
    expect(parseSignedWon("−10000원")).toEqual({ ok: true, value: -10000 });
    expect(parseSignedWon("+5000")).toEqual({ ok: true, value: 5000 });
  });
  it("0 · 빈칸 · 소수점 · 글자 · 너무 큰 수는 거절", () => {
    for (const bad of ["", "0", "-0", "1.5", "abc", "1e5", "99999999999"]) expect(parseSignedWon(bad).ok, bad).toBe(false);
  });
});
describe("directErrorText", () => {
  it("확정된 달 오류는 쉬운 말로 바꾼다", () => {
    expect(directErrorText("period_locked", "period_locked: x")).toBe(DIRECT_LOCKED_NOTE);
    expect(directErrorText(undefined, "다른 문장")).toBe("다른 문장");
  });
});
