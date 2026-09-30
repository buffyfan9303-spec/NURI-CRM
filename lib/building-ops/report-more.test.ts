/** 2026-09-30 보고서·명세서 보강 순수 함수 자가검사: 14항목 웹 집계(law14) · 검침 단가·건물 평균(statement-meter) · 12개월 흐름(trend) · 보고서 탭 이름표. */
import { describe, expect, it } from "vitest";
import type { BillRow, StdCategory } from "@/lib/domain/building-types";
import { law14Building, law14ByUnit } from "@/components/building/law14";
import { trendMonths, trendWindow } from "@/components/building/trend";
import { parseView, reportTitle } from "@/components/building-ops/report-tabs";
import { avgFor, avgText, meterUnitPrice, MIN_AVG_METERS, pctVsAvg, usageAverages } from "@/lib/pdf/statement-meter";

const bill = (unit_id: string, lines: [StdCategory, number][], party: string | null = "p1", kind: BillRow["bill_kind"] = "regular") =>
  ({ unit_id, bill_to_party_id: party, bill_kind: kind, trace: { lines: lines.map(([std_category, amount]) => ({ charge_type_id: std_category, std_category, name: std_category, supply: amount, vat: 0, exempt: 0, amount, basis: {} })) } }) as unknown as BillRow;
const label = (id: string) => id.toUpperCase();
const party = (id: string | null) => (id ? `party-${id}` : "없음");

describe("14항목 웹 집계", () => {
  const rows = law14ByUnit([
    bill("u2", [["general", 60_000], ["electric", 30_000]]),                 // 9만 원 → 금액 숨김
    bill("u1", [["general", 100_000], ["elevator", 50_000], ["other", 5_000], ["rent", 2_000_000]]),
    bill("u1", [["general", -10_000]], "p1", "correction"),                  // 같은 호실 정정본은 한 표로 합친다
  ], label, party);
  it("호실 순서·같은 호실 합산·명세서와 같은 규칙(law14Table)", () => {
    expect(rows.map((r) => r.unitLabel)).toEqual(["U1", "U2"]);
    expect(rows[0].table.rows[0].amount).toBe(90_000); // 100,000 − 10,000
    expect(rows[0].table.monthlyFee).toBe(90_000 + 50_000 + 5_000); // 임대료 제외
    expect(rows[0].table.amountsHidden).toBe(false);
    expect(rows[1].table.amountsHidden).toBe(true);
    expect(rows[0].party).toBe("party-p1");
  });
  it("건물 합계는 호실 표의 합(숨김 호실 금액 포함)이고 임대료·기타를 구분한다", () => {
    const t = law14Building(rows);
    expect(t.amounts[0]).toBe(90_000 + 60_000); // 일반관리비
    expect(t.amounts[4]).toBe(50_000); // 승강기
    expect(t.amounts[8]).toBe(30_000); // 전기
    expect(t.other).toBe(5_000);
    expect(t.rent).toBe(2_000_000);
    expect(t.monthlyFee).toBe(145_000 + 90_000);
    expect(t.hiddenUnits).toBe(1);
  });
});

describe("검침 건물 평균(개인정보 안전)", () => {
  const S = (usage: number, kind = "electric", unitLabel = "kWh") => ({ kind, unitLabel, usage });
  it("표본이 3개 미만이면 평균을 내보내지 않는다(2개면 상대 값이 그대로 드러남)", () => {
    expect(MIN_AVG_METERS).toBe(3);
    expect(usageAverages([S(100), S(300)]).size).toBe(0);
    expect(avgFor(usageAverages([S(100), S(200), S(300)]), "electric", "kWh")).toEqual({ avg: 200, count: 3 });
  });
  it("종류·단위별로 따로 내고, 사용량 0 이하(빈 호실)는 평균에서 뺀다", () => {
    const m = usageAverages([S(100), S(200), S(300), S(0), S(-5), S(10, "water", "㎥"), S(20, "water", "㎥")]);
    expect(avgFor(m, "electric", "kWh")).toEqual({ avg: 200, count: 3 });
    expect(avgFor(m, "water", "㎥")).toBeNull(); // 물은 2개뿐
  });
  it("평균 대비 % 와 한 줄 문구(다른 호실 정보 없음)", () => {
    expect(pctVsAvg(224, 200)).toBe(12);
    expect(pctVsAvg(150, 200)).toBe(-25);
    expect(pctVsAvg(10, 0)).toBeNull();
    expect(avgText(224, { avg: 200, count: 3 }, "kWh")).toBe("건물 평균 200 kWh(3곳) · 평균보다 +12%");
    expect(avgText(150, { avg: 200, count: 3 }, "kWh")).toContain("평균보다 −25%");
    expect(avgText(200, { avg: 200, count: 3 }, "kWh")).toContain("평균과 같음");
    expect(avgText(1, null, "kWh")).toBeNull();
  });
});

