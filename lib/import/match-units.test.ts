import { describe, expect, it } from "vitest";
import { buildMatchUnits, matchUnit, nameKey, type MatchUnit } from "./match-units";

const U: MatchUnit[] = [
  { id: "a1403", dong: "201", unitNo: "1403", names: ["가나상사(주)"] },
  { id: "b1403", dong: "202", unitNo: "1403", names: ["다라전자"] },
  { id: "a0501", dong: "201", unitNo: "501", names: ["김철"] },
  { id: "a0502", dong: "201", unitNo: "502", names: ["김철수", "박민수"] },
  { id: "a0503", dong: "201", unitNo: "503", names: ["박민수"] },
  { id: "a3000", dong: "201", unitNo: "3000", names: [] },
  { id: "a0202", dong: "201", unitNo: "202", names: [] },
];
const m = (depositor: string, extra: { memo?: string; amount?: number } = {}) => matchUnit({ depositor, ...extra }, U);

describe("동+호 표기 변형", () => {
  it.each(["201동 1403호", "201동1403호", "201-1403", "201 - 1403", "201동 1403", "관리비 201동 1403호 9월"])("%s → 201동 1403호", (t) => {
    expect(m(t)).toEqual({ status: "auto", unitIds: ["a1403"], by: "dongho" });
  });
  it("호만 적으면 동이 여러 개라 확인 필요", () => {
    const r = m("1403호");
    expect(r).toMatchObject({ status: "review", by: "dongho" });
    expect([...r.unitIds].sort()).toEqual(["a1403", "b1403"]);
  });
  it("호만 적어도 그 호가 한 곳뿐이면 자동", () => {
    expect(m("501호 관리비")).toEqual({ status: "auto", unitIds: ["a0501"], by: "dongho" });
  });
});

describe("호실번호 단독", () => {
  it("숫자 3~4자리가 호실과 정확히 같으면 자동", () => {
    expect(m("홍길동 501")).toEqual({ status: "auto", unitIds: ["a0501"], by: "room" });
  });
  it("동이 여러 개인 호실번호는 확인 필요", () => {
    expect(m("1403").status).toBe("review");
  });
  it("입금액과 같은 숫자는 호실로 보지 않는다", () => {
    expect(m("관리비 3000", { amount: 3000 })).toEqual({ status: "none", unitIds: [], by: null });
    expect(m("관리비 3000")).toMatchObject({ status: "auto", unitIds: ["a3000"] });
  });
  it("쉼표 금액·날짜·전화번호 속 숫자는 호실이 아니다", () => {
    expect(m("관리비 1,202,500").status).toBe("none");
    expect(m("2026-09-30 입금").status).toBe("none");
    expect(m("2026.09 관리비").status).toBe("none");
    expect(m("2026년 9월분").status).toBe("none");
    expect(m("010-1403-1234").status).toBe("none");
    expect(m("202원").status).toBe("none");
  });
  it("호실에 없는 숫자는 미지정", () => {
    expect(m("홍길동 999").status).toBe("none");
  });
});

describe("이름·상호", () => {
  it("(주)·주식회사·공백을 빼고 비교한다", () => {
    expect(nameKey("(주) 가나 상사")).toBe("가나상사");
    expect(m("가나상사")).toEqual({ status: "auto", unitIds: ["a1403"], by: "name" });
    expect(m("주식회사 가나상사")).toMatchObject({ status: "auto", unitIds: ["a1403"] });
    expect(m("가나상사(주)")).toMatchObject({ status: "auto", unitIds: ["a1403"] });
  });
  it("이름 일부만 겹치는 다른 사람은 잡지 않는다(김철 vs 김철수)", () => {
    expect(m("김철수").unitIds).toEqual(["a0502"]);
    expect(m("김철")).toEqual({ status: "auto", unitIds: ["a0501"], by: "name" });
  });
  it("이름 뒤에 님·숫자가 붙는 정도는 같은 사람", () => {
    expect(m("김철님").unitIds).toEqual(["a0501"]);
    expect(m("다라전자 관리비").unitIds).toEqual(["b1403"]);
  });
  it("동명이인은 확인 필요", () => {
    const r = m("박민수");
    expect(r.status).toBe("review");
    expect([...r.unitIds].sort()).toEqual(["a0502", "a0503"]);
  });
  it("호실 글자와 이름이 다른 호실을 가리키면 확인 필요", () => {
    const r = m("다라전자 201동 1403호");
    expect(r.status).toBe("review");
    expect([...r.unitIds].sort()).toEqual(["a1403", "b1403"]);
  });
  it("메모 칸에서도 찾는다", () => {
    expect(matchUnit({ depositor: "이체", memo: "202동 1403호 9월" }, U)).toMatchObject({ status: "auto", unitIds: ["b1403"] });
  });
  it("아무 단서도 없으면 미지정", () => {
    expect(m("홍길동")).toEqual({ status: "none", unitIds: [], by: null });
  });
});

describe("buildMatchUnits", () => {
  it("계약의 임차인·청구처·대표자 이름을 호실에 붙인다", () => {
    const r = buildMatchUnits(
      [{ id: "u1", dong: null, unit_no: "101" }, { id: "u2", dong: null, unit_no: "102" }],
      [{ unit_id: "u1", tenant_party_id: "p1", bill_to_party_id: "p2" }],
      [{ id: "p1", name: "누리상사", ceo_name: "이대표" }, { id: "p2", name: "누리회계", ceo_name: null }],
    );
    expect([...r[0].names].sort()).toEqual(["누리상사", "누리회계", "이대표"]);
    expect(r[1].names).toEqual([]);
  });
});
