/**
 * 국세청 사업자등록 상태조회(공공데이터포털 15081808) — 서버 전용.
 * 이 파일은 "use server" 액션(lib/auth/actions.ts)에서만 import 한다. 클라이언트 컴포넌트에서 import 금지
 * (`server-only` 패키지는 미설치라 import 로 강제하지 못한다 — package.json 은 메인 소유).
 *
 * 키: 환경변수 NTS_SERVICE_KEY(공공데이터포털 "Decoding" 키). 없으면 호출하지 않고 null 을 돌려준다.
 * 문서: https://www.data.go.kr/data/15081808/openapi.do
 *   POST https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=…  body {"b_no":["1234567890"]}
 *   → { status_code:"OK", data:[{ b_no, b_stt:"계속사업자|휴업자|폐업자|''", b_stt_cd:"01|02|03|''",
 *        tax_type, tax_type_cd, end_dt:"YYYYMMDD|''", … }] }   미등록이면 b_stt_cd '' + tax_type 안내문.
 */
export const NTS_STATUS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";

export type NtsStatus = {
  /** 국세청에 등록된 번호인가(미등록이면 false, 나머지 필드는 안내문/빈값). */
  registered: boolean;
  /** 01 계속사업자 · 02 휴업자 · 03 폐업자 · null 미등록 */
  statusCode: "01" | "02" | "03" | null;
  status: string;
  taxType: string;
  taxTypeCode: string | null;
  /** 폐업일 YYYY-MM-DD(없으면 null) */
  endDate: string | null;
};

export function ntsConfigured(): boolean {
  return !!process.env.NTS_SERVICE_KEY;
}

type Raw = { b_stt?: string; b_stt_cd?: string; tax_type?: string; tax_type_cd?: string; end_dt?: string };

/**
 * 상태 조회. 키가 없으면 null(호출 안 함). 네트워크/응답 오류는 throw — 호출자가 "확인 불가"로 표시한다.
 * @param digits 10자리 숫자(정규화·체크섬 검사는 호출자 책임)
 * @param fetchImpl 테스트 대체용
 */
export async function fetchNtsStatus(digits: string, fetchImpl: typeof fetch = fetch): Promise<NtsStatus | null> {
  const key = process.env.NTS_SERVICE_KEY;
  if (!key) return null;
  const res = await fetchImpl(`${NTS_STATUS_URL}?serviceKey=${encodeURIComponent(key)}&returnType=JSON`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ b_no: [digits] }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nts_http_${res.status}`);
  const json = (await res.json()) as { status_code?: string; data?: Raw[] };
  const row = json.data?.[0];
  if (json.status_code !== "OK" || !row) throw new Error("nts_bad_response");
  const code = row.b_stt_cd === "01" || row.b_stt_cd === "02" || row.b_stt_cd === "03" ? row.b_stt_cd : null;
  const end = row.end_dt && /^\d{8}$/.test(row.end_dt) ? `${row.end_dt.slice(0, 4)}-${row.end_dt.slice(4, 6)}-${row.end_dt.slice(6)}` : null;
  return {
    registered: code !== null,
    statusCode: code,
    status: row.b_stt || "",
    taxType: row.tax_type || "",
    taxTypeCode: row.tax_type_cd || null,
    endDate: end,
  };
}
