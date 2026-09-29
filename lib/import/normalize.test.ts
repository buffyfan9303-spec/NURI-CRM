import { describe, expect, it } from "vitest";
import { matchRoom, normalizePeriod, normalizeRoomRaw, parseAmount, parseDate, parseDateTime, txnLocalToIso } from "./normalize";

describe("parseAmount", () => {
  it("콤마/원 단위를 정수로 변환한다", () => {
    expect(parseAmount("16,500원")).toBe(16500);
    expect(parseAmount("16500")).toBe(16500);
  });
  it("괄호/후행 하이픈 음수를 처리한다", () => {
    expect(parseAmount("(1,000)")).toBe(-1000);
    expect(parseAmount("1000-")).toBe(-1000);
    expect(parseAmount("-1000")).toBe(-1000);
  });
  it("빈 값/하이픈만 있으면 null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
  });
});

describe("parseDate", () => {
  it("점/슬래시/하이픈 구분자를 처리한다", () => {
    expect(parseDate("2026.08.31")).toBe("2026-08-31");
    expect(parseDate("2026-08-31")).toBe("2026-08-31");
    expect(parseDate("26/08/31")).toBe("2026-08-31");
  });
  it("엑셀 일련번호를 날짜로 변환한다", () => {
    // 45536 = 2024-09-01 (엑셀 기준)
    expect(parseDate("45536")).toMatch(/^2024-08-3\d$|^2024-09-01$/);
  });
});

describe("normalizePeriod", () => {
  it("2026-08 형태로 통일한다", () => {
    expect(normalizePeriod("2026.08")).toBe("2026-08");
    expect(normalizePeriod("2026년 8월")).toBe("2026-08");
  });
});

describe("room normalization + matching", () => {
  it("다양한 호실 표기를 통일한다", () => {
    expect(normalizeRoomRaw("101호")).toBe("101");
    expect(normalizeRoomRaw("지하1층 101")).toBe("B1101");
  });

  it("정확 매칭과 불일치를 구분한다", () => {
    const known = ["101호", "102호", "B101"];
    expect(matchRoom("101호", known).matchType).toBe("exact");
    expect(matchRoom("999호", known).matchType).toBe("none");
  });
});

describe("parseDateTime(은행 거래일시)", () => {
  const REF = "2026-09-29";
  it("시각 포함 형식을 현지 벽시계 문자열로 읽는다", () => {
    expect(parseDateTime("2026-09-01 14:23:05", REF)).toBe("2026-09-01 14:23:05");
    expect(parseDateTime("2026/09/01 14:23", REF)).toBe("2026-09-01 14:23");
    expect(parseDateTime("2026.09.01 14:23:05", REF)).toBe("2026-09-01 14:23:05");
    expect(parseDateTime("2026-09-01T14:23:05", REF)).toBe("2026-09-01 14:23:05");
    expect(parseDateTime("20260901142305", REF)).toBe("2026-09-01 14:23:05");
    expect(parseDateTime("202609011423", REF)).toBe("2026-09-01 14:23");
    expect(parseDateTime("26/09/01 9:05", REF)).toBe("2026-09-01 09:05");
  });
  it("오전/오후·AM/PM", () => {
    expect(parseDateTime("2026-09-01 오후 2:23:05", REF)).toBe("2026-09-01 14:23:05");
    expect(parseDateTime("2026-09-01 오전 12:10", REF)).toBe("2026-09-01 00:10");
    expect(parseDateTime("2026-09-01 12:10 PM", REF)).toBe("2026-09-01 12:10");
    expect(parseDateTime("2026-09-01 오후 13:00", REF)).toBeNull();
  });
  it("연도 없는 '09-01 14:23'은 기준일 이전 가장 가까운 해로", () => {
    expect(parseDateTime("09-01 14:23", REF)).toBe("2026-09-01 14:23");
    expect(parseDateTime("12-30 10:00", REF)).toBe("2025-12-30 10:00");
    expect(parseDateTime("10-15 10:00", REF)).toBe("2026-10-15 10:00"); // 31일 이내 미래는 올해로
  });
  it("날짜만 있으면 시각 없이, 엑셀 일련번호 소수부는 시각으로", () => {
    expect(parseDateTime("2026-09-01", REF)).toBe("2026-09-01");
    expect(parseDateTime("20260901", REF)).toBe("2026-09-01");
    expect(parseDateTime("45536", REF)).toBe("2024-09-01");
    expect(parseDateTime("45536.5", REF)).toBe("2024-09-01 12:00:00");
  });
  it("못 읽거나 잘못된 값·시간대 표시는 null", () => {
    for (const bad of ["", "  ", "거래일시", "2026-13-01 10:00", "2026-02-30 10:00", "2026-09-01 25:00", "2026-09-01 10:61", "2026-09-01T14:23:05+09:00", "2026-09-01T05:23:05Z"]) expect(parseDateTime(bad, REF)).toBeNull();
  });
});

describe("txnLocalToIso(사업장 시간대 → UTC)", () => {
  it("Asia/Seoul 벽시계를 UTC 로", () => {
    expect(txnLocalToIso("2026-09-01 14:23:05", "Asia/Seoul")).toBe("2026-09-01T05:23:05.000Z");
    expect(txnLocalToIso("2026-09-01 00:10", "Asia/Seoul")).toBe("2026-08-31T15:10:00.000Z");
  });
  it("시각이 없으면 12:00, 형식이 다르면 null", () => {
    expect(txnLocalToIso("2026-09-01", "Asia/Seoul")).toBe("2026-09-01T03:00:00.000Z");
    expect(txnLocalToIso("2026/09/01", "Asia/Seoul")).toBeNull();
  });
});
