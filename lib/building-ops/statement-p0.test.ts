/** 관리비 명세서 P0 보강 순수 함수(lib/pdf/statement-p0.ts) 자가검사. */
import { describe, expect, it } from "vitest";
import { STD_CATEGORIES, type LateFeeCalc, type ReceivableRow, type StdCategory } from "@/lib/domain/building-types";
import { disputeNotice, law14Table, LAW14, LAW14_MIN_TOTAL, lateFeeFormulaLines, priorUnpaidRows, statementDensity, supplierLines, unitInfoLine, won } from "@/lib/pdf/statement-p0";

const L = (std_category: StdCategory, amount: number) => ({ std_category, amount });

describe("상가 14항목 대응", () => {
  it("우리 표준 분류에서 임대료·기타를 뺀 14개가 표준 순서대로 1~14호에 1:1 대응한다", () => {
    expect(LAW14).toHaveLength(14);
    expect(LAW14.map((x) => x.no)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(LAW14.map((x) => x.cat)).toEqual(STD_CATEGORIES.filter((c) => c !== "rent" && c !== "other"));
  });
  it("분류별 소계·포함 여부·14항목 밖 줄", () => {
    const t = law14Table([L("general", 50_000), L("general", 25_000), L("elevator", 30_000), L("electric", 0), L("other", 7_000), L("rent", 1_000_000)]);
    expect(t.rows.find((r) => r.no === 1)).toMatchObject({ amount: 75_000, included: true });
    expect(t.rows.find((r) => r.no === 9)).toMatchObject({ amount: 0, included: true }); // 줄은 있고 0원
    expect(t.rows.find((r) => r.no === 2)).toMatchObject({ amount: 0, included: false }); // 줄 자체가 없음
    expect(t.outside.map((o) => o.amount)).toEqual([7_000, 1_000_000]);
    expect(t.monthlyFee).toBe(75_000 + 30_000 + 7_000); // 임대료는 관리비가 아님
    expect(t.amountsHidden).toBe(false);
  });
  it("월 관리비 10만 원 미만이면 금액을 숨긴다(경계 99,999 / 100,000 / 0줄)", () => {
    expect(LAW14_MIN_TOTAL).toBe(100_000);
    expect(law14Table([L("cleaning", 99_999)]).amountsHidden).toBe(true);
    expect(law14Table([L("cleaning", 100_000)]).amountsHidden).toBe(false);
    expect(law14Table([L("cleaning", 60_000), L("rent", 900_000)]).amountsHidden).toBe(true);
    expect(law14Table([]).amountsHidden).toBe(false);
  });
});

describe("관리주체·호실 머리 정보", () => {
  it("사업자번호는 000-00-00000 로, 없는 조각은 줄에서 뺀다", () => {
    expect(supplierLines({ name: "누리관리단", biz_reg_no: "1234567890", ceo_name: "홍길동", address: "서울 어딘가 1" })).toEqual([
      "관리주체 누리관리단 · 사업자번호 123-45-67890 · 대표 홍길동", "주소 서울 어딘가 1",
    ]);
    expect(supplierLines({ name: "누리관리단", biz_reg_no: null, ceo_name: null, address: null })).toEqual(["관리주체 누리관리단"]);
    expect(supplierLines(null)).toEqual([]);
  });
  it("동·층·용도·면적. 0 이거나 비어 있으면 뺀다", () => {
    expect(unitInfoLine({ dong: "A", floor: "3", use_kind: "retail", area_exclusive: 33.5, area_common: 12 })).toBe("A동 · 3층 · 상가 · 전용 33.5㎡ · 공용 12㎡");
    expect(unitInfoLine({ dong: null, floor: "B1", use_kind: "office", area_exclusive: 20.25, area_common: 0 })).toBe("B1층 · 사무실 · 전용 20.25㎡");
    expect(unitInfoLine(null)).toBe("");
  });
});

const rec = (period: string, amount: number, paid: number, x: Partial<ReceivableRow> = {}): ReceivableRow => ({
  id: `r-${period}-${Math.random()}`, business_id: "B", building_id: "G", bill_id: null, unit_id: "U", party_id: "P1", contract_id: null, period, kind: "bill", amount, paid, credit_applied: 0,
  status: "open", due_date: `${period}-25`, created_at: "", ...x,
});

describe("밀린 돈 달별 내역", () => {
  it("서버의 전월 미납 조건(열림·이전 달·같은 당사자·남은 금액)과 같은 행만 모은다", () => {
    const { rows, sum } = priorUnpaidRows({ period: "2026-09", bill_to_party_id: "P1" }, [
      rec("2026-08", 300_000, 100_000),                       // 남은 200,000
      rec("2026-07", 250_000, 0),                              // 250,000
      rec("2026-08", 4_000, 0, { kind: "late_fee" }),          // 연체료 4,000
      rec("2026-09", 999_000, 0),                              // 이번 달 = 제외
      rec("2026-06", 100_000, 100_000),                        // 다 냄 = 제외
      rec("2026-06", 100_000, 0, { status: "paid" }),          // 닫힘 = 제외
      rec("2026-07", 88_000, 0, { party_id: "P2" }),           // 다른 당사자 = 제외
    ]);
    expect(rows.map((r) => [r.label, r.amount])).toEqual([
      ["2026년 7월분 관리비", 250_000], ["2026년 8월분 관리비", 200_000], ["2026년 8월분 연체료", 4_000],
    ]);
    expect(sum).toBe(454_000);
  });
  it("당사자가 둘 다 없으면 같은 것으로 본다(is not distinct from)", () => {
    expect(priorUnpaidRows({ period: "2026-09", bill_to_party_id: null }, [rec("2026-08", 10, 0, { party_id: null })]).sum).toBe(10);
  });
});

describe("연체료 산식", () => {
  const item: LateFeeCalc = { amount: 1_273, days: 31, from: "2026-08-01", to: "2026-08-31", rate: 15, unit: "annual", method: "simple", grace_days: 0, cap_pct: null, principal: 100_000, period: "2026-07" };
  it("기준액·이율·기간·일수·금액을 한 줄로", () => {
    const r = lateFeeFormulaLines([item]);
    expect(r.lines).toEqual(["2026년 7월분 미납액 100,000원 × 연 15%(단리) × 8월 1일~8월 31일 31일 = 1,273원"]);
    expect(r.more).toBeNull();
  });
  it("유예 일수·최대 %는 괄호로, 금액 0 인 줄은 뺀다, 많으면 건수·합계로 묶는다", () => {
    expect(lateFeeFormulaLines([{ ...item, grace_days: 5, cap_pct: 20 }]).lines[0]).toMatch(/\(납기 뒤 5일은 유예, 최대 20%\)$/);
    expect(lateFeeFormulaLines([{ ...item, amount: 0 }]).lines).toEqual([]);
    const many = lateFeeFormulaLines([item, item, item, item, item], 3);
    expect(many.lines).toHaveLength(3);
    expect(many.more).toEqual({ count: 2, amount: 2_546 });
    expect(lateFeeFormulaLines(null).lines).toEqual([]);
  });
});

describe("이의·문의 안내·글자 단계·금액 표기", () => {
  it("이의 안내는 항상 나오고 '입주자 문의·이의' 접수를 알린다. 연락처는 있을 때만", () => {
    expect(disputeNotice(null).text).toContain("입주자 문의·이의");
    expect(disputeNotice(null).office).toBeNull();
    expect(disputeNotice("관리사무소 · 02-000-0000").office).toBe("관리사무소 · 02-000-0000");
  });
  it("줄이 늘수록 글자 단계가 커지고(0→2) 줄어들지 않는다", () => {
    const base = { law14: false, prior: 0, late: 0, meters: 0, notice: false, chart: false, stub: false, supplier: 0 };
    const seq = [5, 12, 20, 28, 40].map((n) => statementDensity({ ...base, lines: n }));
    expect(seq[0]).toBe(0);
    expect(seq[seq.length - 1]).toBe(2);
    expect([...seq].sort()).toEqual(seq);
    expect(statementDensity({ ...base, lines: 8, law14: true, prior: 3, late: 1, meters: 2, notice: true, chart: true, stub: true, supplier: 2 })).toBeGreaterThanOrEqual(1);
  });
  it("won: 정수 원 단위, 음수는 − 기호", () => {
    expect(won(1234567)).toBe("1,234,567원");
    expect(won(-3000)).toBe("−3,000원");
    expect(won(0)).toBe("0원");
  });
});
