/**
 * 관리비 항목 5단계 마법사의 순수 로직: 입력 초안 검증, 서버 입력 변환, 배분 미리보기.
 * 서버 제약과 같은 규칙만 미리 안내한다: 원천=직접 ⇔ 배분=직접, 검침 배분은 계량기 종류 필요, 정액/단가 누락 차단.
 * 미리보기는 표시용이다. 확정 금액은 서버 계산(bld_calculate)이 낸다.
 */
import { allocateLargestRemainder } from "@/lib/domain/building-calc";
import type { AllocMethod, ChargeTypeRow, MeterKind, Payer, SourceKindCharge, StdCategory, TaxTreatment } from "@/lib/domain/building-types";

export interface ChargeDraft {
  name: string; std_category: StdCategory | ""; source_kind: SourceKindCharge | ""; payer: Payer | ""; alloc_method: AllocMethod | "";
  meter_kind: MeterKind | ""; fixed_amount: string; unit_rate: string; rate_includes_vat: boolean; tax_treatment: TaxTreatment | ""; supplier_party_id: string; memo: string;
}
export const emptyDraft = (): ChargeDraft => ({ name: "", std_category: "", source_kind: "", payer: "", alloc_method: "", meter_kind: "", fixed_amount: "", unit_rate: "", rate_includes_vat: false, tax_treatment: "", supplier_party_id: "", memo: "" });
export const draftFrom = (c: ChargeTypeRow): ChargeDraft => ({
  name: c.name, std_category: c.std_category, source_kind: c.source_kind, payer: c.payer, alloc_method: c.alloc_method, meter_kind: c.meter_kind ?? "",
  fixed_amount: c.fixed_amount == null ? "" : String(c.fixed_amount), unit_rate: c.unit_rate == null ? "" : String(c.unit_rate), rate_includes_vat: c.rate_includes_vat,
  tax_treatment: c.tax_treatment, supplier_party_id: c.supplier_party_id ?? "", memo: c.memo ?? "",
});

export const STEPS = ["이름·분류", "금액 출처", "부담 주체", "배분 방법", "부가세·미리 보기"] as const;
export const SOURCE_LABEL: Record<SourceKindCharge, string> = { expense: "매달 실제 지출 비용(매달 적음)", rate: "정해진 단가 또는 정액(계약·고정 요금)", direct: "호실마다 직접 입력" };
export const ALLOC_LABEL: Record<AllocMethod, string> = { fixed: "호실마다 같은 금액(정액)", area: "전용면적만큼", share: "지분만큼", weight: "가중치만큼", equal: "호실 수로 균등하게", meter_usage: "계량기 사용량만큼", direct: "호실마다 직접 입력" };
export const PAYER_LABEL: Record<Payer, string> = { tenant: "입주자 부담", owner: "소유자 부담", association: "관리단 부담(호실에 배분하지 않음)" };
export const TAX_LABEL: Record<TaxTreatment, string> = { taxable: "과세(세금계산서)", exempt: "면세(계산서)", non_taxable: "과세 대상 아님", pass_through: "대납(실비, 세금 없음)" };

/** 원천별로 고를 수 있는 배분. 직접 입력 원천은 배분도 직접뿐이다(DB 제약). */
export function allocOptions(source: SourceKindCharge | ""): AllocMethod[] {
  if (source === "direct") return ["direct"];
  if (source === "rate") return ["fixed", "area", "share", "weight", "meter_usage"];
  if (source === "expense") return ["area", "share", "weight", "equal", "meter_usage"];
  return [];
}

const posNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;

