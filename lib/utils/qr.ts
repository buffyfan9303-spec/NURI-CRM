/**
 * QR 페이로드 형식 — Mission 2 진입점.
 *
 * 단순함: 'NURI:ORD-2026-001' 형태의 prefix + orderNo 문자열.
 * 추후 HMAC 서명 확장 시: 'NURI:ORD-2026-001:sig=abc123' 형태로 확장.
 *
 * 디코드 함수가 prefix 확인 + orderNo 추출.
 */

const PREFIX = "NURI:";

export function encodeOrderQR(orderNo: string): string {
  return `${PREFIX}${orderNo}`;
}

export function decodeOrderQR(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  /* 단순 ORD-2026-001 형식도 허용 (외부에서 QR 없이 검색하려는 경우) */
  if (/^ORD-\d{4}-\d{3}$/.test(trimmed)) return trimmed;
  if (!trimmed.startsWith(PREFIX)) return null;
  const body = trimmed.slice(PREFIX.length);
  const orderNo = body.split(":")[0];
  if (/^ORD-\d{4}-\d{3}$/.test(orderNo)) return orderNo;
  return null;
}
