import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allocateLargestRemainder, amountDue, lateFee, splitInclVat, vatOf, lateTermsReady } from "./building-calc";
import { BUILDING_FEATURE_KEYS, BUILDING_FEATURE_DEFAULT_ON, BUILDING_FEATURE_NEEDS_CONTRACT } from "./building-types";
import type { LateTerms } from "./building-types";

const MIGRATION = path.resolve(__dirname, "../../../supabase/migrations/0031_building_cam.sql");
const sql = readFileSync(MIGRATION, "utf8");

const approved: LateTerms = {
  late_rate: 3, late_rate_unit: "monthly", late_method: "simple", late_grace_days: 0, late_basis: "principal", late_partial_order: "oldest_first",
  late_cap_pct: null, late_cap_none: true, late_approved_by: "u1", late_approved_at: "2026-09-01T00:00:00Z",
};

describe("배분(최대잉여법 1원)", () => {
  it("원천 − 배분 = 0, 잔액은 소수부 큰 순", () => {
    const r = allocateLargestRemainder(100, [{ id: "a", w: 1 }, { id: "b", w: 1 }, { id: "c", w: 1 }]);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100);
    expect(r.filter((x) => x.adjust === 1)).toHaveLength(1);
    expect(r.find((x) => x.id === "a")!.amount).toBe(34); // 동률이면 id 순
  });
  it("실데이터 규모(면적 가중)에서도 합이 정확히 같다", () => {
    const ws = [33.72, 56.99, 10.5, 16.78, 55.34, 48.2, 12.01, 99.99, 0.5, 71.3];
    const r = allocateLargestRemainder(5_913_581, ws.map((w, i) => ({ id: `u${String(i).padStart(2, "0")}`, w })));
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(5_913_581);
    expect(Math.max(...r.map((x) => x.adjust))).toBeLessThanOrEqual(1);
  });
  it("음수 총액(감면)도 합이 같다", () => {
    const r = allocateLargestRemainder(-101, [{ id: "a", w: 2 }, { id: "b", w: 1 }]);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(-101);
  });
  it("분모 0 은 zero_denominator", () => {
    expect(() => allocateLargestRemainder(100, [{ id: "a", w: 0 }, { id: "b", w: 0 }])).toThrow(/zero_denominator/);
  });
  it("가중치 0 인 호실은 0 원", () => {
    const r = allocateLargestRemainder(1000, [{ id: "a", w: 0 }, { id: "b", w: 3 }]);
    expect(r.find((x) => x.id === "a")!.amount).toBe(0);
    expect(r.find((x) => x.id === "b")!.amount).toBe(1000);
  });
});

describe("부가세 분리", () => {
  it("공급가액 106,405 → 세액 10,641(반올림)", () => expect(vatOf(106_405)).toBe(10_641));
  it("포함가 117,045 → 106,405 + 10,640 (원본 시트 L/1.1 방식)", () => expect(splitInclVat(117_045)).toEqual({ supply: 106_405, vat: 10_640 }));
  it("면세는 세액 0 — 호출부가 vatOf 를 부르지 않는다(규격)", () => expect(vatOf(0)).toBe(0));
});

