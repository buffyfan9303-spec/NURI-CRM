/**
 * 시도 제한용 IP 묶음 키. IPv6 는 가정·기기마다 /64 안에서 주소를 바꿀 수 있어 앞 64비트(/64)로 묶는다.
 * IPv4·IPv4-mapped(::ffff:1.2.3.4) 는 IPv4 그대로. 형식이 이상하면 소문자 원문(해시되므로 저장되지 않는다).
 * lib/domain/building-portal.ts 가 이 값을 HMAC 해 DB 에 넘긴다.
 */
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}
