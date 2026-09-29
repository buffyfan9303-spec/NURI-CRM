/**
 * 건물 관리비(building) — 서버·화면이 공유하는 타입과 상수. DB 계약은 supabase/migrations/0031_building_cam.sql.
 * 금액은 전부 원 단위 정수(bigint → number). 계산은 서버(SQL)가 하고 화면은 표시만 한다.
 * HometaxRow(building-hometax.ts)·BuildingStagingRowInput(lib/import/types.ts)과 필드명을 맞춘다.
 */
import type { HometaxRow } from "@/lib/domain/building-hometax";
import type { BuildingStagingRowInput, SourceKind } from "@/lib/import/types";

export type { HometaxRow, BuildingStagingRowInput };

/** 선택 기능 키 — crm.bld_feature_defs 와 같은 표(building-calc.test.ts 가 SQL 파일과 대조한다). */
export const BUILDING_FEATURE_KEYS = [
  "late_fee", "tax_invoice", "tax_invoice_asp", "deposit", "rent", "rent_escalation", "cam_reconciliation", "budget",
  "meter_gas", "meter_heat", "meter_multi", "meter_remote_import", "virtual_account", "auto_debit", "bank_auto_fetch", "alimtalk",
  "email_statement", "statement_qr", "statement_stub", "statement_chart", "statement_notice", "tenant_portal", "work_orders", "inspections",
  "long_term_repair", "owners_report", "kapt_export", "vendor_payables", "extra_fees", "listing_fee_summary", "self_approve",
] as const;
export type BuildingFeatureKey = (typeof BUILDING_FEATURE_KEYS)[number];
/** 기본 켬인 키. 나머지는 끔. */
export const BUILDING_FEATURE_DEFAULT_ON: readonly BuildingFeatureKey[] = ["statement_chart", "statement_notice"];
/** 외부 계약 없이는 동작하지 않는 키(켜도 상태는 external_contract_required). */
export const BUILDING_FEATURE_NEEDS_CONTRACT: readonly BuildingFeatureKey[] = ["tax_invoice_asp", "virtual_account", "auto_debit", "bank_auto_fetch", "alimtalk"];
export type BuildingFeatureStatus = "on" | "off" | "external_contract_required" | "unknown" | "forbidden";

/** 상가건물 임대차보호법 시행령 별표1 14분류 + rent + other. 표시 순서 = 배열 순서. */
export const STD_CATEGORIES = [
  "general", "cleaning", "security", "disinfection", "elevator", "hvac", "repair", "mgmt_fee",
  "electric", "water", "gas", "septic", "waste", "insurance", "rent", "other",
] as const;
export type StdCategory = (typeof STD_CATEGORIES)[number];
export const STD_CATEGORY_LABEL: Record<StdCategory, string> = {
  general: "일반관리비", cleaning: "청소비", security: "경비비", disinfection: "소독비", elevator: "승강기유지비", hvac: "냉난방·급탕비",
  repair: "수선유지비", mgmt_fee: "위탁관리수수료", electric: "전기료", water: "수도료", gas: "가스료", septic: "정화조", waste: "폐기물",
  insurance: "건물보험료", rent: "임대료", other: "기타",
};

export type BuildingKind = "commercial" | "condo" | "apartment" | "other";
export type UnitUseKind = "retail" | "office" | "residential" | "parking" | "common" | "other";
export type PartyKind = "person" | "corp";
export type SourceKindCharge = "expense" | "rate" | "direct";
export type AllocMethod = "fixed" | "area" | "share" | "weight" | "equal" | "meter_usage" | "direct";
export type Payer = "tenant" | "owner" | "association";
export type TaxTreatment = "taxable" | "exempt" | "non_taxable" | "pass_through";
export type MeterKind = "electric" | "water" | "gas" | "heat" | "hotwater";
export type ReadingReason = "replaced" | "typo" | "estimated" | "rollover";
export type PeriodStatus = "collecting" | "draft" | "review" | "approved" | "finalized" | "closed";
export type RunStatus = "draft" | "approved" | "void";
export type BillKind = "regular" | "correction";
export type ReceivableStatus = "open" | "paid" | "void";
export type PaymentMethod = "transfer" | "cash" | "card" | "virtual_account" | "auto_debit" | "other";
export type TaxKind = "tax_invoice" | "invoice_exempt";
export type TaxIssueStatus = "blocked" | "ready" | "file_generated" | "issued" | "failed";
export type ImportSourceKind = SourceKind | "units";
export type ImportBatchStatus = "uploaded" | "mapped" | "validated" | "committed" | "cancelled";
export type LateRateUnit = "annual" | "monthly" | "daily";
export type LateMethod = "simple" | "compound_monthly";

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  collecting: "자료 수집", draft: "계산 초안", review: "검토", approved: "승인", finalized: "명세 확정", closed: "마감",
};
export const TAX_ISSUE_STATUS_LABEL: Record<TaxIssueStatus, string> = {
  blocked: "차단(사유 확인)", ready: "발행용 파일 준비 가능", file_generated: "파일 생성됨 — 홈택스 발행 확인 필요", issued: "발행 완료(승인번호)", failed: "실패",
};

