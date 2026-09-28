/**
 * 시간대 유틸 — 특히 dayKeyInTz/localDateTimeToUtcIso는 "서쪽 tz에서 전날로 밀리는" 버그가
 * 나기 쉬운 지점이라 KST 경계값(자정 근처)을 명시적으로 검사한다.
 */
import { describe, it, expect } from "vitest";
import { isValidDateKey, addDaysToKey, dayKeyInTz, localDateTimeToUtcIso, formatInTz, overlaps, compareInstants } from "./datetime";

describe("isValidDateKey", () => {
  it("YYYY-MM-DD만 통과", () => {
    expect(isValidDateKey("2026-09-28")).toBe(true);
    expect(isValidDateKey("2026-9-28")).toBe(false);
    expect(isValidDateKey("2026/09/28")).toBe(false);
  });
});

describe("addDaysToKey", () => {
  it("월 경계를 UTC 산술로 넘긴다", () => {
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("dayKeyInTz", () => {
  it("UTC 자정 직후 시각도 KST(+9)로는 이미 다음날", () => {
    // 2026-09-27T15:00:00Z = 2026-09-28 00:00 KST
    expect(dayKeyInTz("2026-09-27T15:00:00Z", "Asia/Seoul")).toBe("2026-09-28");
    // 2026-09-27T14:59:00Z = 2026-09-27 23:59 KST(전날)
    expect(dayKeyInTz("2026-09-27T14:59:00Z", "Asia/Seoul")).toBe("2026-09-27");
  });
});

describe("localDateTimeToUtcIso ↔ formatInTz 왕복", () => {
  it("KST 벽시계로 만든 ISO를 다시 표시하면 같은 벽시계가 나온다", () => {
    const iso = localDateTimeToUtcIso("2026-10-01", "10:00", "Asia/Seoul");
    expect(formatInTz(iso, "Asia/Seoul", "yyyy-MM-dd HH:mm")).toBe("2026-10-01 10:00");
  });
});

describe("overlaps", () => {
  it("반개구간 [start,end)", () => {
    expect(overlaps("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z")).toBe(false);
    expect(overlaps("2026-10-01T00:00:00Z", "2026-10-02T00:00:01Z", "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z")).toBe(true);
  });
});

describe("compareInstants", () => {
  it("epoch 순 비교", () => {
    expect(compareInstants("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBeLessThan(0);
    expect(compareInstants("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBeGreaterThan(0);
  });
});