/** 단계 n(0~4)을 통과하지 못하는 이유. 통과하면 null. */
export function stepError(step: number, d: ChargeDraft): string | null {
  if (step === 0) return !d.name.trim() ? "항목 이름을 적으세요." : !d.std_category ? "분류를 고르세요." : null;
  if (step === 1) return !d.source_kind ? "금액이 어디서 나오는지 고르세요." : null;
  if (step === 2) return !d.payer ? "누가 부담하는지 고르세요." : null;
  if (step === 3) {
    if (!d.alloc_method) return "나누는 방법을 고르세요.";
    if (!allocOptions(d.source_kind).includes(d.alloc_method)) return "고른 출처에서는 쓸 수 없는 방법입니다. 다시 고르세요.";
    if (d.alloc_method === "meter_usage" && !d.meter_kind) return "어떤 계량기(전기·수도 등) 사용량인지 고르세요.";
    if (d.source_kind === "rate") {
      if (d.alloc_method === "fixed") return posNum(d.fixed_amount) && Number.isInteger(Number(d.fixed_amount)) ? null : "정액 금액을 0원 이상, 소수점 없이 적으세요.";
      return posNum(d.unit_rate) ? null : "단가를 0 이상의 숫자로 적으세요.";
    }
    return null;
  }
  if (step === 4) return !d.tax_treatment ? "부가세가 있는지 고르세요." : null;
  return null;
}
export const firstBadStep = (d: ChargeDraft): number => { for (let i = 0; i < 5; i++) if (stepError(i, d)) return i; return -1; };

export function draftToInput(d: ChargeDraft) {
  const rate = d.source_kind === "rate";
  return {
    name: d.name.trim(), std_category: d.std_category as StdCategory, source_kind: d.source_kind as SourceKindCharge, alloc_method: d.alloc_method as AllocMethod,
    payer: d.payer as Payer, tax_treatment: d.tax_treatment as TaxTreatment, supplier_party_id: d.supplier_party_id || null,
    fixed_amount: rate && d.alloc_method === "fixed" ? Number(d.fixed_amount) : null, unit_rate: rate && d.alloc_method !== "fixed" ? Number(d.unit_rate) : null,
    rate_includes_vat: rate ? d.rate_includes_vat : false, meter_kind: d.alloc_method === "meter_usage" ? (d.meter_kind as MeterKind) : null, memo: d.memo.trim() || null,
  };
}

export interface PreviewUnit { id: string; label: string; area: number; share: number; weight: number; use_kind: string }
export interface PreviewRow { id: string; label: string; amount: number }
export type Preview = { kind: "rows"; rows: PreviewRow[]; total: number } | { kind: "note"; text: string };

/** 예시 총액(원천=지출)이나 단가(원천=단가)로 호실별 금액을 보여 준다. 공용 용도 호실은 서버처럼 제외한다. */
export function previewOf(d: ChargeDraft, units: PreviewUnit[], sampleTotal: number): Preview {
  const us = units.filter((u) => u.use_kind !== "common");
  if (us.length === 0) return { kind: "note", text: "나눌 호실이 없습니다. 호실을 먼저 등록하세요." };
  if (d.payer === "association") return { kind: "note", text: "관리단이 부담하는 항목은 호실에 나누지 않습니다." };
  if (d.source_kind === "direct") return { kind: "note", text: "호실마다 금액을 직접 적습니다. 적은 금액이 그대로 청구됩니다." };
  if (d.alloc_method === "meter_usage") return { kind: "note", text: "검침값을 적은 뒤에야 금액이 정해집니다. 검침값을 입력하지 않은 호실이 있으면 계산이 멈춥니다." };
  const w = (u: PreviewUnit) => (d.alloc_method === "area" ? u.area : d.alloc_method === "share" ? u.share : d.alloc_method === "weight" ? u.weight : 1);
  if (d.source_kind === "rate") {
    const rows = us.map((u) => ({ id: u.id, label: u.label, amount: d.alloc_method === "fixed" ? Number(d.fixed_amount) || 0 : Math.round((Number(d.unit_rate) || 0) * w(u)) }));
    return { kind: "rows", rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  }
  if (!Number.isInteger(sampleTotal) || sampleTotal < 0) return { kind: "note", text: "예시 총액을 0원 이상, 소수점 없이 적으세요." };
  try {
    const al = allocateLargestRemainder(sampleTotal, us.map((u) => ({ id: u.id, w: w(u) })));
    const by = new Map(al.map((a) => [a.id, a.amount]));
    const rows = us.map((u) => ({ id: u.id, label: u.label, amount: by.get(u.id) ?? 0 }));
    return { kind: "rows", rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  } catch {
    return { kind: "note", text: "나누는 기준(면적·지분·비율)을 다 더하면 0이라 나눌 수 없습니다. 호실 정보를 확인하세요." };
  }
}
