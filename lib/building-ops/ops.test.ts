/** 건물 관리비 화면 순수 함수 회귀: 검침 계산·붙여넣기, 호실 표 해석, 연체 조건 완전성(기본값 없음). */
import { describe, expect, it } from "vitest";
import { parsePasteColumn, readingState, suggestOverride, usageOf } from "@/components/building-ops/meter-calc";
import { parseRange, parseUnitRows } from "@/components/building-ops/unit-parse";
import { emptyLateForm, lateFormComplete, lateFormToPatch, lateStatusOf } from "@/components/building-ops/late-terms";
import { won } from "@/components/building-ops/format";

describe("meter-calc", () => {
  it("사용량은 배율을 곱한다", () => expect(usageOf(100, 150, 2)).toBe(100));
  it("상태 판정", () => {
    expect(readingState(100, "", null)).toBe("empty");
    expect(readingState(100, "abc", null)).toBe("invalid");
    expect(readingState(100, "90", null)).toBe("reversed");
    expect(readingState(100, "12,000", 9999)).toBe("over_max");
    expect(readingState(100, "120", 9999)).toBe("ok");
  });
  it("역전 사유별 제안", () => {
    expect(suggestOverride("rollover", 9990, 10, 1, 9999)).toBe("20");
    expect(suggestOverride("replaced", 500, 30, 2, null)).toBe("60");
    expect(suggestOverride("typo", 500, 30, 1, null)).toBe("");
  });
  it("열 붙여넣기", () => expect(parsePasteColumn("1,200\t9\r\n30\n\n")).toEqual(["1200", "30"]));
});

describe("unit-parse", () => {
  it("머리글 건너뛰고 오류 행은 원문 줄 번호를 가진다", () => {
    const r = parseUnitRows("동\t층\t호실\t용도\nA\t3\t301\t사무실\t84.5\nA\t3\t\t상가\nA\t3\t302\t창고");
    expect(r.map((x) => [x.line, !!x.error])).toEqual([[2, false], [3, true], [4, true]]);
    expect(r[0].input).toMatchObject({ unit_no: "301", use_kind: "office", area_exclusive: 84.5, dong: "A" });
  });
  it("daterange 해석", () => {
    expect(parseRange("[2026-01-01,2027-01-01)")).toEqual({ from: "2026-01-01", to: "2027-01-01" });
    expect(parseRange("[2026-01-01,)")).toEqual({ from: "2026-01-01", to: null });
  });
});

describe("late-terms", () => {
  it("빈 폼은 미설정이고 기본값이 없다", () => {
    expect(lateFormComplete(emptyLateForm())).toBe(false);
    expect(lateStatusOf({})).toBe("unset");
    expect(lateFormToPatch(emptyLateForm())).toMatchObject({ late_rate: null, late_method: null, late_cap_none: false });
  });
  it("전부 입력하면 승인 대기, 승인 열이 있으면 승인됨", () => {
    const t = { late_rate: 1.5, late_rate_unit: "monthly", late_method: "simple", late_grace_days: 0, late_basis: "principal", late_partial_order: "oldest_first", late_cap_none: true } as const;
    expect(lateStatusOf(t)).toBe("pending");
    expect(lateStatusOf({ ...t, late_approved_by: "u", late_approved_at: "2026-09-01" })).toBe("approved");
    expect(lateStatusOf({ late_rate: 1 })).toBe("incomplete");
  });
});

describe("format", () => {
  it("음수는 U+2212, 권한 없음은 문구", () => {
    expect(won(-1234)).toBe("\u22121,234원");
    expect(won(null)).toBe("권한 없음");
  });
});

import { candidatesFor, defaultAllocAmount } from "@/components/building-ops/payment-candidates";
import { ageDays, bucketOf } from "@/components/building-ops/aging";

describe("payment-candidates", () => {
  const recs = [
    { id: "r1", unit_id: "u1", party_id: "p1", period: "2026-07", due_date: "2026-08-25", outstanding: 500 },
    { id: "r2", unit_id: "u2", party_id: "p2", period: "2026-08", due_date: "2026-09-25", outstanding: 1200 },
    { id: "r3", unit_id: "u3", party_id: "p3", period: "2026-08", due_date: "2026-09-25", outstanding: 0 },
  ];
  const name = (id: string | null) => ({ p1: "(주)가나다", p2: "홍길동", p3: "다른사람" } as Record<string, string>)[id ?? ""] ?? null;
  it("같은 호실·입금자명·금액 일치 순으로 점수", () => {
    const c = candidatesFor({ unit_id: null, payer_name: "홍길동", unallocated: 1200 }, recs, name);
    expect(c.map((x) => x.id)).toEqual(["r2"]);
    expect(c[0].why).toEqual(["입금자명 일치", "금액 일치"]);
  });
  it("잔액 0 채권과 점수 0 채권은 제외", () => {
    expect(candidatesFor({ unit_id: "u3", payer_name: null, unallocated: 9 }, recs, name)).toEqual([]);
  });
  it("법인 접두어는 무시하고 이름 매칭", () => {
    expect(candidatesFor({ unit_id: null, payer_name: "가나다", unallocated: 1 }, recs, name)[0]?.id).toBe("r1");
  });
  it("기본 배정액은 부분납을 허용하는 최솟값", () => {
    expect(defaultAllocAmount(300, 500)).toBe(300);
    expect(defaultAllocAmount(900, 500)).toBe(500);
  });
});

