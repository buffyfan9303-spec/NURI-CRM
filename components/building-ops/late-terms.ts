/**
 * 연체 조건 입력 상태 ↔ 서버 필드 변환. 기본값을 만들지 않는다: 이율·단위·방식·기산일·상한을 사람이 전부 입력해야 완전(complete)이다.
 * (연체 규칙은 계약서마다 다르므로 화면이 어떤 수치도 미리 채우지 않는다. 승인은 서버 RPC 가 입력자≠승인자로 처리한다.)
 */
import type { LateMethod, LateRateUnit, LateTerms } from "@/lib/domain/building-types";

export interface LateForm {
  rate: string; unit: LateRateUnit | ""; method: LateMethod | ""; grace: string;
  basis: "principal" | "principal_and_fee" | ""; order: "oldest_first" | "fee_first" | "";
  capPct: string; capNone: boolean;
}
export const emptyLateForm = (): LateForm => ({ rate: "", unit: "", method: "", grace: "", basis: "", order: "", capPct: "", capNone: false });

/**
 * 기준 연체 조건(2026-09-30 사용자 지시 "연에 몇 %를 정해서 기입해 쓸 수 있게"). 화면이 저절로 채우지 않고,
 * 사람이 "기준 조건으로 채우기"를 눌렀을 때만 들어간다. 저장 후에도 다른 담당자의 확정을 받아야 계산된다.
 * 근거(docs/design-references/2026-09-30-kr-cam-law-fulltext.md §6):
 *  - 법무부 집합건물(상가) 표준관리규약(2023.9.27) 별표 11: 연체 1년 이하 연 12%, 일할 계산(원금 × 12% × 일수/365)
 *  - 이자제한법 최고이자율 연 20% 이하, 소송촉진법 법정이율 12%와 같음 → 약관규제법 제8조 '과중'으로 볼 여지가 작다
 *  - 충당 순서: 규약에 정함이 없으면 민법 제479조(비용·이자 → 원본) = 연체료부터
 *  - 연체료에는 부가세가 없다(부가가치세법 제29조⑤5호)
 * 관리규약·계약서에 이율이 따로 있으면 그 값이 우선이다(민법 제397조). 표준규약의 '1년 초과 연 15%' 구간은
 * 지금 계산이 단일 이율만 지원해 넣지 않았다(장기 연체분은 표준보다 낮게 = 안전한 쪽).
 */
export const STANDARD_LATE_FORM: LateForm = { rate: "12", unit: "annual", method: "simple", grace: "0", basis: "principal", order: "fee_first", capPct: "", capNone: true };
export const STANDARD_LATE_NOTE = "법무부 상가 표준관리규약 기준: 연 12%, 미납 관리비에만 하루 단위(일수/365) 단리, 납부기한 다음 날부터, 일부 납부 시 연체료부터 충당. 관리규약·계약서에 다른 이율이 있으면 그 값으로 수정하세요.";

export function lateFormFrom(t: Partial<LateTerms> | null | undefined): LateForm {
  if (!t) return emptyLateForm();
  return {
    rate: t.late_rate == null ? "" : String(t.late_rate), unit: t.late_rate_unit ?? "", method: t.late_method ?? "",
    grace: t.late_grace_days == null ? "" : String(t.late_grace_days), basis: t.late_basis ?? "", order: t.late_partial_order ?? "",
    capPct: t.late_cap_pct == null ? "" : String(t.late_cap_pct), capNone: !!t.late_cap_none,
  };
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

/** 비어 있는 칸은 null 로 보낸다(부분 입력 저장 허용). 완전 여부는 lateFormComplete 로 따로 본다. */
export function lateFormToPatch(f: LateForm): Pick<LateTerms, "late_rate" | "late_rate_unit" | "late_method" | "late_grace_days" | "late_basis" | "late_partial_order" | "late_cap_pct" | "late_cap_none"> {
  return {
    late_rate: numOrNull(f.rate), late_rate_unit: f.unit || null, late_method: f.method || null, late_grace_days: numOrNull(f.grace),
    late_basis: f.basis || null, late_partial_order: f.order || null, late_cap_pct: f.capNone ? null : numOrNull(f.capPct), late_cap_none: f.capNone,
  };
}

export function lateFormComplete(f: LateForm): boolean {
  const n = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;
  return n(f.rate) && !!f.unit && !!f.method && n(f.grace) && !!f.basis && !!f.order && (f.capNone || n(f.capPct));
}

export type LateStatus = "approved" | "pending" | "incomplete" | "unset";
/** 계약 행 → 표시 상태. 승인 열이 있으면 승인됨, 필수 값이 다 있으면 승인 대기, 일부만 있으면 미완, 없으면 미설정. */
export function lateStatusOf(t: Partial<LateTerms>): LateStatus {
  if (t.late_approved_by && t.late_approved_at) return "approved";
  const f = lateFormFrom(t);
  if (lateFormComplete(f)) return "pending";
  const any = f.rate !== "" || f.unit !== "" || f.method !== "" || f.grace !== "" || f.basis !== "" || f.order !== "" || f.capPct !== "" || f.capNone;
  return any ? "incomplete" : "unset";
}
