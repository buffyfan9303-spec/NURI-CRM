/**
 * 건물 관리비(building) 서버 액션. 금액 확정·수납·세무·가져오기는 전부 crm.bld_* RPC 를 거친다(서버가 최종 판정).
 * 화면은 힌트만 보낸다: 사업장·건물 소속과 cap 은 여기(requireCap)와 RPC 안에서 다시 검사한다.
 * "use server" — async 함수만 export. UPDATE/DELETE 는 mustAffect.
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect, NO_ROWS_MESSAGE } from "@/lib/db/mustAffect";
import { localDateTimeToUtcIso } from "@/lib/utils/datetime";
import type {
  BuildingFeatureKey, BuildingKind, ChargeTypeRow, ContractRow, CorrectionLine, ImportSourceKind, ImportStageResult, LateTerms, MeterKind,
  PartyRow, PaymentMethod, PaymentResult, PeriodStatus, ReadingReason, RunSummary, UnitBulkInput, UnitRow, UnitsBulkResult, BuildingStagingRowInput,
  CorrectionResult,
} from "@/lib/domain/building-types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string; hint?: string };

/** RPC 오류 힌트 → 사용자 문구. Postgres 원문은 콘솔에만. */
function pgError(e: { code?: string; message: string; hint?: string | null }): { message: string; hint?: string } {
  const msg = e.message ?? "";
  const hint = e.hint ?? /^([a-z_]+):/.exec(msg)?.[1] ?? undefined;
  const map: Record<string, string> = {
    forbidden: "이 작업을 수행할 권한이 없습니다.",
    feature_off: "이 기능은 사업장 설정에서 꺼져 있습니다. 설정에서 켠 뒤 다시 시도하세요.",
    external_contract_required: "이 기능은 외부 계약(ASP·PG·알림톡·은행) 후 사용할 수 있습니다.",
    unknown_feature: "설정할 수 없는 기능입니다.",
    period_locked: "승인된 청구월입니다. 다시 계산할 수 없고 정정(새 revision)으로 처리합니다.",
    blocked: "차단 오류가 남아 있어 승인할 수 없습니다. 오류 목록을 먼저 해결하세요.",
    approver_must_differ: "계산·입력한 사람은 승인할 수 없습니다(2인 분리). 다른 담당자가 승인해야 합니다.",
    reason_required: "사유를 입력해야 합니다.",
    inputs_changed: "계산 뒤 입력(호실·계약·항목·비용·검침·수납)이 바뀌었습니다. 다시 계산한 뒤 승인하세요.",
    invalid_transition: "현재 상태에서는 할 수 없는 처리입니다.",
    not_approved: "승인된 계산이 아닙니다.",
    bill_frozen: "확정된 청구 금액은 덮어쓸 수 없습니다. 정정(새 revision)으로 처리하세요.",
    zero_denominator: "배분 기준(면적·지분·사용량) 합이 0 입니다.",
    allocation_mismatch: "원천 합계와 배분 합계가 다릅니다. 항목 설정을 확인하세요.",
    late_terms_unapproved: "연체 조건(이율·단위·기산일·방식·상한)이 전부 승인되지 않아 연체료를 계산할 수 없습니다.",
    late_terms_incomplete: "연체 조건이 전부 입력돼야 승인할 수 있습니다.",
    late_approval_via_rpc: "연체 조건 승인은 승인 버튼으로만 할 수 있습니다.",
    tax_approval_via_rpc: "세무 승인은 승인 버튼으로만 할 수 있습니다.",
    supplier_required: "과세 항목은 공급자(사업장)가 있어야 승인할 수 있습니다.",
    duplicate_payment: "같은 거래(외부 거래키)가 이미 등록돼 있습니다.",
    duplicate_import: "이 파일은 이미 가져왔습니다(같은 파일 해시).",
    has_errors: "오류 행이 남아 있습니다. 고치거나 제외한 뒤 확정하세요.",
    payment_reversed: "취소된 입금은 배정할 수 없습니다.",
    already_reversed: "이미 취소된 입금입니다.",
    credit_used: "이 입금의 선납 크레딧이 이미 사용돼 취소할 수 없습니다. 정정으로 처리하세요.",
    over_allocation: "미배정 잔액을 넘는 배정입니다.",
    overpayment: "채권 잔액을 넘는 배정입니다. 초과분은 선납 크레딧으로 두세요.",
    receivable_closed: "이미 완납·무효 처리된 채권입니다.",
    payment_allocated: "이미 배정된 입금이 있어 취소할 수 없습니다. 입금 역분개를 먼저 하세요.",
    approval_no_required: "국세청 승인번호가 필요합니다.",
    invalid_amount: "금액은 양의 정수여야 합니다.",
    invalid_period: "청구월은 YYYY-MM 형식이어야 합니다.",
    unit_not_in_building: "이 건물의 호실이 아닙니다.",
    party_not_in_business: "다른 사업장의 당사자는 연결할 수 없습니다.",
    building_not_in_business: "이 사업장의 건물이 아닙니다.",
    invalid_biz_reg_no: "사업자등록번호 형식(10자리·검증숫자)이 올바르지 않습니다.",
    meter_kind_required: "검침 종류(전기·수도 등)가 필요합니다.",
    charge_type_required: "비용을 넣을 항목이 필요합니다.",
    period_required: "청구월이 필요합니다.",
    // 0033
    cross_business: "다른 사업장의 건물·호실·당사자·항목은 연결할 수 없습니다.",
    cross_building: "다른 건물의 호실·항목·청구월은 연결할 수 없습니다.",
    status_via_rpc: "청구월 상태는 계산·승인·상태 전이 버튼으로만 바뀝니다.",
    run_frozen: "승인된 계산은 되돌릴 수 없습니다. 정정(새 revision)으로 처리하세요.",
    already_approved: "이 청구월에는 이미 승인된 계산이 있습니다. 정정(새 revision)으로 처리하세요.",
    older_receivable_open: "같은 당사자의 더 오래된 미수가 있습니다. 오래된 채권부터 배정하거나, 사유와 함께 건너뛰기를 허용하세요.",
    invalid_vat: "세액이 공급가액의 10%와 맞지 않거나 면세 항목에 세액이 있습니다.",
    charge_type_not_in_building: "이 건물의 관리비 항목이 아닙니다.",
    amount_not_positive: "금액은 0보다 커야 합니다(감면은 직접 배정 항목으로).",
    payment_not_found: "입금을 찾을 수 없습니다.",
    skip_reason_required: "오래된 미수를 건너뛰는 배정에는 사유가 필요합니다.",
  };
  if (hint && map[hint]) return { message: map[hint], hint };
  if (e.code === "42501") return { message: map.forbidden, hint: "forbidden" };
  if (e.code === "23P01") return { message: "기간이 겹칩니다(같은 호실의 활성 번호·계약 기간은 겹칠 수 없습니다).", hint: "overlap" };
  if (e.code === "23505") return { message: "이미 같은 항목이 있습니다.", hint: "duplicate" };
  if (e.code === "23514") return { message: "입력값이 규칙에 맞지 않습니다(역전 검침은 사유 필요, 사업자번호 검증숫자 등).", hint: "check_violation" };
  if (e.code === "P0002" || /not_found/.test(msg)) return { message: "대상을 찾을 수 없습니다.", hint: "not_found" };
  console.error("[building pgError] unmapped:", e.code, msg);
  return { message: "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요." };
}
const err = (e: { code?: string; message: string; hint?: string | null }): ActionResult<never> => ({ ok: false, ...pgError(e) });

