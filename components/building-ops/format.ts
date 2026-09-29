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
export const unitLabel = (u: { dong?: string | null; floor?: string | null; unit_no: string }) =>
  [u.dong ? `${u.dong}동` : "", u.unit_no].filter(Boolean).join(" ");