describe("검침 단가(서버 basis 그대로)", () => {
  const isElec = (id: string) => id === "e1" || id === "e2";
  const L = (charge_type_id: string, basis: Record<string, unknown>) => ({ charge_type_id, basis });
  it("검침 항목의 rate 가 하나로 같으면 그 값, 다르거나 없으면 null", () => {
    expect(meterUnitPrice([L("e1", { method: "meter_usage", rate: 145, basis: 300 }), L("g1", { method: "area", rate: 999 })], isElec)).toBe(145);
    expect(meterUnitPrice([L("e1", { method: "meter_usage", rate: 145 }), L("e2", { method: "meter_usage", rate: 145 })], isElec)).toBe(145);
    expect(meterUnitPrice([L("e1", { method: "meter_usage", rate: 145 }), L("e2", { method: "meter_usage", rate: 150 })], isElec)).toBeNull();
    expect(meterUnitPrice([L("e1", { method: "meter_usage", numerator: 3, denominator: 10 })], isElec)).toBeNull(); // 비용을 사용량 비율로 나눈 항목
    expect(meterUnitPrice([], isElec)).toBeNull();
  });
});

describe("건물 12개월 흐름·전년 같은 달", () => {
  const totals = new Map<string, number>([["2026-09", 1_100_000], ["2026-08", 1_000_000], ["2025-09", 1_000_000], ["2025-08", 0], ["2026-05", 900_000]]);
  const m = trendMonths("2026-09", totals);
  it("오래된 → 최신 12개월, 확정 전은 null(0원 아님)", () => {
    expect(m).toHaveLength(12);
    expect(m[0].period).toBe("2025-10");
    expect(m[11].period).toBe("2026-09");
    expect(m[10].cur).toBe(1_000_000);
    expect(m[9].cur).toBeNull(); // 2026-07 미확정
  });
  it("전년 대비는 둘 다 확정일 때만, 전년이 0이면 차이율 없음", () => {
    expect(m[11]).toMatchObject({ prevYear: 1_000_000, diff: 100_000, pct: 0.1 });
    expect(m[10]).toMatchObject({ prevYear: 0, diff: 1_000_000, pct: null });
    expect(m[7]).toMatchObject({ cur: 900_000, prevYear: null, diff: null, pct: null }); // 2026-05, 2025-05 미확정
  });
  it("읽을 달 창은 24개월(오래된 → 최신)", () => {
    const w = trendWindow("2026-09");
    expect(w).toHaveLength(24);
    expect(w[0]).toBe("2024-10");
    expect(w[23]).toBe("2026-09");
  });
});

describe("보고서 탭 이름(맨 위 경로 표시)", () => {
  it("view 값 → 화면 제목, 모르는 값은 월별 정산", () => {
    expect(reportTitle(null)).toBe("월별 정산 보고서");
    expect(reportTitle("law14")).toBe("상가 14항목 내역");
    expect(reportTitle("budget")).toBe("예산 대비 실적");
    expect(reportTitle("settle")).toBe("월별 정산 보고서");
    expect(reportTitle("nope")).toBe("월별 정산 보고서");
    expect(parseView(["owners"])).toBe("owners");
  });
});
