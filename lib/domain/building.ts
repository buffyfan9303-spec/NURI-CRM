/**
 * 건물 관리비(building) 읽기 — 화면(RSC)이 쓰는 조회 함수. 전부 RLS 아래에서 실행된다.
 * 금액·연락처는 마스킹 뷰(v_bld_*)로 읽는다(권한 없으면 null). 쓰기는 building-actions.ts.
 * "use server" 가 아니다(순수 서버 모듈).
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { checkAccess, type AccessResult } from "@/lib/auth/access";
import { buildingNav } from "@/lib/industry/config";
import type {
  AgingReport, BillLineRow, BillRow, BillingRunRow, BuildingFeatureKey, BuildingFeatureStatus, BuildingRow, CategoryReport, ChargeTypeRow,
  ContractRow, ExpenseRow, ImportBatchRow, ImportRowRow, MeterReadingRow, MeterRow, PartyRow, PaymentRow, PeriodRow, ReceivableRow,
  TaxTargetRow, TodoSummary, UnitRow, CreditRow, HometaxRow,
  PaymentAllocationRow, PaymentLine, DunningRow, DunningLast, WorkOrderRow, WorkOrderStatus, CorrectionRunRow,
} from "@/lib/domain/building-types";
import { BUILDING_FEATURE_DEFAULT_ON, BUILDING_FEATURE_KEYS, BUILDING_FEATURE_NEEDS_CONTRACT } from "@/lib/domain/building-types";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };
const fail = (e: { message: string }): { ok: false; message: string } => {
  console.error("[building read]", e.message);
  return { ok: false, message: "불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
};
const crm = () => getServerSupabase().schema("crm");

/** 사업장 접근 + 건물 업종 메뉴(선택 기능 반영). 화면 레이아웃이 쓴다. */
export async function getBuildingAccess(businessId: string): Promise<AccessResult & { nav?: ReturnType<typeof buildingNav> }> {
  const a = await checkAccess(businessId);
  if (!a.ok) return a;
  return { ...a, nav: buildingNav(a.settings).filter((n) => a.caps.includes(n.cap as never)) };
}

/** 선택 기능 상태(31키) — 켜짐/꺼짐/외부 계약 필요. 설정 화면·서버 판정이 같은 표를 본다. */
export function resolveBuildingFeatures(settings: Record<string, unknown> | null | undefined): Record<BuildingFeatureKey, BuildingFeatureStatus> {
  const f = ((settings?.features ?? {}) as Record<string, unknown>) || {};
  const out = {} as Record<BuildingFeatureKey, BuildingFeatureStatus>;
  for (const k of BUILDING_FEATURE_KEYS) {
    const on = typeof f[k] === "boolean" ? (f[k] as boolean) : BUILDING_FEATURE_DEFAULT_ON.includes(k);
    out[k] = !on ? "off" : BUILDING_FEATURE_NEEDS_CONTRACT.includes(k) ? "external_contract_required" : "on";
  }
  return out;
}

