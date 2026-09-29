/** 건물 관리비 화면 공통 표시 함수. 금액은 정수 KRW, 음수는 U+2212(−). */
export function won(n: number | null | undefined): string {
  if (n === null || n === undefined) return "권한 없음";
  const s = Math.abs(Math.trunc(n)).toLocaleString("ko-KR");
  return `${n < 0 ? "\u2212" : ""}${s}원`;
}
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return `${n < 0 ? "\u2212" : ""}${Math.abs(n).toLocaleString("ko-KR")}`;
}
/** 계량기 종류 표시명. 서버 컴포넌트에서도 쓰므로 "use client" 파일이 아닌 여기에 둔다. */
export const METER_KIND_LABEL: Record<"electric" | "water" | "gas" | "heat" | "hotwater", string> = { electric: "전기", water: "수도", gas: "가스", heat: "난방", hotwater: "온수" };
/** UTC ISO 시각을 사업장 시간대의 "YYYY-MM-DD HH:mm"으로. */
export function fmtLocal(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export const unitLabel = (u: { dong?: string | null; floor?: string | null; unit_no: string }) =>
  [u.dong ? `${u.dong}동` : "", u.unit_no].filter(Boolean).join(" ");
