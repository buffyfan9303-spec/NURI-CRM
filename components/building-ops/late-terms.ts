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