export async function listBuildings(businessId: string): Promise<ReadResult<BuildingRow[]>> {
  const { data, error } = await crm().from("bld_buildings").select("*").eq("business_id", businessId).eq("active", true).order("name");
  return error ? fail(error) : { ok: true, data: (data ?? []) as BuildingRow[] };
}
export async function getBuilding(buildingId: string): Promise<ReadResult<BuildingRow | null>> {
  const { data, error } = await crm().from("bld_buildings").select("*").eq("id", buildingId).maybeSingle();
  return error ? fail(error) : { ok: true, data: (data as BuildingRow | null) ?? null };
}
export async function listUnits(buildingId: string, opts: { includeInactive?: boolean } = {}): Promise<ReadResult<UnitRow[]>> {
  let q = crm().from("bld_units").select("*").eq("building_id", buildingId).order("unit_no");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, data: (data ?? []) as UnitRow[] };
}
/** 연락처는 pii.read 없으면 null. */
export async function listParties(businessId: string): Promise<ReadResult<PartyRow[]>> {
  const { data, error } = await crm().from("v_bld_parties").select("*").eq("business_id", businessId).eq("active", true).order("name");
  return error ? fail(error) : { ok: true, data: (data ?? []) as PartyRow[] };
}
/** rent·deposit 은 revenue.read 없으면 null. */
export async function listContracts(buildingId: string, opts: { unitId?: string; activeOnly?: boolean } = {}): Promise<ReadResult<ContractRow[]>> {
  let q = crm().from("v_bld_contracts").select("*").eq("building_id", buildingId).order("period", { ascending: false });
  if (opts.unitId) q = q.eq("unit_id", opts.unitId);
  if (opts.activeOnly !== false) q = q.eq("status", "active");
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, data: (data ?? []) as ContractRow[] };
}
export async function listChargeTypes(buildingId: string, opts: { includeInactive?: boolean } = {}): Promise<ReadResult<ChargeTypeRow[]>> {
  let q = crm().from("bld_charge_types").select("*").eq("building_id", buildingId).order("sort_order").order("name");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, data: (data ?? []) as ChargeTypeRow[] };
}
export async function listMeters(buildingId: string): Promise<ReadResult<MeterRow[]>> {
  const { data, error } = await crm().from("bld_meters").select("*").eq("building_id", buildingId).eq("active", true).order("kind");
  return error ? fail(error) : { ok: true, data: (data ?? []) as MeterRow[] };
}
/** 청구월의 검침(전월 지침 자동 채움은 화면이 prev 를 이전 달 curr 로 제안). */
export async function listMeterReadings(businessId: string, period: string): Promise<ReadResult<MeterReadingRow[]>> {
  const { data, error } = await crm().from("bld_meter_readings").select("*").eq("business_id", businessId).eq("period", period);
  return error ? fail(error) : { ok: true, data: (data ?? []) as MeterReadingRow[] };
}
export async function listExpenses(buildingId: string, period: string): Promise<ReadResult<ExpenseRow[]>> {
  const { data, error } = await crm().from("v_bld_expenses").select("*").eq("building_id", buildingId).eq("period", period).order("created_at");
  return error ? fail(error) : { ok: true, data: (data ?? []) as ExpenseRow[] };
}
export async function getPeriod(buildingId: string, period: string): Promise<ReadResult<PeriodRow | null>> {
  const { data, error } = await crm().from("bld_periods").select("*").eq("building_id", buildingId).eq("period", period).maybeSingle();
  return error ? fail(error) : { ok: true, data: (data as PeriodRow | null) ?? null };
}
export async function listPeriods(buildingId: string): Promise<ReadResult<PeriodRow[]>> {
  const { data, error } = await crm().from("bld_periods").select("*").eq("building_id", buildingId).order("period", { ascending: false });
  return error ? fail(error) : { ok: true, data: (data ?? []) as PeriodRow[] };
}
/** 청구월의 정기 계산 결과(void·정정 run 제외, 승인본 우선·최신 revision). 합계·경고 금액은 revenue.read 없으면 null/제거(0033 뷰). */
export async function getLatestRun(periodId: string): Promise<ReadResult<BillingRunRow | null>> {
  const { data, error } = await crm().from("v_bld_billing_runs").select("*").eq("period_id", periodId).neq("status", "void").not("input_hash", "like", "correction:%").order("revision", { ascending: false });
  if (error) return fail(error);
  const rows = (data ?? []) as BillingRunRow[];
  return { ok: true, data: rows.find((r) => r.status === "approved") ?? rows[0] ?? null };
}
/** 0033: 정정 run 목록(초안 = 승인 대기, 승인 = 반영됨). 0034 부터 행에 `reason`(정정 사유)이 있다. */
export async function listCorrectionRuns(periodId: string): Promise<ReadResult<BillingRunRow[]>> {
  const { data, error } = await crm().from("v_bld_billing_runs").select("*").eq("period_id", periodId).like("input_hash", "correction:%").neq("status", "void").order("revision", { ascending: false });
  return error ? fail(error) : { ok: true, data: (data ?? []) as BillingRunRow[] };
}
/** 0034: 정정 run + 사유·입력자/승인자 표시이름·호실·차액(revenue.read 없으면 null). 소속이 아니면 빈 배열. */
export async function listCorrectionRunDetails(periodId: string): Promise<ReadResult<CorrectionRunRow[]>> {
  const { data, error } = await crm().rpc("bld_correction_runs", { p_period: periodId });
  return error ? fail(error) : { ok: true, data: ((data ?? []) as CorrectionRunRow[]) };
}
/** 청구서(금액·trace 는 revenue.read 없으면 null). */
export async function listBills(runId: string): Promise<ReadResult<BillRow[]>> {
  const { data, error } = await crm().from("v_bld_bills").select("*").eq("run_id", runId).order("revision");
  return error ? fail(error) : { ok: true, data: (data ?? []) as BillRow[] };
}
export async function getBill(billId: string): Promise<ReadResult<{ bill: BillRow; lines: BillLineRow[] } | null>> {
  const [b, l] = await Promise.all([
    crm().from("v_bld_bills").select("*").eq("id", billId).maybeSingle(),
    crm().from("v_bld_bill_lines").select("*").eq("bill_id", billId).order("sort_order"),
  ]);
  if (b.error) return fail(b.error);
  if (l.error) return fail(l.error);
  if (!b.data) return { ok: true, data: null };
  return { ok: true, data: { bill: b.data as BillRow, lines: (l.data ?? []) as BillLineRow[] } };
}
/** 호실의 12개월 당월 부과액 추이(명세서 그래프·전월 대비). 승인본만. */
export async function listUnitHistory(unitId: string, months = 12): Promise<ReadResult<{ period: string; current_charge: number | null; amount_due: number | null }[]>> {
  const { data, error } = await crm().from("v_bld_bills").select("period,current_charge,amount_due,run_id,bill_kind,revision")
    .eq("unit_id", unitId).eq("bill_kind", "regular").order("period", { ascending: false }).limit(months * 3);
  if (error) return fail(error);
  const runs = Array.from(new Set((data ?? []).map((r) => r.run_id as string)));
  const { data: rs, error: e2 } = runs.length ? await crm().from("bld_billing_runs").select("id,status").in("id", runs) : { data: [], error: null };
  if (e2) return fail(e2);
  const approved = new Set((rs ?? []).filter((r) => r.status === "approved").map((r) => r.id as string));
  const byPeriod = new Map<string, { period: string; current_charge: number | null; amount_due: number | null }>();
  for (const r of data ?? []) if (approved.has(r.run_id as string) && !byPeriod.has(r.period as string)) byPeriod.set(r.period as string, { period: r.period as string, current_charge: r.current_charge as number | null, amount_due: r.amount_due as number | null });
  return { ok: true, data: Array.from(byPeriod.values()).slice(0, months).reverse() };
}
export async function listReceivables(buildingId: string, opts: { openOnly?: boolean; unitId?: string } = {}): Promise<ReadResult<ReceivableRow[]>> {
  let q = crm().from("v_bld_receivables").select("*").eq("building_id", buildingId).order("due_date");
  if (opts.openOnly !== false) q = q.eq("status", "open");
  if (opts.unitId) q = q.eq("unit_id", opts.unitId);
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, data: (data ?? []) as ReceivableRow[] };
}
export async function listPayments(buildingId: string, opts: { from?: string; to?: string; unitId?: string } = {}): Promise<ReadResult<PaymentRow[]>> {
  let q = crm().from("v_bld_payments").select("*").eq("building_id", buildingId).order("paid_at", { ascending: false }).limit(500);
  if (opts.from) q = q.gte("paid_at", opts.from);
  if (opts.to) q = q.lte("paid_at", opts.to);
  if (opts.unitId) q = q.eq("unit_id", opts.unitId);
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, data: (data ?? []) as PaymentRow[] };
}
export async function listCredits(unitId: string): Promise<ReadResult<CreditRow[]>> {
  const { data, error } = await crm().from("v_bld_credits").select("*").eq("unit_id", unitId).gt("remaining", 0).order("created_at");
  return error ? fail(error) : { ok: true, data: (data ?? []) as CreditRow[] };
}
export async function listTaxTargets(runId: string): Promise<ReadResult<TaxTargetRow[]>> {
  const { data, error } = await crm().from("v_bld_tax_targets").select("*").eq("run_id", runId).order("kind").order("created_at");
  return error ? fail(error) : { ok: true, data: (data ?? []) as TaxTargetRow[] };
}
/** 발행 대상 → 홈택스 파일 입력(HometaxRow[]). ready·file_generated 만. buildHometaxWorkbook(rows, kind) 에 그대로 넘긴다. */
export async function taxTargetsToHometaxRows(targets: TaxTargetRow[], kind: "tax_invoice" | "invoice_exempt"): Promise<{ ids: string[]; rows: HometaxRow[] }> {
  const picked = targets.filter((t) => t.kind === kind && (t.issue_status === "ready" || t.issue_status === "file_generated") && t.snapshot);
  return { ids: picked.map((t) => t.id), rows: picked.map((t) => t.snapshot as HometaxRow) };
}
export async function listImportBatches(buildingId: string): Promise<ReadResult<ImportBatchRow[]>> {
  const { data, error } = await crm().from("v_bld_import_batches").select("*").eq("building_id", buildingId).order("created_at", { ascending: false }).limit(100);
  return error ? fail(error) : { ok: true, data: (data ?? []) as ImportBatchRow[] };
}
export async function listImportRows(batchId: string): Promise<ReadResult<ImportRowRow[]>> {
  const { data, error } = await crm().from("v_bld_import_rows").select("*").eq("batch_id", batchId).order("row_no");
  return error ? fail(error) : { ok: true, data: (data ?? []) as ImportRowRow[] };
}
export async function getImportMapping(buildingId: string, sourceKind: string, fingerprint: string): Promise<ReadResult<Record<string, unknown> | null>> {
  const { data, error } = await crm().from("bld_import_mappings").select("mapping").eq("building_id", buildingId).eq("source_kind", sourceKind).eq("fingerprint", fingerprint).maybeSingle();
  return error ? fail(error) : { ok: true, data: (data?.mapping as Record<string, unknown>) ?? null };
}