export interface BuildingRow {
  id: string; business_id: string; name: string; kind: BuildingKind; address: string | null;
  supplier_party_id: string | null; vacancy_party_id: string | null; due_day: number;
  bank_name: string | null; bank_account: string | null; bank_holder: string | null;
  office_name: string | null; office_phone: string | null; office_hours: string | null;
  meter_error_pct: number; settings: Record<string, unknown>; active: boolean; created_at: string;
}
export interface UnitRow {
  id: string; business_id: string; building_id: string; dong: string | null; floor: string | null; unit_no: string; use_kind: UnitUseKind;
  area_exclusive: number; area_common: number; share: number; weight: number; owner_party_id: string | null;
  valid: string; active: boolean; memo: string | null; created_at: string;
}
/** phone·email 은 pii.read 없으면 null(뷰 v_bld_parties). */
export interface PartyRow {
  id: string; business_id: string; kind: PartyKind; name: string; biz_reg_no: string | null; ceo_name: string | null; address: string | null;
  biz_type: string | null; biz_item: string | null; phone: string | null; email: string | null; memo: string | null; active: boolean; created_at: string;
}
export interface LateTerms {
  late_rate: number | null; late_rate_unit: LateRateUnit | null; late_method: LateMethod | null; late_grace_days: number | null;
  late_basis: "principal" | "principal_and_fee" | null; late_partial_order: "oldest_first" | "fee_first" | null;
  late_cap_pct: number | null; late_cap_none: boolean; late_approved_by: string | null; late_approved_at: string | null;
}
/** rent·deposit 은 revenue.read 없으면 null(뷰 v_bld_contracts). */
export interface ContractRow extends LateTerms {
  id: string; business_id: string; building_id: string; unit_id: string; tenant_party_id: string; bill_to_party_id: string | null; tax_to_party_id: string | null;
  period: string; rent: number | null; deposit: number | null; proration: "none" | "daily"; status: "active" | "ended"; memo: string | null; created_at: string;
  late_edited_by: string | null;
}
export interface ChargeTypeRow {
  id: string; business_id: string; building_id: string; name: string; std_category: StdCategory; source_kind: SourceKindCharge; alloc_method: AllocMethod;
  payer: Payer; tax_treatment: TaxTreatment; supplier_party_id: string | null; fixed_amount: number | null; unit_rate: number | null; rate_includes_vat: boolean;
  meter_kind: MeterKind | null; tax_approved_by: string | null; tax_approved_at: string | null; valid: string; sort_order: number; active: boolean; memo: string | null;
}
export interface MeterRow { id: string; business_id: string; building_id: string; unit_id: string; kind: MeterKind; serial: string | null; multiplier: number; unit_label: string; max_reading: number | null; active: boolean; }
export interface MeterReadingRow { id: string; business_id: string; meter_id: string; period: string; prev_reading: number; curr_reading: number; usage_override: number | null; reason: ReadingReason | null; read_date: string | null; import_batch_id: string | null; created_at: string; }
export interface ExpenseRow { id: string; business_id: string; building_id: string; period: string; charge_type_id: string; supply: number | null; vat: number | null; amount: number | null; vendor: string | null; doc_no: string | null; doc_hash: string | null; evidence_path: string | null; memo: string | null; created_at: string; }
export interface PeriodRow { id: string; business_id: string; building_id: string; period: string; status: PeriodStatus; due_date: string | null; usage_from: string | null; usage_to: string | null; notice: string | null; }
/** v_bld_billing_runs 행. source_total·allocated_total 은 revenue.read 없으면 null(0033). reason 은 정정 입력 사유(0034), approve_reason 은 승인 사유. */
export interface BillingRunRow { id: string; business_id: string; building_id: string; period_id: string; revision: number; status: RunStatus; input_hash: string; source_total: number | null; allocated_total: number | null; blocks: RunIssue[]; warnings: RunIssue[]; calculated_by: string | null; calculated_at: string; approved_by: string | null; approved_at: string | null; approve_reason: string | null; reason?: string | null; }
/** 금액 키(prev·current·amount)는 v_bld_billing_runs 에서 revenue.read 없으면 제거된다(0033). */
export interface RunIssue { code: string; message: string; unit_id?: string; unit_no?: string; charge_type_id?: string; name?: string; prev?: number; current?: number; amount?: number; count?: number; receivable_id?: string; }
/** 금액·trace 는 revenue.read 없으면 null(뷰 v_bld_bills). */
export interface BillRow {
  id: string; business_id: string; run_id: string; building_id: string; period: string; unit_id: string; contract_id: string | null; bill_to_party_id: string | null; tax_to_party_id: string | null;
  bill_kind: BillKind; revision: number; corrects_bill_id: string | null;
  supply: number | null; vat: number | null; exempt: number | null; current_charge: number | null; prior_unpaid: number | null; late_fee: number | null; credit: number | null; amount_due: number | null;
  trace: BillTrace | null; created_at: string;
}
/** `왜 이 금액인가`: 원천 → 분자/분모 → 반올림 → 세액 → 전월 미수·선납 → 납부 요청액 */
export interface BillTrace {
  lines: BillTraceLine[];
  current_charge: { supply: number; vat: number; exempt: number; total: number };
  prior_unpaid: number;
  late_fee: { enabled: boolean; terms_ready: boolean; items: LateFeeCalc[]; total: number };
  credit: { available: number; applied: number };
  amount_due: number; asof: string; vat_rate: number;
}
export interface BillTraceLine { charge_type_id: string; std_category: StdCategory; name: string; supply: number; vat: number; exempt: number; amount: number; basis: Record<string, unknown>; }
export interface LateFeeCalc { amount: number; days: number; from?: string; to?: string; rate?: number; unit?: LateRateUnit; method?: LateMethod; grace_days?: number; cap_pct?: number | null; receivable_id?: string; principal?: number; period?: string; }
export interface BillLineRow { id: string; business_id: string; bill_id: string; charge_type_id: string | null; std_category: StdCategory; name: string; supply: number | null; vat: number | null; exempt: number | null; amount: number | null; basis: Record<string, unknown> | null; sort_order: number; }
/** 0033: 연체료는 별도 채권(kind late_fee, bill_id null). contract_id 는 그 채권의 연체 조건 계약. */
export interface ReceivableRow { id: string; business_id: string; building_id: string; bill_id: string | null; unit_id: string; party_id: string | null; contract_id: string | null; period: string; kind: "bill" | "late_fee" | "correction"; amount: number | null; paid: number | null; credit_applied: number | null; status: ReceivableStatus; due_date: string | null; created_at: string; }
/** 0034 bld_correction_runs 행: 정정 사유·입력자/승인자 표시이름. delta 는 revenue.read 없으면 null. */
export interface CorrectionRunRow { id: string; period_id: string; revision: number; status: RunStatus; reason: string | null; delta: number | null; corrected_bill_id: string | null; unit_no: string | null; entered_by: string | null; entered_by_name: string | null; entered_at: string; approved_by: string | null; approved_by_name: string | null; approved_at: string | null; approve_reason: string | null; }
/** 0033 정정 결과 — 초안이다. 다른 담당자가 approveRun(run_id) 해야 채권·크레딧이 생긴다. */
export interface CorrectionResult { correction_bill_id: string; run_id: string; revision: number; delta: number; status: "draft"; next: string }
export interface PaymentRow { id: string; business_id: string; building_id: string; unit_id: string | null; paid_at: string; amount: number | null; method: PaymentMethod; payer_name: string | null; external_key: string | null; memo: string | null; reversal_of: string | null; reversed_by: string | null; import_batch_id: string | null; created_at: string; }
export interface CreditRow { id: string; business_id: string; building_id: string; unit_id: string; party_id: string | null; kind: "prepay" | "overpay" | "discount" | "correction"; amount: number | null; remaining: number | null; source_payment_id: string | null; memo: string | null; created_at: string; }
export interface TaxTargetRow {
  id: string; business_id: string; building_id: string; run_id: string; period: string; kind: TaxKind; supplier_party_id: string | null; receiver_party_id: string | null; bill_ids: string[];
  snapshot: HometaxRow | null; supply: number | null; tax: number | null; total: number | null; receipt_type: "01" | "02"; write_date: string; issue_status: TaxIssueStatus; block_reasons: string[];
  file_generated_at: string | null; file_name: string | null; nts_approval_no: string | null; issued_at: string | null; issued_by: string | null; fail_reason: string | null; created_at: string;
}
export interface ImportBatchRow { id: string; business_id: string; building_id: string; source_kind: ImportSourceKind; file_name: string; file_hash: string; period: string | null; status: ImportBatchStatus; row_count: number; error_count: number; warning_count: number; total_amount: number | null; mapping: Record<string, unknown>; charge_type_id: string | null; meter_kind: MeterKind | null; committed_at: string | null; cancelled_at: string | null; created_at: string; }
/** fields 는 revenue.read 없으면 null, pii.read 없으면 입금자·이름 키 제거. before 는 가져오기가 덮어쓴 이전 값(취소 때 복원). */
export interface ImportRowRow { id: string; batch_id: string; row_no: number; period: string | null; room_key: string | null; room_match_type: "exact" | "fuzzy" | "none" | null; unit_id: string | null; fields: Record<string, string | number | null> | null; has_error: boolean; has_warning: boolean; issues: unknown[]; committed_ref: string | null; before: Record<string, unknown> | null; }

