/** 기준 연체 조건(법무부 상가 표준관리규약 별표 11, 연 12%)이 입력 완전하고, 규약 예시 금액을 그대로 재현하는지. */
import { describe, expect, it } from "vitest";
import { STANDARD_LATE_FORM, lateFormComplete, lateFormToPatch } from "@/components/building-ops/late-terms";
import { lateFee } from "@/lib/domain/building-calc";
import type { LateTerms } from "@/lib/domain/building-types";

describe("기준 연체 조건", () => {
  const terms = { ...lateFormToPatch(STANDARD_LATE_FORM), late_approved_by: "u2", late_approved_at: "2026-09-30T00:00:00Z" } as LateTerms;
  it("모든 칸이 채워져 있다(확정 대기로 저장된다)", () => expect(lateFormComplete(STANDARD_LATE_FORM)).toBe(true));
  it("연 12% · 단리 · 원금만 · 상한 없음", () => {
    expect(terms).toMatchObject({ late_rate: 12, late_rate_unit: "annual", late_method: "simple", late_grace_days: 0, late_basis: "principal", late_partial_order: "fee_first", late_cap_none: true, late_cap_pct: null });
  });
  it("표준규약 예시: 300,000원 × 12% × 160/365 = 15,780원", () => {
    expect(lateFee(terms, 300_000, "2026-01-01", "2026-06-10").amount).toBe(15_780); // 1/1 다음 날부터 160일
  });
});