async function withCap<T>(businessId: string, cap: Cap | Cap[], fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    for (const c of Array.isArray(cap) ? cap : [cap]) await requireCap(businessId, c);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail, hint: e.detail.reason };
    throw e;
  }
  return fn();
}
const crm = () => getServerSupabase().schema("crm");
function reval(businessId: string) {
  for (const seg of ["", "units", "meters", "expenses", "billing", "statements", "payments", "receivables", "tax", "reports", "charges", "imports", "settings"])
    revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
}
/** 클라이언트가 보낸 건물 id 가 이 사업장 것인지 서버가 다시 확인한다. */
async function assertBuilding(businessId: string, buildingId: string): Promise<ActionResult<undefined>> {
  const { data, error } = await crm().from("bld_buildings").select("id").eq("id", buildingId).eq("business_id", businessId).maybeSingle();
  if (error) return err(error);
  if (!data) return { ok: false, message: "이 사업장의 건물이 아닙니다.", hint: "building_not_in_business" };
  return { ok: true, data: undefined };
}
async function rpc<T>(businessId: string, name: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const { data, error } = await crm().rpc(name, args);
  if (error) return err(error);
  reval(businessId);
  return { ok: true, data: data as T };
}

// ═══ 기준정보(클라이언트 쓰기 정책: write / billing.configure) ═══
export async function createBuilding(businessId: string, input: { name: string; kind?: BuildingKind; address?: string; due_day?: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const { data, error } = await crm().from("bld_buildings").insert({ business_id: businessId, name: input.name.trim(), kind: input.kind ?? "commercial", address: input.address ?? null, due_day: input.due_day ?? 25 }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function updateBuilding(businessId: string, buildingId: string, patch: Partial<Pick<import("@/lib/domain/building-types").BuildingRow, "name" | "kind" | "address" | "supplier_party_id" | "vacancy_party_id" | "due_day" | "bank_name" | "bank_account" | "bank_holder" | "office_name" | "office_phone" | "office_hours" | "meter_error_pct" | "active">>): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const r = await mustAffect(crm().from("bld_buildings").update(patch).eq("id", buildingId).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
export async function createUnit(businessId: string, buildingId: string, input: UnitBulkInput): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_units").insert({
      business_id: businessId, building_id: buildingId, dong: input.dong || null, floor: input.floor || null, unit_no: input.unit_no.trim(),
      use_kind: input.use_kind ?? "retail", area_exclusive: input.area_exclusive ?? 0, area_common: input.area_common ?? 0, share: input.share ?? 0, weight: input.weight ?? 1,
      ...(input.valid_from ? { valid: `[${input.valid_from},)` } : {}),
    }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
/** 호실 수정. 종료(삭제 대신)는 active=false + valid 상한. */
export async function updateUnit(businessId: string, unitId: string, patch: Partial<Pick<UnitRow, "dong" | "floor" | "unit_no" | "use_kind" | "area_exclusive" | "area_common" | "share" | "weight" | "owner_party_id" | "memo" | "active" | "valid">>): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const r = await mustAffect(crm().from("bld_units").update(patch).eq("id", unitId).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
/** 호실 일괄 등록: dryRun=true 면 미리보기(오류 행), false 면 오류 0 일 때만 전부 생성. */
export async function bulkUnits(businessId: string, buildingId: string, rows: UnitBulkInput[], dryRun = true): Promise<ActionResult<UnitsBulkResult>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    return rpc<UnitsBulkResult>(businessId, "bld_units_bulk", { p_building: buildingId, p_rows: rows, p_dry_run: dryRun });
  });
}
export async function createParty(businessId: string, input: Partial<Omit<PartyRow, "id" | "business_id" | "created_at" | "active">> & { name: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const bizNo = input.biz_reg_no ? input.biz_reg_no.replace(/\D/g, "") : null;
    const { data, error } = await crm().from("bld_parties").insert({ ...input, biz_reg_no: bizNo || null, business_id: businessId, name: input.name.trim() }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function updateParty(businessId: string, partyId: string, patch: Partial<Omit<PartyRow, "id" | "business_id" | "created_at">>): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const p = { ...patch, ...(patch.biz_reg_no !== undefined ? { biz_reg_no: patch.biz_reg_no ? patch.biz_reg_no.replace(/\D/g, "") : null } : {}) };
    const r = await mustAffect(crm().from("bld_parties").update(p).eq("id", partyId).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
/** 계약 생성. 연체 조건은 입력만(승인은 approveLateTerms). 기간 겹침은 DB EXCLUDE 가 거부. */
export async function createContract(businessId: string, buildingId: string, input: { unit_id: string; tenant_party_id: string; bill_to_party_id?: string | null; tax_to_party_id?: string | null; from: string; to?: string | null; rent?: number; deposit?: number; proration?: "none" | "daily"; memo?: string } & Partial<LateTerms>): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { from, to, ...rest } = input;
    const { data, error } = await crm().from("bld_contracts").insert({
      ...rest, business_id: businessId, building_id: buildingId, period: `[${from},${to ?? ""})`, rent: input.rent ?? 0, deposit: input.deposit ?? 0,
      late_approved_by: undefined, late_approved_at: undefined,
    }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function updateContract(businessId: string, contractId: string, patch: Partial<Pick<ContractRow, "bill_to_party_id" | "tax_to_party_id" | "rent" | "deposit" | "proration" | "status" | "memo" | "period"> & LateTerms>): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const { late_approved_by: _a, late_approved_at: _b, ...safe } = patch as Record<string, unknown>; // 승인 열은 RPC 만(트리거가 거부)
    const r = await mustAffect(crm().from("bld_contracts").update(safe).eq("id", contractId).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
/** 연체 조건 승인(billing.approve, 입력자≠승인자). */
export async function approveLateTerms(businessId: string, contractId: string, reason?: string): Promise<ActionResult<{ id: string; ready: boolean }>> {
  return withCap(businessId, "billing.approve", () => rpc(businessId, "bld_approve_late_terms", { p_contract: contractId, p_reason: reason ?? null }));
}
export async function createChargeType(businessId: string, buildingId: string, input: Omit<Partial<ChargeTypeRow>, "id" | "business_id" | "building_id" | "tax_approved_by" | "tax_approved_at"> & { name: string; std_category: ChargeTypeRow["std_category"]; source_kind: ChargeTypeRow["source_kind"]; alloc_method: ChargeTypeRow["alloc_method"]; valid_from?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "billing.configure", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { valid_from, ...rest } = input;
    const { data, error } = await crm().from("bld_charge_types").insert({ ...rest, business_id: businessId, building_id: buildingId, ...(valid_from ? { valid: `[${valid_from},)` } : {}) }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function updateChargeType(businessId: string, chargeTypeId: string, patch: Partial<Omit<ChargeTypeRow, "id" | "business_id" | "building_id" | "tax_approved_by" | "tax_approved_at">>): Promise<ActionResult> {
  return withCap(businessId, "billing.configure", async () => {
    const r = await mustAffect(crm().from("bld_charge_types").update(patch).eq("id", chargeTypeId).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
/** 항목 세무 승인(tax.issue, 작성자≠승인자). 과세·공급자를 바꾸면 승인이 풀린다. */
export async function approveChargeTypeTax(businessId: string, chargeTypeId: string, reason?: string): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "tax.issue", () => rpc(businessId, "bld_approve_charge_type_tax", { p_charge_type: chargeTypeId, p_reason: reason ?? null }));
}
export async function createMeter(businessId: string, buildingId: string, input: { unit_id: string; kind: MeterKind; serial?: string; multiplier?: number; unit_label?: string; max_reading?: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_meters").insert({ ...input, business_id: businessId, building_id: buildingId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
/** 검침 저장(한 칸씩·붙여넣기 공통). 역전(V1)은 reason + usage_override 없이는 DB 가 거부. */
export async function upsertMeterReading(businessId: string, input: { meter_id: string; period: string; prev_reading: number; curr_reading: number; usage_override?: number | null; reason?: ReadingReason | null; read_date?: string | null }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const { data, error } = await crm().from("bld_meter_readings").upsert({ ...input, business_id: businessId }, { onConflict: "meter_id,period" }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function createExpense(businessId: string, buildingId: string, input: { period: string; charge_type_id: string; supply: number; vat?: number; vendor?: string; doc_no?: string; doc_hash?: string; evidence_path?: string; memo?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_expenses").insert({ ...input, vat: input.vat ?? 0, business_id: businessId, building_id: buildingId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function deleteExpense(businessId: string, expenseId: string): Promise<ActionResult> {
  return withCap(businessId, "delete", async () => {
    const r = await mustAffect(crm().from("bld_expenses").delete().eq("id", expenseId).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
/** 호실별 직접 배정 금액(선납·감면·직접 입력 항목). */
export async function upsertDirectCharge(businessId: string, buildingId: string, input: { period: string; charge_type_id: string; unit_id: string; amount: number; reason?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_direct_charges").upsert({ ...input, business_id: businessId, building_id: buildingId }, { onConflict: "charge_type_id,period,unit_id" }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
/** 청구월 열기(없으면 생성). */
export async function ensurePeriod(businessId: string, buildingId: string, period: string, input: { due_date?: string; usage_from?: string; usage_to?: string; notice?: string } = {}): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    // upsert 금지: 0033 이 bld_periods 의 UPDATE 를 4개 열(due_date·usage_from·usage_to·notice)로 제한해서
    // on conflict do update 가 business_id·period 열까지 SET 하면 permission denied(=화면의 "권한 없음") 가 된다.
    // 그래서 조회 → 없으면 insert(상태는 트리거가 collecting 으로 고정) → 있으면 허용 열만 update.
    const find = () => crm().from("bld_periods").select("id").eq("building_id", buildingId).eq("business_id", businessId).eq("period", period).maybeSingle();
    let cur = await find();
    if (cur.error) return err(cur.error);
    if (!cur.data) {
      const ins = await crm().from("bld_periods").insert({ business_id: businessId, building_id: buildingId, period, ...input }).select("id").single();
      if (!ins.error) { reval(businessId); return { ok: true, data: { id: ins.data.id as string } }; }
      if (ins.error.code !== "23505") return err(ins.error); // 동시에 다른 사람이 만들었으면 다시 조회
      cur = await find();
      if (cur.error) return err(cur.error);
      if (!cur.data) return err(ins.error);
    }
    if (Object.keys(input).length > 0) {
      const up = await mustAffect(crm().from("bld_periods").update(input).eq("id", cur.data.id));
      if (!up.ok) return up.error ? err(up.error) : { ok: false, message: NO_ROWS_MESSAGE };
    }
    reval(businessId);
    return { ok: true, data: { id: cur.data.id as string } };
  });
}

// ═══ 월 원장(RPC 전용) ═══
/** 계산 초안: 원천→배분(최대잉여 1원)→세액→미수·선납→납부요청액. 같은 입력이면 재사용. write + revenue.read. */
export async function calculatePeriod(businessId: string, periodId: string, asOf?: string): Promise<ActionResult<RunSummary>> {
  return withCap(businessId, ["write", "revenue.read"], () => rpc(businessId, "bld_calculate", { p_period: periodId, p_asof: asOf ?? null }));
}
/** 승인·잠금(billing.approve, 계산자≠승인자, 차단 0, 입력 불변). 채권·선납 차감·연체 기록 생성. */
export async function approveRun(businessId: string, runId: string, reason?: string): Promise<ActionResult<RunSummary>> {
  return withCap(businessId, "billing.approve", () => rpc(businessId, "bld_approve", { p_run: runId, p_reason: reason ?? null }));
}
/**
 * 정정: 확정 청구는 덮어쓰지 않고 차액 청구(새 revision)를 **초안**으로 만든다(0033, 2인 분리).
 * 다른 담당자가 approveRun(run_id) 하면 양수→채권, 음수→크레딧. 과세 줄 세액은 공급가×10% ±1원이어야 한다(invalid_vat).
 */
export async function correctBill(businessId: string, billId: string, lines: CorrectionLine[], reason: string): Promise<ActionResult<CorrectionResult>> {
  return withCap(businessId, "billing.approve", () => rpc(businessId, "bld_correct_bill", { p_bill: billId, p_lines: lines, p_reason: reason }));
}
/** 상태 전이(draft↔review 는 write, finalized·closed 는 billing.approve). approved 는 approveRun 만. */
export async function setPeriodStatus(businessId: string, periodId: string, status: Exclude<PeriodStatus, "approved">): Promise<ActionResult<{ id: string; status: PeriodStatus }>> {
  const cap: Cap = status === "finalized" || status === "closed" ? "billing.approve" : "write";
  return withCap(businessId, cap, () => rpc(businessId, "bld_set_period_status", { p_period: periodId, p_status: status }));
}

// ═══ 수납(payment.allocate) ═══
/**
 * 입금 시각 규칙(0032): `paid_at` 은 (a) 오프셋 포함 ISO(`2026-09-27T03:00:00Z`, `…+09:00`) → 그대로,
 * (b) `YYYY-MM-DD HH:mm` 또는 `YYYY-MM-DD`(12:00 으로 봄) → **사업장 시간대**(businesses.timezone, 없으면 Asia/Seoul)의 현지 시각으로 해석.
 * 화면은 (b) 를 보내면 되고 +09:00 을 고정으로 붙이지 않는다.
 */
function resolvePaidAt(input: string | undefined, tz: string): string | null {
  if (!input) return new Date().toISOString();
  const local = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?$/.exec(input.trim());
  if (local) return localDateTimeToUtcIso(local[1], local[2] ?? "12:00", tz || "Asia/Seoul");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(input.trim()) && !Number.isNaN(Date.parse(input))) return new Date(input).toISOString();
  return null;
}
export async function recordPayment(businessId: string, buildingId: string, input: { amount: number; paid_at?: string; method?: PaymentMethod; payer_name?: string; external_key?: string; unit_id?: string | null; memo?: string; auto_allocate?: boolean }): Promise<ActionResult<PaymentResult>> {
  let tz = "Asia/Seoul";
  try { tz = (await requireCap(businessId, "payment.allocate")).timezone || tz; } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail, hint: e.detail.reason };
    throw e;
  }
  const paidAt = resolvePaidAt(input.paid_at, tz);
  if (!paidAt) return { ok: false, message: "입금 일시 형식이 올바르지 않습니다(YYYY-MM-DD HH:mm 또는 오프셋 포함 ISO).", hint: "invalid_paid_at" };
  const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
  return rpc(businessId, "bld_record_payment", {
    p_building: buildingId, p_amount: input.amount, p_paid_at: paidAt, p_method: input.method ?? "transfer",
    p_payer_name: input.payer_name ?? null, p_external_key: input.external_key ?? null, p_unit: input.unit_id ?? null, p_memo: input.memo ?? null, p_auto_allocate: input.auto_allocate ?? true,
  });
}
/** 은행 엑셀 일괄 등록의 한 줄 결과. duplicate=이미 같은 거래키가 있어 건너뜀. */
export type BulkPaymentOutcome = { index: number; status: "ok" | "duplicate" | "failed"; unit_id: string | null; allocated: number; credit: number; message?: string };
/**
 * 은행 엑셀 입금 일괄 등록(한 번에 최대 50건, 화면이 나눠 보낸다). 각 줄은 recordPayment 와 같은 RPC(bld_record_payment)라
 * 배정 규칙(오래된 미납부터·부분납·선납)과 거래키 중복 거부(duplicate_payment)를 서버가 그대로 적용한다. 호실이 없으면 미배정으로 남는다.
 * 줄 하나가 실패해도 나머지는 계속한다(각 줄이 독립 트랜잭션).
 */
export async function recordPaymentsBulk(
  businessId: string, buildingId: string,
  rows: { amount: number; paid_at: string; payer_name?: string; memo?: string; external_key: string; unit_id?: string | null }[],
): Promise<ActionResult<{ results: BulkPaymentOutcome[] }>> {
  if (rows.length === 0 || rows.length > 50) return { ok: false, message: "한 번에 1~50건까지 등록할 수 있습니다.", hint: "bulk_size" };
  try { await requireCap(businessId, "payment.allocate"); } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail, hint: e.detail.reason };
    throw e;
  }
  const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
  const results: BulkPaymentOutcome[] = [];
  for (const [index, r] of rows.entries()) {
    const unit = r.unit_id || null;
    const paidAt = /^\d{4}-\d{2}-\d{2}T/.test(r.paid_at) && !Number.isNaN(Date.parse(r.paid_at)) ? new Date(r.paid_at).toISOString() : null;
    if (!paidAt || !Number.isInteger(r.amount) || r.amount <= 0 || !r.external_key) { results.push({ index, status: "failed", unit_id: unit, allocated: 0, credit: 0, message: "일시·금액·거래키를 확인하세요." }); continue; }
    const { data, error } = await crm().rpc("bld_record_payment", {
      p_building: buildingId, p_amount: r.amount, p_paid_at: paidAt, p_method: "transfer", p_payer_name: r.payer_name?.slice(0, 40) || null,
      p_external_key: r.external_key, p_unit: unit, p_memo: r.memo?.slice(0, 120) || null, p_auto_allocate: true,
    });
    if (error) {
      const e = pgError(error);
      results.push({ index, status: e.hint === "duplicate_payment" ? "duplicate" : "failed", unit_id: unit, allocated: 0, credit: 0, message: e.message });
      continue;
    }
    const d = data as PaymentResult;
    results.push({ index, status: "ok", unit_id: unit, allocated: d.allocated.reduce((s, a) => s + a.amount, 0), credit: d.credit_amount });
  }
  reval(businessId);
  return { ok: true, data: { results } };
}
/** 0032: 호실 없이 등록한 입금에 호실을 사후 지정(배정·선납 크레딧이 생기기 전만). null 이면 미지정으로. */
export async function setPaymentUnit(businessId: string, paymentId: string, unitId: string | null): Promise<ActionResult<{ payment_id: string; unit_id: string | null; previous_unit_id: string | null }>> {
  return withCap(businessId, "payment.allocate", () => rpc(businessId, "bld_payment_set_unit", { p_payment: paymentId, p_unit: unitId }));
}
/**
 * 0033/0034: 같은 당사자의 더 오래된 미수가 열려 있으면 거부(hint older_receivable_open).
 * allowSkip=true 면 reason 필수(없으면 skip_reason_required) — 감사 로그 after 에 reason·skipped_older 가 남는다.
 */
export async function allocatePayment(businessId: string, paymentId: string, receivableId: string, amount: number, allowSkip = false, reason?: string): Promise<ActionResult<{ unallocated: number; skipped_older: number }>> {
  return withCap(businessId, "payment.allocate", () => rpc(businessId, "bld_allocate_payment", { p_payment: paymentId, p_receivable: receivableId, p_amount: amount, p_allow_skip: allowSkip, p_reason: reason ?? null }));
}
export async function reversePayment(businessId: string, paymentId: string, reason: string): Promise<ActionResult<{ reversal_id: string }>> {
  return withCap(businessId, "payment.allocate", () => rpc(businessId, "bld_reverse_payment", { p_payment: paymentId, p_reason: reason }));
}
/** 연체료 미리보기(revenue.read, features.late_fee, 계약 승인값만). */
export async function previewLateFee(businessId: string, receivableId: string, asOf?: string): Promise<ActionResult<{ amount: number; days: number }>> {
  return withCap(businessId, "revenue.read", async () => {
    const { data, error } = await crm().rpc("bld_late_fee_preview", { p_receivable: receivableId, p_asof: asOf ?? null });
    return error ? err(error) : { ok: true, data: data as { amount: number; days: number } };
  });
}
export async function recordDunning(businessId: string, receivableId: string, input: { stage: 1 | 2 | 3; channel: "print" | "sms" | "email" | "call" | "visit" | "alimtalk"; note?: string; promise_date?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    const { data, error } = await crm().rpc("bld_record_dunning", { p_receivable: receivableId, p_stage: input.stage, p_channel: input.channel, p_note: input.note ?? null, p_promise_date: input.promise_date ?? null });
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data as string } };
  });
}
/** 발송 사건(복사·인쇄·다운로드·문자·이메일·알림톡). 승인된 청구만. */
export async function recordDelivery(businessId: string, billId: string, channel: "print" | "copy" | "download" | "sms" | "email" | "alimtalk" | "portal", status: "sent" | "failed" = "sent", note?: string): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const { data, error } = await crm().rpc("bld_record_delivery", { p_bill: billId, p_channel: channel, p_status: status, p_note: note ?? null });
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data as string } };
  });
}

// ═══ 세무(tax.issue, features.tax_invoice) ═══
/** 승인 run → 발행 대상(수신자·공급자·과세/면세별 HometaxRow 스냅샷). 차단 사유는 target.block_reasons. */
export async function buildTaxTargets(businessId: string, runId: string): Promise<ActionResult<{ ready: number; blocked: number }>> {
  return withCap(businessId, "tax.issue", () => rpc(businessId, "bld_build_tax_targets", { p_run: runId }));
}
/** 홈택스 파일을 만든 뒤 호출: 상태 file_generated(발행 아님). */
export async function markTaxFileGenerated(businessId: string, targetIds: string[], fileName: string): Promise<ActionResult<{ updated: number }>> {
  return withCap(businessId, "tax.issue", () => rpc(businessId, "bld_mark_tax_file_generated", { p_ids: targetIds, p_file_name: fileName }));
}
/** 홈택스에서 발급한 뒤 승인번호 입력 → issued. */
export async function markTaxIssued(businessId: string, targetId: string, ntsApprovalNo: string, issuedAt?: string): Promise<ActionResult<{ id: string; issue_status: string }>> {
  return withCap(businessId, "tax.issue", async () => {
    const r = await rpc<{ id: string; issue_status: string }>(businessId, "bld_mark_tax_issued", { p_id: targetId, p_nts_approval_no: ntsApprovalNo, p_issued_at: issuedAt ?? new Date().toISOString() });
    // 공용 check_violation 문구는 검침용이라 승인번호에는 맞지 않는다.
    return !r.ok && r.hint === "check_violation" ? { ...r, message: "승인번호 형식이 맞지 않습니다. 홈택스에 표시된 번호를 그대로(영문·숫자·하이픈, 20~32자) 입력하세요." } : r;
  });
}
export async function markTaxFailed(businessId: string, targetId: string, reason: string): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "tax.issue", () => rpc(businessId, "bld_mark_tax_failed", { p_id: targetId, p_reason: reason }));
}

// ═══ 외부 파일 가져오기(write; 은행은 확정 시 payment.allocate) ═══
/** lib/import toStagingRows() 결과를 스테이징에 저장(V7 파일 해시 중복 차단). 호실 매칭은 서버가 다시 한다. */
export async function stageImport(businessId: string, buildingId: string, input: { source_kind: ImportSourceKind; file_name: string; file_hash: string; period?: string | null; mapping?: Record<string, unknown>; rows: BuildingStagingRowInput[]; charge_type_id?: string | null; meter_kind?: MeterKind | null; total?: number | null }): Promise<ActionResult<ImportStageResult>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    return rpc(businessId, "bld_import_stage", {
      p_building: buildingId, p_source_kind: input.source_kind, p_file_name: input.file_name, p_file_hash: input.file_hash, p_period: input.period ?? null,
      p_mapping: input.mapping ?? {}, p_rows: input.rows, p_charge_type: input.charge_type_id ?? null, p_meter_kind: input.meter_kind ?? null, p_total: input.total ?? null,
    });
  });
}
/** 원자적 확정(오류 0 일 때만): 검침/비용/직접금액/입금(배정 안 함)/호실. */
export async function commitImport(businessId: string, batchId: string): Promise<ActionResult<{ committed: number; skipped: number }>> {
  return withCap(businessId, "write", () => rpc(businessId, "bld_import_commit", { p_batch: batchId }));
}
export async function cancelImport(businessId: string, batchId: string, reason?: string): Promise<ActionResult<{ reverted: number }>> {
  return withCap(businessId, "write", () => rpc(businessId, "bld_import_cancel", { p_batch: batchId, p_reason: reason ?? null }));
}

// ═══ 설정(staff.manage) ═══
/** 선택 기능 켜기/끄기(31키 화이트리스트는 서버 bld_feature_defs). */
export async function setBuildingFeature(businessId: string, key: BuildingFeatureKey, enabled: boolean): Promise<ActionResult<Record<string, boolean>>> {
  return withCap(businessId, "staff.manage", () => rpc(businessId, "set_business_feature", { p_business: businessId, p_key: key, p_enabled: enabled }));
}

// ═══ P1/P2 기타(features.work_orders·long_term_repair·budget·disclosure) ═══
/** 0032: 처리 비용(cost)을 넣으려면 revenue.read 도 필요(뷰 게이트와 대칭, DB 트리거가 재검사). */
export async function createWorkOrder(businessId: string, buildingId: string, input: { title: string; unit_id?: string | null; assignee?: string | null; memo?: string; cost?: number | null }): Promise<ActionResult<{ id: string }>> {
  const caps: Cap[] = input.cost != null ? ["write", "revenue.read"] : ["write"];
  return withCap(businessId, caps, async () => {
    const f = await crm().rpc("bld_feature_status", { p_business: businessId, p_key: "work_orders" });
    if (f.error) return err(f.error);
    if (f.data !== "on") return { ok: false, message: pgError({ message: "feature_off:" }).message, hint: "feature_off" };
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_work_orders").insert({ ...input, business_id: businessId, building_id: buildingId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function updateWorkOrder(businessId: string, id: string, patch: { status?: "open" | "in_progress" | "done" | "cancelled"; assignee?: string | null; cost?: number | null; expense_id?: string | null; memo?: string; done_at?: string | null }): Promise<ActionResult> {
  const caps: Cap[] = "cost" in patch ? ["write", "revenue.read"] : ["write"];
  return withCap(businessId, caps, async () => {
    const r = await mustAffect(crm().from("bld_work_orders").update(patch).eq("id", id).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
export async function recordDisclosureRequest(businessId: string, buildingId: string, input: { unit_id?: string | null; party_id?: string | null; period_from?: string; period_to?: string; note?: string; provided_at?: string | null }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_disclosure_requests").insert({ ...input, business_id: businessId, building_id: buildingId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function recordDispute(businessId: string, billId: string, input: { kind: "dispute" | "correction_request" | "note"; note: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const { data, error } = await crm().from("bld_disputes").insert({ ...input, business_id: businessId, bill_id: billId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function resolveDispute(businessId: string, id: string, status: "resolved" | "rejected", resolution: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const r = await mustAffect(crm().from("bld_disputes").update({ status, resolution, resolved_at: new Date().toISOString() }).eq("id", id).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
export async function addRepairFundEntry(businessId: string, buildingId: string, input: { period: string; kind: "contribution" | "spend" | "interest" | "adjust"; amount: number; memo?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    const f = await crm().rpc("bld_feature_status", { p_business: businessId, p_key: "long_term_repair" });
    if (f.error) return err(f.error);
    if (f.data !== "on") return { ok: false, message: pgError({ message: "feature_off:" }).message, hint: "feature_off" };
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_repair_fund").insert({ ...input, business_id: businessId, building_id: buildingId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function upsertBudget(businessId: string, buildingId: string, input: { year: number; std_category: string; amount: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "billing.configure", async () => {
    const f = await crm().rpc("bld_feature_status", { p_business: businessId, p_key: "budget" });
    if (f.error) return err(f.error);
    if (f.data !== "on") return { ok: false, message: pgError({ message: "feature_off:" }).message, hint: "feature_off" };
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const { data, error } = await crm().from("bld_budgets").upsert({ ...input, business_id: businessId, building_id: buildingId }, { onConflict: "building_id,year,std_category" }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