/** RPC 반환 */
export interface RunSummary { run_id: string; period_id: string; revision: number; status: RunStatus; input_hash: string; source_total: number; allocated_total: number; diff: number; blocks: RunIssue[]; warnings: RunIssue[]; block_count: number; warning_count: number; bills: number; amount_due_total: number; current_charge_total: number; calculated_by: string | null; approved_by: string | null; approved_at: string | null; reused?: boolean; }
export interface PaymentResult { payment_id: string; allocated: { receivable_id: string; period: string; amount: number }[]; credit_id: string | null; credit_amount: number; unallocated: number; }
export interface TodoSummary { period: string; period_id: string | null; status: PeriodStatus; due_date: string | null; units: number; meters_total: number; meters_read: number; expense_charge_types: number; expense_charge_types_filled: number; run: { id: string; status: RunStatus; revision: number; blocks: number; warnings: number; calculated_by: string | null } | null; pending_corrections: number; bills: number; delivered: number; unpaid_count: number; unpaid_total: number | null; unallocated_payments: number; tax_ready: number; tax_blocked: number; late_terms_unapproved: number; tax_unapproved_charge_types: number; }
export interface CategoryReport { period: string; prev_period: string; categories: { std_category: StdCategory; supply: number; vat: number; exempt: number; amount: number; prev_amount: number; diff: number }[]; total: number; prev_total: number; }
/** 0032: not_due = 납기 미도래, d0_30 … d90p 는 납기 경과일(1~30·31~60·61~90·90+), total = not_due + overdue_total */
export interface AgingReport { asof: string; buckets: { not_due: number; d0_30: number; d31_60: number; d61_90: number; d90p: number; overdue_total: number; total: number }; units: { unit_id: string; unit_no: string; party_id: string | null; balance: number; overdue_balance: number; not_due_balance: number; max_age: number; count: number }[]; }
export interface PaymentAllocationRow { id: string; business_id: string; payment_id: string; receivable_id: string; amount: number | null; reversed: boolean; created_at: string; }
/** 입금 + 배정 현황(0032 withPaymentAllocation). 미배정 = 입금액 − 유효 배정 − 선납 크레딧. 금액 없으면(revenue.read 없음) 0. */
export interface PaymentLine extends PaymentRow { allocated: number; credit: number; unallocated: number }
export interface DunningRow { id: string; business_id: string; receivable_id: string; stage: 1 | 2 | 3; channel: "print" | "sms" | "email" | "call" | "visit" | "alimtalk"; note: string | null; promise_date: string | null; created_by: string | null; created_at: string; }
export interface DunningLast { receivable_id: string; stage: 1 | 2 | 3; channel: DunningRow["channel"]; created_at: string; promise_date: string | null; count: number }
export type WorkOrderStatus = "open" | "in_progress" | "done" | "cancelled";
/** cost 는 revenue.read 없으면 null(뷰). 쓰기도 revenue.read(0032 트리거). */
export interface WorkOrderRow { id: string; business_id: string; building_id: string; unit_id: string | null; title: string; status: WorkOrderStatus; assignee: string | null; cost: number | null; expense_id: string | null; done_at: string | null; memo: string | null; created_by: string | null; created_at: string; }
export interface UnitsBulkResult { dry_run: boolean; valid: number; errors: { row: number; code: string; message: string }[]; created: number; }
export interface ImportStageResult { batch_id: string; rows: number; errors: number; warnings: number; unmatched: number; }
/** 정정 입력 줄(차액). 음수 허용. */
export interface CorrectionLine { charge_type_id?: string; std_category: StdCategory; name: string; supply: number; vat: number; exempt: number; }
/** 호실 일괄 등록 입력 행 */
export interface UnitBulkInput { dong?: string; floor?: string; unit_no: string; use_kind?: UnitUseKind; area_exclusive?: number; area_common?: number; share?: number; weight?: number; valid_from?: string; }
