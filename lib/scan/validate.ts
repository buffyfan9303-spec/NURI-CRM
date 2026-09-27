/**
 * 클라이언트측 1차 검증. 최종 판정은 언제나 서버(crm.resolve_scan)다 — 여기서 통과해도
 * 서버가 거부할 수 있고, 그것이 정상이다. 목적은 두 가지뿐이다:
 *   1) 명백히 잘못된 입력(제어문자·빈 문자열·과도한 길이)으로 왕복하지 않는다.
 *   2) URL 형태 코드를 절대 자동으로 열지 않는다 — 여기서 판별해 호출부가 막을 수 있게 한다.
 *
 * 정규식은 supabase/migrations/0014_scan.sql 의 crm.scan_code_valid / crm.scan_is_url 과
 * 반드시 동일해야 한다(서버가 최종 권위이므로 클라이언트는 그 판단을 그대로 미리 보여줄 뿐).
 */

// 제어문자 중 탭(\x09)·LF(\x0A)·CR(\x0D)만 허용 — 서버 규칙과 동일.
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const URL_SCHEME_RE = /^\s*(https?|ftp|javascript|data|file)\s*:/i;

export function isValidScanCode(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 256) return false;
  return !CONTROL_CHAR_RE.test(raw);
}

/** URL 형태다 → 텍스트로만 취급하고 자동으로 열지 않는다. */
export function isUrlLikeCode(raw: string): boolean {
  return URL_SCHEME_RE.test(raw);
}

/** EAN-13 형식·체크섬. 카메라가 잘못 읽은 자릿수/체크섬 오류를 화면에서 바로 알려주기 위함이다. */
export function isValidEan13(raw: string): boolean {
  const code = raw.trim();
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}

/** Code128은 가변 길이·전 아스키 문자를 쓰므로 형식 체크섬이 없다 — 길이만 최소 확인한다. */
export function isPlausibleCode128(raw: string): boolean {
  const code = raw.trim();
  return code.length >= 1 && code.length <= 48 && !CONTROL_CHAR_RE.test(code);
}

/**
 * 카메라 연속 인식 억제(D3·D5). 카메라는 0.2초마다 같은 코드를 다시 내놓으므로 "마지막으로 **보인** 시각"을
 * 기준으로 판단한다 — 직전에 본 지 gapMs 미만이면 아직 화면에 있는 같은 코드(continuous)라 조용히 무시하고,
 * gapMs 이상 안 보이다가 다시 나타났으면(reappeared) 의도적 재스캔으로 본다. 처음 보는 코드는 fresh.
 * 호출할 때마다 lastSeen 을 now 로 갱신한다(처리 중이든 무시하든 "보였다"는 사실은 같다).
 */
export type CameraSighting = "fresh" | "continuous" | "reappeared";
export function noteCameraSighting(lastSeen: Map<string, number>, code: string, now: number, gapMs = 1500): CameraSighting {
  const prev = lastSeen.get(code);
  lastSeen.set(code, now);
  if (prev === undefined) return "fresh";
  return now - prev < gapMs ? "continuous" : "reappeared";
}

/**
 * 스캔 코드 정규화(D9). 앞뒤 공백만 벗긴다 — 서버(crm.resolve_scan)는 btrim 후 대소문자 그대로 비교하고
 * qr_payload 에 소문자 uuid 가 들어 있으므로 대문자화하면 정상 라벨이 깨진다. 접두사(NURI:)도 벗기지 않는다.
 */
export function normalizeScanCode(raw: string): string {
  return raw.trim();
}

/** 13자리 숫자인데 EAN-13 체크섬이 틀리면 카메라 오독이다 — 서버에 묻기 전에 안내한다. */
export function isEan13ChecksumError(code: string): boolean {
  return /^\d{13}$/.test(code) && !isValidEan13(code);
}

/** 배치 세션 키. http LAN 같은 비보안 컨텍스트에는 crypto.randomUUID 가 없다(D4) — getRandomValues → Math.random 순으로 폴백. */
export function newSessionKey(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * "이미 반납된 품목·잘못된 상태" 경고 — 담기 전에 눈에 띄게 보여주기 위한 표시용 힌트일 뿐이다.
 * 최종 판정은 여전히 서버(RLS + rental_units 상태머신, 0009_rental_hardening.sql
 * unit_status_allowed)다. 여기서 걸러도 서버가 다시 막을 수 있고, 그것이 정상이다.
 */
export function getStatusWarning(
  mode: "rental_checkout" | "rental_return" | "unmanned_audit" | "factory_lookup" | "generic",
  kind: string,
  status: string | null
): string | null {
  if (kind === "rental_unit" && status) {
    if (mode === "rental_checkout") {
      if (status === "out") return "이미 출고된 개체입니다.";
      if (["inspect", "care", "repair", "lost", "retired"].includes(status)) return `현재 상태(${status})라 출고할 수 없는 개체입니다.`;
    }
    if (mode === "rental_return") {
      if (status === "available" || status === "reserved") return "아직 출고되지 않은 개체입니다.";
      if (["inspect", "care", "repair"].includes(status)) return "이미 회수되어 검수 단계로 넘어간 개체입니다.";
      if (status === "retired" || status === "lost") return `현재 상태(${status})인 개체입니다.`;
    }
  }
  if (kind === "us_product" && status === "inactive") return "비활성 상품입니다.";
  if (kind === "material" && status === "inactive") return "비활성 자재입니다.";
  return null;
}
