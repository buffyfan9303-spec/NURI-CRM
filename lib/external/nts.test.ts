// 실행: cd nuri-crm-next && npx vitest run lib/external
// 키 없이 체크섬 + fetch 대체(모의 응답). 실제 국세청 API 는 호출하지 않는다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBizRegNo, isValidBizRegNo, normalizeBizRegNo } from "./bizno";
import { fetchNtsStatus, ntsConfigured } from "./nts";

describe("사업자등록번호 체크섬", () => {
  it("공개된 법인 번호는 통과", () => {
    expect(isValidBizRegNo("1248100998")).toBe(true); // 124-81-00998
    expect(isValidBizRegNo("2208162517")).toBe(true); // 220-81-62517
  });
  it("검증숫자·길이·문자 오류는 거부", () => {
    expect(isValidBizRegNo("1248100999")).toBe(false);
    expect(isValidBizRegNo("124810099")).toBe(false);
    expect(isValidBizRegNo("124-81-00998")).toBe(false); // 정규화 전
    expect(isValidBizRegNo("")).toBe(false);
  });
  it("정규화·표시", () => {
    expect(normalizeBizRegNo("124-81-00998 ")).toBe("1248100998");
    expect(formatBizRegNo("1248100998")).toBe("124-81-00998");
    expect(formatBizRegNo("123")).toBe("123");
  });
});

describe("국세청 상태조회", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("키가 없으면 호출하지 않고 null", async () => {
    vi.stubEnv("NTS_SERVICE_KEY", "");
    const f = vi.fn();
    expect(ntsConfigured()).toBe(false);
    expect(await fetchNtsStatus("1248100998", f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("계속사업자 응답을 해석한다(모의)", async () => {
    vi.stubEnv("NTS_SERVICE_KEY", "test-key");
    const f = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("serviceKey=test-key");
      expect(JSON.parse(String(init.body))).toEqual({ b_no: ["1248100998"] });
      return new Response(
        JSON.stringify({
          status_code: "OK",
          match_cnt: 1,
          request_cnt: 1,
          data: [{ b_no: "1248100998", b_stt: "계속사업자", b_stt_cd: "01", tax_type: "부가가치세 일반과세자", tax_type_cd: "01", end_dt: "" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const r = await fetchNtsStatus("1248100998", f as unknown as typeof fetch);
    expect(r).toEqual({ registered: true, statusCode: "01", status: "계속사업자", taxType: "부가가치세 일반과세자", taxTypeCode: "01", endDate: null });
  });

  it("폐업·미등록 응답", async () => {
    vi.stubEnv("NTS_SERVICE_KEY", "test-key");
    const closed = vi.fn(async () =>
      new Response(JSON.stringify({ status_code: "OK", data: [{ b_stt: "폐업자", b_stt_cd: "03", tax_type: "부가가치세 간이과세자", tax_type_cd: "02", end_dt: "20240131" }] }), { status: 200 })
    );
    expect(await fetchNtsStatus("1248100998", closed as unknown as typeof fetch)).toMatchObject({ registered: true, statusCode: "03", endDate: "2024-01-31" });

    const none = vi.fn(async () =>
      new Response(JSON.stringify({ status_code: "OK", data: [{ b_stt: "", b_stt_cd: "", tax_type: "국세청에 등록되지 않은 사업자등록번호입니다.", tax_type_cd: "", end_dt: "" }] }), { status: 200 })
    );
    expect(await fetchNtsStatus("1248100998", none as unknown as typeof fetch)).toMatchObject({ registered: false, statusCode: null });
  });

  it("HTTP 오류·이상 응답은 throw", async () => {
    vi.stubEnv("NTS_SERVICE_KEY", "test-key");
    const bad = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(fetchNtsStatus("1248100998", bad as unknown as typeof fetch)).rejects.toThrow("nts_http_401");
    const empty = vi.fn(async () => new Response(JSON.stringify({ status_code: "OK", data: [] }), { status: 200 }));
    await expect(fetchNtsStatus("1248100998", empty as unknown as typeof fetch)).rejects.toThrow("nts_bad_response");
  });
});
