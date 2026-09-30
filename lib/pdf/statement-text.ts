/**
 * 관리비 명세서 문장 조각(계산 근거·검침 이름) — 순수 함수. 입주자 포털 명세서(lib/domain/building-portal.ts)가 쓴다.
 * app/api/pdf/building-statement/route.ts 에 같은 표가 있다(다른 작업자 소유라 이번에 옮기지 않음) — 그 파일을 고칠 때 이 모듈을 import 해 하나로 합친다.
 */
export const METER_LABEL: Record<string, string> = { electric: "전기", water: "수도", gas: "가스", heat: "난방", hotwater: "온수" };
const METHOD: Record<string, string> = { fixed: "정액", area: "면적", share: "지분", weight: "가중치", equal: "균등", meter_usage: "검침", direct: "직접" };
const qty = (v: unknown) => (typeof v === "number" ? v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(v ?? ""));

/** trace 줄의 basis → "면적 30/60" · "33.72 × 3,471원" 같은 한 줄. */
export function basisText(basis: Record<string, unknown> | null | undefined): string {
  const b = basis ?? {};
  const m = typeof b.method === "string" ? METHOD[b.method] ?? b.method : "";
  if (b.numerator != null && b.denominator != null) return `${m} ${qty(b.numerator)}/${qty(b.denominator)}`;
  if (b.rate != null && b.basis != null) return `${qty(b.basis)} × ${qty(b.rate)}원`;
  if (b.rate != null) return `${m} ${qty(b.rate)}원`;
  return m;
}

/** 검침 사유 → 명세서 비고. */
export function readingNote(reason: string | null | undefined): string | undefined {
  return reason === "replaced" ? "* 계량기 교체" : reason === "estimated" ? "* 추정" : reason === "typo" ? "* 정정" : reason === "rollover" ? "* 지침 순환" : undefined;
}