describe("aging", () => {
  it("서버 bld_aging 과 같은 경계", () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual(["not_due", "d0_30", "d0_30", "d31_60", "d31_60", "d61_90", "d61_90", "d90p"]);
  });
  it("기한 전·기한 없음은 0일", () => {
    expect(ageDays("2026-09-29", "2026-10-05")).toBe(0);
    expect(ageDays("2026-09-29", null)).toBe(0);
    expect(ageDays("2026-09-29", "2026-08-30")).toBe(30);
  });
});

import ExcelJS from "exceljs";
import { buildReportWorkbook, tableFromReport } from "@/components/building-ops/report-xlsx";
import type { CategoryReport } from "@/lib/domain/building-types";

describe("report-xlsx", () => {
  const rep: CategoryReport = {
    period: "2026-09", prev_period: "2026-08", total: 1100, prev_total: 900,
    categories: [{ std_category: "cleaning", supply: 1000, vat: 100, exempt: 0, amount: 1100, prev_amount: 700, diff: 400 }],
  };
  it("16분류로 펼치고 전월에만 있던 금액을 따로 남긴다", () => {
    const t = tableFromReport(rep);
    expect(t.rows).toHaveLength(16);
    expect(t.rows.find((r) => r.key === "cleaning")?.amount).toBe(1100);
    expect(t.prevOnly).toBe(200);
  });
  it("Excel 을 다시 읽으면 숫자 셀이 정수 금액이고 원장 시트가 붙는다", async () => {
    const buf = await buildReportWorkbook({ buildingName: "누리타워", period: "2026-09", report: rep, ledger: { units: [{ unit_no: "301", area: 84.5 }], payments: [], bills: [{ unit_no: "301", amount_due: 1100, lines: [{ name: "청소", amount: 1100 }] }] } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["분류별 집계", "호실", "청구", "수납"]);
    const s = wb.getWorksheet("분류별 집계")!;
    const cleaning = s.getRows(1, 30)!.find((r) => r.getCell(1).value === "청소비")!;
    expect(cleaning.getCell(5).value).toBe(1100);
    expect(wb.getWorksheet("청구")!.getRow(2).getCell(3).value).toBe("청소:1100");
  });
});

import { allocOptions, draftToInput, emptyDraft, firstBadStep, previewOf, stepError } from "@/components/building-ops/charge-wizard";

describe("charge-wizard", () => {
  const units = [
    { id: "a", label: "101", area: 30, share: 1, weight: 1, use_kind: "retail" },
    { id: "b", label: "102", area: 70, share: 1, weight: 1, use_kind: "retail" },
    { id: "c", label: "공용", area: 500, share: 0, weight: 1, use_kind: "common" },
  ];
  const base = () => ({ ...emptyDraft(), name: "청소비", std_category: "cleaning" as const, source_kind: "expense" as const, payer: "tenant" as const, alloc_method: "area" as const, tax_treatment: "taxable" as const });
  it("직접 입력 출처는 배분도 직접뿐", () => {
    expect(allocOptions("direct")).toEqual(["direct"]);
    expect(allocOptions("expense")).not.toContain("fixed");
    expect(stepError(3, { ...base(), source_kind: "direct", alloc_method: "area" })).toMatch(/쓸 수 없는/);
  });
  it("검침 배분은 계량기 종류가 필요, 정액은 정수", () => {
    expect(stepError(3, { ...base(), alloc_method: "meter_usage" })).toMatch(/계량기/);
    expect(stepError(3, { ...base(), source_kind: "rate", alloc_method: "fixed", fixed_amount: "" })).toMatch(/정액/);
    expect(stepError(3, { ...base(), source_kind: "rate", alloc_method: "fixed", fixed_amount: "1000" })).toBeNull();
    expect(firstBadStep(base())).toBe(-1);
    expect(firstBadStep({ ...base(), name: " " })).toBe(0);
  });
  it("서버 입력 변환: 단가·정액·계량기를 조건에 맞게만 보냄", () => {
    const fx = draftToInput({ ...base(), source_kind: "rate", alloc_method: "fixed", fixed_amount: "5000", unit_rate: "9" });
    expect(fx.fixed_amount).toBe(5000);
    expect(fx.unit_rate).toBeNull();
    const ex = draftToInput(base());
    expect([ex.fixed_amount, ex.unit_rate, ex.meter_kind]).toEqual([null, null, null]);
  });
  it("미리보기: 공용 호실 제외, 최대잔여법으로 합계 보존", () => {
    const r = previewOf(base(), units, 1_000_001);
    expect(r.kind).toBe("rows");
    if (r.kind === "rows") { expect(r.rows.map((x) => x.id)).toEqual(["a", "b"]); expect(r.total).toBe(1_000_001); expect(r.rows[0].amount).toBe(300_000); }
  });
  it("미리보기: 관리단·검침·직접은 금액을 만들지 않고 안내", () => {
    expect(previewOf({ ...base(), payer: "association" }, units, 1000).kind).toBe("note");
    expect(previewOf({ ...base(), alloc_method: "meter_usage" }, units, 1000).kind).toBe("note");
    expect(previewOf({ ...base(), source_kind: "direct", alloc_method: "direct" }, units, 1000).kind).toBe("note");
    expect(previewOf({ ...base(), alloc_method: "share" }, [{ ...units[0], share: 0 }], 1000).kind).toBe("note");
  });
});

import { approvalNoNote, fileCount, tally } from "@/components/building-ops/tax-ui";

describe("tax-ui", () => {
  it("파일은 100건 단위로 나눈다", () => {
    expect([0, 1, 100, 101, 250].map(fileCount)).toEqual([0, 1, 1, 2, 3]);
  });
  it("상태 집계", () => {
    expect(tally([{ issue_status: "ready" }, { issue_status: "issued" }, { issue_status: "ready" }])).toMatchObject({ ready: 2, issued: 1, blocked: 0 });
  });
  it("승인번호 안내: 빈 값과 자릿수 오류만 안내, 24자리는 통과", () => {
    expect(approvalNoNote("")).toMatch(/입력/);
    expect(approvalNoNote("123")).toMatch(/24자리/);
    expect(approvalNoNote("20260929-41000012-00001234")).toBeNull();
  });
});

import { assignColumn, colLetter, missingRequired, sheetRowNo } from "@/components/building-ops/import-ui";

describe("import-ui", () => {
  it("한 열은 한 항목에만 지정된다", () => {
    expect(assignColumn({ room: 0, currReading: 2 }, "prevReading", 2)).toEqual({ room: 0, prevReading: 2 });
    expect(assignColumn({ room: 0 }, "room", null)).toEqual({});
  });
  it("필수 열 누락", () => {
    expect(missingRequired("meter", { room: 0 })).toEqual(["currReading"]);
    expect(missingRequired("bank", {})).toEqual([]);
  });
  it("엑셀 행 번호와 열 문자", () => {
    expect(sheetRowNo(1, 0)).toBe(2);
    expect(sheetRowNo(3, 4)).toBe(8);
    expect([0, 25, 26, 27, 701, 702].map(colLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

import { FEATURE_GROUPS, FEATURE_INFO } from "@/components/building-ops/feature-labels";
import { BUILDING_FEATURE_KEYS } from "@/lib/domain/building-types";

describe("feature-labels", () => {
  it("31개 기능 모두 문구가 있고 묶음에 정확히 한 번씩 들어 있다", () => {
    expect(Object.keys(FEATURE_INFO).sort()).toEqual([...BUILDING_FEATURE_KEYS].sort());
    expect(FEATURE_GROUPS.flatMap((g) => g.keys).sort()).toEqual([...BUILDING_FEATURE_KEYS].sort());
    expect(BUILDING_FEATURE_KEYS).toHaveLength(31);
  });
});

import { METER_KIND_LABEL, fmtLocal } from "@/components/building-ops/format";

describe("QA 수정 회귀 (D1·D6)", () => {
  it("계량기 종류 표시명은 클라이언트 파일이 아닌 format 에서 온다(D1)", () => {
    expect(METER_KIND_LABEL.electric).toBe("전기");
    expect(Object.keys(METER_KIND_LABEL)).toHaveLength(5);
  });
  it("UTC 시각을 사업장 시간대로 바꾼다(D6)", () => {
    expect(fmtLocal("2026-09-29T10:49:00.000+00:00", "Asia/Seoul")).toBe("2026-09-29 19:49");
    expect(fmtLocal("2026-09-29T23:30:00Z", "Asia/Seoul")).toBe("2026-09-30 08:30");
  });
});
