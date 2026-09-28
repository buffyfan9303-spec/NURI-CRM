/**
 * 공휴일 — 기본 경로(@hyunbinseo/holidays-kr, 대체공휴일 포함)와 KASI 보강 경로(MSW 모의 응답)를 각각 검사.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { isHoliday, holidayName, holidaysInRange } from "./holidays";

describe("holidays — 패키지 데이터만(KASI 키 없음)", () => {
  it("신정(1/1)은 공휴일, 평일은 아니다", async () => {
    expect(await isHoliday("2026-01-01")).toBe(true);
    expect(await holidayName("2026-01-01")).toBe("1월 1일");
    expect(await isHoliday("2026-01-02")).toBe(false);
    expect(await holidayName("2026-01-02")).toBeNull();
  });

  it("holidaysInRange는 구간 안 공휴일만 dateKey→이름 맵으로 돌려준다", async () => {
    const map = await holidaysInRange("2026-01-01", "2026-01-05");
    expect(map["2026-01-01"]).toBe("1월 1일");
    expect(Object.keys(map)).toEqual(["2026-01-01"]);
  });
});

describe("holidays — KASI 보강(MSW 모의 응답)", () => {
  const server = setupServer(
    http.get("https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo", () => {
      return HttpResponse.json({
        response: {
          body: {
            items: {
              // 실제 공휴일이 아닌 임시공휴일 사례를 흉내낸 모의 날짜(2026-07-15).
              item: { locdate: 20260715, dateName: "임시공휴일(모의)", isHoliday: "Y" },
            },
          },
        },
      });
    })
  );

  beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("KASI_SERVICE_KEY가 있으면 패키지에 없는 임시공휴일도 합쳐진다", async () => {
    vi.stubEnv("KASI_SERVICE_KEY", "test-key");
    try {
      expect(await isHoliday("2026-07-15")).toBe(true);
      expect(await holidayName("2026-07-15")).toBe("임시공휴일(모의)");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