// ── 보고서 RPC(서버 집계, revenue.read 검사는 RPC 안에서)
export async function getTodo(buildingId: string, period: string): Promise<ReadResult<TodoSummary>> {
  const { data, error } = await crm().rpc("bld_todo", { p_building: buildingId, p_period: period });
  return error ? fail(error) : { ok: true, data: data as TodoSummary };
}
export async function getCategoryReport(buildingId: string, period: string): Promise<ReadResult<CategoryReport>> {
  const { data, error } = await crm().rpc("bld_report_categories", { p_building: buildingId, p_period: period });
  return error ? fail(error) : { ok: true, data: data as CategoryReport };
}
export async function getAging(buildingId: string, asOf?: string): Promise<ReadResult<AgingReport>> {
  const { data, error } = await crm().rpc("bld_aging", { p_building: buildingId, p_asof: asOf ?? null });
  return error ? fail(error) : { ok: true, data: data as AgingReport };
}
/** 월 원장 Excel 7시트 행(units·charge_types·sources·bills·tax_targets·receivables·payments + audit). export 권한. */
export async function getLedgerRows(buildingId: string, period: string): Promise<ReadResult<Record<string, unknown>>> {
  const { data, error } = await crm().rpc("bld_ledger_rows", { p_building: buildingId, p_period: period });
  return error ? fail(error) : { ok: true, data: data as Record<string, unknown> };
}
// ── 0032: 화면이 뷰를 직접 읽던 조회를 여기로(입금 배정·독촉·민원)
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
/** 입금별 배정 행(취소분 포함, reversed 로 구분). 금액은 revenue.read 없으면 null. */
export async function listPaymentAllocations(paymentIds: string[]): Promise<ReadResult<PaymentAllocationRow[]>> {
  const out: PaymentAllocationRow[] = [];
  for (const part of chunk(paymentIds, 80)) {
    const { data, error } = await crm().from("v_bld_payment_allocations").select("*").in("payment_id", part).order("created_at");
    if (error) return fail(error);
    out.push(...((data ?? []) as PaymentAllocationRow[]));
  }
  return { ok: true, data: out };
}
/** 입금 목록에 배정·크레딧·미배정을 붙인다(서버 bld_allocate_payment 와 같은 식). 역분개된 입금·음수 행은 미배정 0. */
export async function withPaymentAllocation(payments: PaymentRow[]): Promise<ReadResult<PaymentLine[]>> {
  const ids = payments.filter((p) => (p.amount ?? 0) > 0).map((p) => p.id);
  const alloc = new Map<string, number>(), cred = new Map<string, number>();
  for (const part of chunk(ids, 80)) {
    const [a, c] = await Promise.all([
      crm().from("v_bld_payment_allocations").select("payment_id,amount,reversed").in("payment_id", part),
      crm().from("v_bld_credits").select("source_payment_id,amount").in("source_payment_id", part),
    ]);
    if (a.error) return fail(a.error);
    if (c.error) return fail(c.error);
    for (const r of a.data ?? []) if (!r.reversed) alloc.set(r.payment_id as string, (alloc.get(r.payment_id as string) ?? 0) + Number(r.amount ?? 0));
    for (const r of c.data ?? []) if (r.source_payment_id) cred.set(r.source_payment_id as string, (cred.get(r.source_payment_id as string) ?? 0) + Number(r.amount ?? 0));
  }
  return {
    ok: true,
    data: payments.map((p) => {
      const allocated = alloc.get(p.id) ?? 0, credit = cred.get(p.id) ?? 0;
      const live = (p.amount ?? 0) > 0 && !p.reversed_by;
      return { ...p, allocated, credit, unallocated: live ? Math.max(0, (p.amount ?? 0) - allocated - credit) : 0 };
    }),
  };
}
/** 독촉 기록(최신순). */
export async function listDunning(receivableIds: string[]): Promise<ReadResult<DunningRow[]>> {
  const out: DunningRow[] = [];
  for (const part of chunk(receivableIds, 80)) {
    const { data, error } = await crm().from("bld_dunning").select("*").in("receivable_id", part).order("created_at", { ascending: false });
    if (error) return fail(error);
    out.push(...((data ?? []) as DunningRow[]));
  }
  return { ok: true, data: out };
}
/** 채권별 마지막 독촉 + 횟수. */
export async function lastDunning(receivableIds: string[]): Promise<ReadResult<Map<string, DunningLast>>> {
  const r = await listDunning(receivableIds);
  if (!r.ok) return r;
  const out = new Map<string, DunningLast>();
  for (const d of r.data) {
    const prev = out.get(d.receivable_id);
    if (prev) prev.count += 1;
    else out.set(d.receivable_id, { receivable_id: d.receivable_id, stage: d.stage, channel: d.channel, created_at: d.created_at, promise_date: d.promise_date, count: 1 });
  }
  return { ok: true, data: out };
}
/** 민원·수리 목록(최신순, 최대 300). cost 는 revenue.read 없으면 null. 기능 게이트(work_orders)는 화면·액션이 본다. */
export async function listWorkOrders(buildingId: string, opts: { status?: WorkOrderStatus; limit?: number } = {}): Promise<ReadResult<WorkOrderRow[]>> {
  let q = crm().from("v_bld_work_orders").select("*").eq("building_id", buildingId).order("created_at", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, data: (data ?? []) as WorkOrderRow[] };
}

export async function getFeatureStatus(businessId: string, key: BuildingFeatureKey): Promise<ReadResult<BuildingFeatureStatus>> {
  const { data, error } = await crm().rpc("bld_feature_status", { p_business: businessId, p_key: key });
  return error ? fail(error) : { ok: true, data: data as BuildingFeatureStatus };
}
