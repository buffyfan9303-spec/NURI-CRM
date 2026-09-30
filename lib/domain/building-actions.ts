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
import { BUILDING_ERROR_TEXT, plainBuildingError } from "@/lib/domain/building-errors";
import { STD_CATEGORIES } from "@/lib/domain/building-types";
import type {
  BuildingFeatureKey, BuildingKind, ChargeTypeRow, ContractRow, CorrectionLine, ImportSourceKind, ImportStageResult, LateTerms, MeterKind,
  PartyRow, PaymentMethod, PaymentResult, PeriodStatus, ReadingReason, RunSummary, UnitBulkInput, UnitRow, UnitsBulkResult, BuildingStagingRowInput,
  CorrectionResult,
} from "@/lib/domain/building-types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string; hint?: string };

/** RPC 오류 힌트 → 사용자 문구(쉬운 말 표는 building-errors.ts). Postgres 원문은 콘솔에만. */
function pgError(e: { code?: string; message: string; hint?: string | null }): { message: string; hint?: string } {
  const r = plainBuildingError(e);
  if (r.hint === undefined) console.error("[building pgError] unmapped:", e.code, e.message);
  return r;
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
  for (const seg of ["", "units", "meters", "expenses", "billing", "statements", "payments", "receivables", "tax", "reports", "charges", "imports", "settings", "disputes"])
    revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
}
/** 클라이언트가 보낸 건물 id 가 이 사업장 것인지 서버가 다시 확인한다. */
async function assertBuilding(businessId: string, buildingId: string): Promise<ActionResult<undefined>> {
  const { data, error } = await crm().from("bld_buildings").select("id").eq("id", buildingId).eq("business_id", businessId).maybeSingle();
  if (error) return err(error);
  if (!data) return { ok: false, message: BUILDING_ERROR_TEXT.building_not_in_business, hint: "building_not_in_business" };
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
    if (!Number.isSafeInteger(input.amount) || input.amount === 0) return { ok: false, message: "금액은 0이 아닌 원 단위 숫자여야 합니다. 깎아 주는 돈이면 앞에 −를 붙이세요.", hint: "invalid_amount" };
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    // 계산은 '직접 입력' 항목만 이 표를 읽는다. 다른 방식 항목에 넣으면 조용히 무시되므로 여기서 막는다.
    const ct = await crm().from("bld_charge_types").select("source_kind").eq("id", input.charge_type_id).eq("building_id", buildingId).maybeSingle();
    if (ct.error) return err(ct.error);
    if (ct.data?.source_kind !== "direct") return { ok: false, message: BUILDING_ERROR_TEXT.not_direct_type, hint: "not_direct_type" };
    // upsert(ON CONFLICT)는 금액 표의 SELECT 권한(가려진 표)을 요구해 일반 담당자가 거부된다 → 마스킹 뷰로 기존 행을 찾아 고치거나 새로 넣는다.
    const find = async () => crm().from("v_bld_direct_charges").select("id").eq("charge_type_id", input.charge_type_id).eq("period", input.period).eq("unit_id", input.unit_id).eq("building_id", buildingId).maybeSingle();
    const patch = async (id: string): Promise<ActionResult<{ id: string }>> => {
      const u = await mustAffect(crm().from("bld_direct_charges").update({ amount: input.amount, reason: input.reason ?? null }).eq("id", id).eq("business_id", businessId));
      if (!u.ok) return u.error ? err(u.error) : { ok: false, message: NO_ROWS_MESSAGE };
      reval(businessId);
      return { ok: true, data: { id } };
    };
    const f = await find();
    if (f.error) return err(f.error);
    if (f.data) return patch(f.data.id as string);
    const ins = await crm().from("bld_direct_charges").insert({ ...input, business_id: businessId, building_id: buildingId }).select("id").single();
    if (ins.error?.code === "23505") { // 동시에 같은 칸을 넣은 경우 → 방금 생긴 행을 고친다
      const again = await find();
      if (again.data) return patch(again.data.id as string);
    }
    if (ins.error) return err(ins.error);
    reval(businessId);
    return { ok: true, data: { id: ins.data.id as string } };
  });
}
/** 호실별 따로 넣는 금액 삭제(delete cap). 확정된 청구월은 DB 트리거가 거부(period_locked). */
export async function deleteDirectCharge(businessId: string, id: string): Promise<ActionResult> {
  return withCap(businessId, "delete", async () => {
    const r = await mustAffect(crm().from("bld_direct_charges").delete().eq("id", id).eq("business_id", businessId));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
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
  if (!paidAt) return { ok: false, message: BUILDING_ERROR_TEXT.invalid_paid_at, hint: "invalid_paid_at" };
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
  if (rows.length === 0 || rows.length > 50) return { ok: false, message: BUILDING_ERROR_TEXT.bulk_size, hint: "bulk_size" };
  try { await requireCap(businessId, "payment.allocate"); } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail, hint: e.detail.reason };
    throw e;
  }
  const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
  const results: BulkPaymentOutcome[] = [];
  for (const [index, r] of rows.entries()) {
    const unit = r.unit_id || null;
    const paidAt = /^\d{4}-\d{2}-\d{2}T/.test(r.paid_at) && !Number.isNaN(Date.parse(r.paid_at)) ? new Date(r.paid_at).toISOString() : null;
    if (!paidAt || !Number.isInteger(r.amount) || r.amount <= 0 || !r.external_key) { results.push({ index, status: "failed", unit_id: unit, allocated: 0, credit: 0, message: "입금 날짜·금액·거래 번호를 확인하세요." }); continue; }
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
export async function recordDispute(businessId: string, billId: string, input: { kind: "dispute" | "correction_request" | "info_request" | "note"; note: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const note = input.note?.trim() ?? "";
    if (!note || note.length > 1000) return { ok: false, message: BUILDING_ERROR_TEXT.note_required, hint: "note_required" };
    // 확정(승인)된 계산의 청구서에만 남긴다. 확정 전이면 계산·입력 화면에서 바로 고치면 된다.
    const bill = await crm().from("bld_bills").select("run_id").eq("id", billId).eq("business_id", businessId).maybeSingle();
    if (bill.error) return err(bill.error);
    const run = bill.data ? await crm().from("bld_billing_runs").select("status").eq("id", bill.data.run_id).maybeSingle() : null;
    if (run?.error) return err(run.error);
    if (run?.data?.status !== "approved") return { ok: false, message: BUILDING_ERROR_TEXT.bill_not_approved, hint: "bill_not_approved" };
    const { data, error } = await crm().from("bld_disputes").insert({ ...input, note, business_id: businessId, bill_id: billId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
export async function resolveDispute(businessId: string, id: string, status: "resolved" | "rejected", resolution: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const text = resolution?.trim() ?? "";
    if (!text || text.length > 1000) return { ok: false, message: BUILDING_ERROR_TEXT.resolution_required, hint: "resolution_required" };
    // 아직 열려 있는 건만 처리한다(이미 처리된 기록을 덮어쓰지 않는다).
    const r = await mustAffect(crm().from("bld_disputes").update({ status, resolution: text, resolved_at: new Date().toISOString() }).eq("id", id).eq("business_id", businessId).eq("status", "open"));
    if (!r.ok) return r.error ? err(r.error) : { ok: false, message: NO_ROWS_MESSAGE };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
/** 장기수선충당금 장부 한 줄. 적립·이자·사용은 양수로 적고(사용은 잔액에서 빼서 계산), 바로잡기(adjust)만 −도 허용한다. */
export async function addRepairFundEntry(businessId: string, buildingId: string, input: { period: string; kind: "contribution" | "spend" | "interest" | "adjust"; amount: number; memo?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) return { ok: false, message: "월은 2026-09 처럼 적어 주세요.", hint: "invalid_period" };
    if (!["contribution", "spend", "interest", "adjust"].includes(input.kind)) return { ok: false, message: "종류를 골라 주세요.", hint: "invalid_kind" };
    if (!Number.isSafeInteger(input.amount) || input.amount === 0 || (input.kind !== "adjust" && input.amount < 0)) return { ok: false, message: input.kind === "adjust" ? "바로잡을 금액은 0이 아닌 원 단위 숫자여야 합니다. 줄이는 돈이면 앞에 −를 붙이세요." : "금액은 0보다 큰 원 단위 숫자여야 합니다.", hint: "invalid_amount" };
    const f = await crm().rpc("bld_feature_status", { p_business: businessId, p_key: "long_term_repair" });
    if (f.error) return err(f.error);
    if (f.data !== "on") return { ok: false, message: pgError({ message: "feature_off:" }).message, hint: "feature_off" };
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const memo = input.memo?.trim() ? input.memo.trim().slice(0, 200) : null;
    const { data, error } = await crm().from("bld_repair_fund").insert({ period: input.period, kind: input.kind, amount: input.amount, memo, business_id: businessId, building_id: buildingId }).select("id").single();
    if (error) return err(error);
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}
/** 연 예산(분류별) 저장. 금액 표는 가려져 있어 upsert(ON CONFLICT)를 못 쓴다 → 뷰로 찾아 고치거나 새로 넣는다. */
export async function upsertBudget(businessId: string, buildingId: string, input: { year: number; std_category: string; amount: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "billing.configure", async () => {
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return { ok: false, message: "연도는 2000~2100 사이로 적어 주세요.", hint: "invalid_year" };
    if (!(STD_CATEGORIES as readonly string[]).includes(input.std_category)) return { ok: false, message: "분류를 골라 주세요.", hint: "invalid_category" };
    if (!Number.isSafeInteger(input.amount) || input.amount < 0) return { ok: false, message: "예산은 0 이상의 원 단위 숫자여야 합니다.", hint: "invalid_amount" };
    const f = await crm().rpc("bld_feature_status", { p_business: businessId, p_key: "budget" });
    if (f.error) return err(f.error);
    if (f.data !== "on") return { ok: false, message: pgError({ message: "feature_off:" }).message, hint: "feature_off" };
    const b = await assertBuilding(businessId, buildingId); if (!b.ok) return b;
    const find = async () => crm().from("v_bld_budgets").select("id").eq("building_id", buildingId).eq("year", input.year).eq("std_category", input.std_category).maybeSingle();
    const patch = async (id: string): Promise<ActionResult<{ id: string }>> => {
      const u = await mustAffect(crm().from("bld_budgets").update({ amount: input.amount }).eq("id", id).eq("business_id", businessId));
      if (!u.ok) return u.error ? err(u.error) : { ok: false, message: NO_ROWS_MESSAGE };
      reval(businessId);
      return { ok: true, data: { id } };
    };
    const cur = await find();
    if (cur.error) return err(cur.error);
    if (cur.data) return patch(cur.data.id as string);
    const ins = await crm().from("bld_budgets").insert({ ...input, business_id: businessId, building_id: buildingId }).select("id").single();
    if (ins.error?.code === "23505") { const again = await find(); if (again.data) return patch(again.data.id as string); }
    if (ins.error) return err(ins.error);
    reval(businessId);
    return { ok: true, data: { id: ins.data.id as string } };
  });
}
