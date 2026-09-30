/** 서버 오류·경고 문장표 회귀: 코드 → 쉬운 문장, 영어 코드·SQL 원문이 화면 문장에 새지 않는다. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BUILDING_ERROR_FALLBACK, BUILDING_ERROR_TEXT, BUILDING_ISSUE_TEXT, plainBuildingError, plainIssueMessage } from "@/lib/domain/building-errors";

const ENGLISH = /[A-Za-z]{2,}/; // 화면 문장에 영어 단어(코드·SQL·revision 등)가 없어야 한다.

describe("BUILDING_ERROR_TEXT / BUILDING_ISSUE_TEXT", () => {
  it("모든 문장에 영어 단어가 없다", () => {
    for (const [k, v] of [...Object.entries(BUILDING_ERROR_TEXT), ...Object.entries(BUILDING_ISSUE_TEXT), ["fallback", BUILDING_ERROR_FALLBACK]]) expect(v, k).not.toMatch(ENGLISH);
  });
  it("예전 어려운 말(승인·정정·원천·배분·검침·채권)이 없다", () => {
    for (const [k, v] of Object.entries({ ...BUILDING_ERROR_TEXT, ...BUILDING_ISSUE_TEXT })) expect(v, k).not.toMatch(/승인(?!번호)|정정|원천|배분|검침|채권|미수|공급가액|revision/);
  });
  it("서버 migration(0031~0034)이 보내는 힌트 코드가 전부 표에 있다", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    if (!fs.existsSync(dir)) return; // 저장소 밖에서 돌리면 건너뜀
    const codes = new Set<string>();
    for (const f of fs.readdirSync(dir).filter((x) => /^003[1-4]_/.test(x))) {
      for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/hint\s*=\s*'([a-z_]+)'/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(30);
    expect(Array.from(codes).filter((c) => !BUILDING_ERROR_TEXT[c])).toEqual([]);
  });
});

describe("plainBuildingError", () => {
  it("힌트 코드는 쉬운 문장으로 바꾸고 힌트는 그대로 돌려준다", () => {
    const r = plainBuildingError({ code: "22023", message: "period_locked: calc on approved period", hint: "period_locked" });
    expect(r.hint).toBe("period_locked");
    expect(r.message).toBe(BUILDING_ERROR_TEXT.period_locked);
    expect(r.message).toContain("금액 고치기");
  });
  it("hint 열이 비어도 메시지 앞의 코드로 찾는다", () => {
    expect(plainBuildingError({ message: "feature_off: 꺼짐" }).message).toBe(BUILDING_ERROR_TEXT.feature_off);
  });
  it("권한 없음(42501)·겹침·중복·제약 위반·없음은 SQL 원문 없이 문장만", () => {
    expect(plainBuildingError({ code: "42501", message: "permission denied for table bld_budgets" })).toEqual({ message: BUILDING_ERROR_TEXT.forbidden, hint: "forbidden" });
    for (const code of ["23P01", "23505", "23514", "P0002"]) {
      const r = plainBuildingError({ code, message: 'duplicate key value violates unique constraint "bld_budgets_building_id_year_std_category_key"' });
      expect(r.message).not.toMatch(ENGLISH);
      expect(r.message).not.toContain("bld_");
    }
  });
  it("모르는 오류는 일반 문장(원문 노출 없음, 힌트 없음)", () => {
    const r = plainBuildingError({ code: "XX000", message: "syntax error at or near \"select\" in crm.bld_bills" });
    expect(r).toEqual({ message: BUILDING_ERROR_FALLBACK });
  });
});

describe("plainIssueMessage", () => {
  it("표에 있는 코드는 쉬운 말, 없는 코드는 서버 문장 그대로", () => {
    expect(plainIssueMessage("missing_reading", "검침값이 없습니다")).toBe("계량기 숫자가 없습니다.");
    expect(plainIssueMessage("rate_missing", "정액 금액이 없습니다")).toBe("정액 금액이 없습니다");
  });
});