describe("연체료(계약 승인값만)", () => {
  it("미승인이면 계산하지 않는다", () => {
    expect(() => lateFee({ ...approved, late_approved_at: null }, 100_000, "2026-08-25", "2026-09-30")).toThrow(/late_terms_unapproved/);
    expect(() => lateFee({ ...approved, late_rate: null }, 100_000, "2026-08-25", "2026-09-30")).toThrow(/late_terms_unapproved/);
    expect(lateTermsReady({ ...approved, late_cap_none: false, late_cap_pct: null })).toBe(false);
  });
  it("월 3% 단리 31일 = 3,100원 (SQL 자가검사와 같은 값)", () => {
    expect(lateFee(approved, 100_000, "2026-08-31", "2026-10-01")).toMatchObject({ amount: 3_100, days: 31 });
  });
  it("유예일 안이면 0원", () => {
    expect(lateFee({ ...approved, late_grace_days: 10 }, 100_000, "2026-09-01", "2026-09-10").amount).toBe(0);
  });
  it("상한(원금의 2%)이 적용된다", () => {
    expect(lateFee({ ...approved, late_cap_none: false, late_cap_pct: 2 }, 100_000, "2026-08-31", "2026-10-01").amount).toBe(2_000);
  });
  it("0033: 다음 달 창은 이전 부과 다음날부터(중복 부과 없음)", () => {
    // 납기 7/25, 7월 청구는 7/26~7/31(6일), 8월 청구는 8/1~8/31(31일)
    const july = lateFee(approved, 100_000, "2026-07-25", "2026-07-31");
    const aug = lateFee(approved, 100_000, "2026-07-25", "2026-08-31", { from: "2026-08-01" });
    expect(july).toMatchObject({ days: 6, from: "2026-07-26" });
    expect(aug).toMatchObject({ days: 31, from: "2026-08-01", amount: 3_100 });
  });
  it("0033: 누적 상한 — 이미 부과한 만큼 빼고 남은 한도까지만", () => {
    const t = { ...approved, late_cap_none: false, late_cap_pct: 5 };
    expect(lateFee(t, 100_000, "2026-07-25", "2026-08-31", { from: "2026-08-01", chargedBefore: 4_000 }).amount).toBe(1_000);
    expect(lateFee(t, 100_000, "2026-07-25", "2026-08-31", { from: "2026-08-01", chargedBefore: 5_000 }).amount).toBe(0);
  });
  it("0033: 반올림은 0.5 올림(음수도 같은 방향) — SQL bld_round 와 동일", () => {
    expect(vatOf(-5)).toBe(0);
    expect(vatOf(-15)).toBe(-1);
    expect(vatOf(15)).toBe(2);
  });
  it("연 이율 단리는 /365", () => {
    expect(lateFee({ ...approved, late_rate: 12, late_rate_unit: "annual" }, 365_000, "2026-01-01", "2026-01-11").amount).toBe(1_200); // 10일
  });
  it("VAT 경로와 분리: lateFee 본문은 VAT_RATE·0.1·10% 를 참조하지 않는다", () => {
    const src = lateFee.toString();
    expect(src).not.toMatch(/VAT_RATE|vatOf|0\.1\b|10\s*%/);
  });
});

describe("네 숫자(납부 요청액)", () => {
  it("= 당월 + 전월미납 + 연체 − 선납(가용 한도)", () => {
    expect(amountDue({ currentCharge: 280_000, priorUnpaid: 30_000, lateFee: 2_450, creditAvailable: 50_000 })).toEqual({ credit: 50_000, amountDue: 262_450 });
    expect(amountDue({ currentCharge: 100, priorUnpaid: 0, lateFee: 0, creditAvailable: 500 })).toEqual({ credit: 100, amountDue: 0 });
  });
});

describe("SQL 계약과의 대조(0031_building_cam.sql)", () => {
  it("선택 기능 키가 bld_feature_defs 와 같다(순서 무관)", () => {
    const keys = [...sql.matchAll(/^\s*\('([a-z_]+)',\s+'[^']*',\s+(true|false),\s+(true|false),\s+(true|false),\s+\d+\)/gm)];
    const sqlKeys = keys.map((m) => m[1]);
    expect(new Set(sqlKeys)).toEqual(new Set(BUILDING_FEATURE_KEYS));
    expect(sqlKeys).toHaveLength(BUILDING_FEATURE_KEYS.length);
    const defaultOn = keys.filter((m) => m[2] === "true").map((m) => m[1]);
    expect(new Set(defaultOn)).toEqual(new Set(BUILDING_FEATURE_DEFAULT_ON));
    const needsContract = keys.filter((m) => m[3] === "true").map((m) => m[1]);
    expect(new Set(needsContract)).toEqual(new Set(BUILDING_FEATURE_NEEDS_CONTRACT));
  });
  it("SQL 연체 함수 본문도 VAT 를 참조하지 않는다", () => {
    const body = /create or replace function crm\.bld_late_fee\([\s\S]*?\nend \$\$;/.exec(sql)?.[0] ?? "";
    expect(body.length).toBeGreaterThan(200);
    expect(body).not.toMatch(/vat|0\.1\b|10\s*%|1\.1\b/i);
  });
  it("확정 청구 UPDATE 를 막는 트리거·정정 revision·EXCLUDE 제약이 있다", () => {
    expect(sql).toMatch(/create trigger bld_bills_frozen before update or delete on crm\.bld_bills/);
    expect(sql).toMatch(/unique \(building_id, period, unit_id, bill_kind, revision\)/);
    expect(sql).toMatch(/constraint bld_units_no_overlap exclude using gist/);
    expect(sql).toMatch(/constraint bld_contracts_no_overlap exclude using gist/);
    expect(sql).toMatch(/industry in \('factory','rental','unmanned','salon','academy','building'\)/);
  });
  it("테이블 단위 grant select … to authenticated 는 신규 bld_ 테이블에만", () => {
    for (const m of sql.matchAll(/grant select on ((?:crm\.\w+,?\s*)+) to authenticated/g)) {
      for (const t of m[1].split(",").map((s) => s.trim()).filter(Boolean)) expect(t).toMatch(/^crm\.(bld_|v_bld_)/);
    }
  });
});
