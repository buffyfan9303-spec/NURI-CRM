/**
 * 건물관리(building) 서버 오류·경고 문장표. 서버(RPC)가 보내는 힌트 코드 → 화면에 나가는 쉬운 한국어.
 * 영어 코드·SQL·테이블명은 화면에 나가지 않는다(모르는 코드는 일반 문장). 근거 용어표: docs/design-references/2026-09-30-cam-plain-words.md.
 * "use server" 파일(building-actions.ts)은 async 함수만 export 할 수 있어 표를 여기 둔다. building 전용이라 다른 업종 문장은 바뀌지 않는다.
 */

/** RPC·제약 힌트 → 사용자 문장. */
export const BUILDING_ERROR_TEXT: Record<string, string> = {
  forbidden: "이 작업을 할 권한이 없습니다. 사업장 관리자에게 권한을 요청하세요.",
  feature_off: "이 기능이 꺼져 있습니다. 설정의 '선택 기능'에서 켠 뒤 다시 해 보세요.",
  external_contract_required: "이 기능은 외부 업체(가상계좌·알림톡·은행 등)와 계약한 뒤에 쓸 수 있습니다.",
  unknown_feature: "설정할 수 없는 기능입니다.",
  not_configurable: "이 기능은 여기서 켜고 끌 수 없습니다.",
  period_locked: "이미 금액을 확정한 달이라 다시 계산하거나 고칠 수 없습니다. 금액이 틀렸다면 '금액 정정'을 쓰세요.",
  blocked: "수정할 사항이 남아 있어 확정할 수 없습니다. 위의 '수정할 사항'을 먼저 수정하세요.",
  approver_must_differ: "금액을 계산하거나 넣은 사람은 확정할 수 없습니다. 다른 담당자가 확정해야 합니다.",
  reason_required: "이유를 적어 주세요.",
  inputs_changed: "계산한 뒤에 호실·계약·항목·비용·검침값·입금 기록이 바뀌었습니다. 다시 계산한 뒤 확정하세요.",
  invalid_transition: "지금 상태에서는 할 수 없는 처리입니다.",
  not_approved: "확정된 계산이 아닙니다.",
  bill_frozen: "확정한 청구 금액은 덮어쓸 수 없습니다. '금액 정정'을 쓰세요.",
  zero_denominator: "나누는 기준(면적·지분·사용량)의 합이 0이라 호실에 나눌 수 없습니다.",
  allocation_mismatch: "비용 합계와 호실별 배분 합계가 다릅니다. 항목 설정을 확인하세요.",
  late_terms_unapproved: "연체료 조건이 아직 확정되지 않아 연체료를 계산할 수 없습니다.",
  late_terms_incomplete: "연체료 조건(이율·단위·시작일·방식·최대)을 모두 입력해야 확정할 수 있습니다.",
  late_approval_via_rpc: "연체료 조건 확정은 '확정' 버튼으로만 할 수 있습니다.",
  tax_approval_via_rpc: "부가세 확인은 항목 화면의 '확인' 버튼으로만 할 수 있습니다.",
  supplier_required: "부가세가 붙는 항목은 세금계산서를 보내는 곳(공급자)을 정해야 확인할 수 있습니다.",
  duplicate_payment: "같은 거래 번호로 이미 등록한 입금이 있습니다.",
  duplicate_import: "이 파일은 이미 가져왔습니다.",
  has_errors: "수정할 줄이 남아 있습니다. 수정하거나 뺀 뒤 다시 확정하세요.",
  payment_reversed: "취소된 입금은 관리비에 넣을 수 없습니다.",
  already_reversed: "이미 취소된 입금입니다.",
  credit_used: "이 입금으로 생긴 '선납금'을 이미 써서 취소할 수 없습니다. '금액 정정'으로 처리하세요.",
  over_allocation: "이 입금에서 아직 충당하지 않은 잔액보다 많이 충당했습니다.",
  overpayment: "그 관리비의 미납액보다 많이 충당했습니다. 남는 금액은 '선납금'으로 두세요.",
  receivable_closed: "이미 완납했거나 취소된 관리비입니다.",
  payment_allocated: "이미 관리비에 충당한 입금이라 그대로는 취소할 수 없습니다. 충당한 것을 먼저 되돌리세요.",
  approval_no_required: "국세청 승인번호를 적어 주세요.",
  invalid_amount: "금액은 0보다 큰 정수(원)로 적어 주세요.",
  invalid_period: "관리비 달은 2026-09 처럼 연도-월로 적어 주세요.",
  unit_not_in_building: "이 건물의 호실이 아닙니다.",
  party_not_in_business: "다른 사업장의 사람·업체는 연결할 수 없습니다.",
  building_not_in_business: "이 사업장의 건물이 아닙니다.",
  invalid_biz_reg_no: "사업자등록번호가 올바르지 않습니다(숫자 10자리, 번호가 맞아야 합니다).",
  meter_kind_required: "계량기 종류(전기·수도 등)를 골라 주세요.",
  charge_type_required: "비용을 넣을 관리비 항목을 골라 주세요.",
  period_required: "관리비 달을 골라 주세요.",
  cross_business: "다른 사업장의 건물·호실·사람·항목은 연결할 수 없습니다.",
  cross_building: "다른 건물의 호실·항목·관리비 달은 연결할 수 없습니다.",
  status_via_rpc: "관리비 달의 상태는 계산·확정 버튼으로만 바뀝니다.",
  run_frozen: "확정한 계산은 되돌릴 수 없습니다. '금액 정정'으로 처리하세요.",
  already_approved: "이 달은 이미 확정한 계산이 있습니다. 고칠 것이 있으면 '금액 정정'을 쓰세요.",
  older_receivable_open: "같은 분의 더 오래된 미납 관리비가 남아 있습니다. 오래된 것부터 충당하거나, 이유를 적고 건너뛰세요.",
  invalid_vat: "부가세가 '공급가액'의 10%와 맞지 않거나, 부가세 없는 항목에 부가세가 있습니다.",
  charge_type_not_in_building: "이 건물의 관리비 항목이 아닙니다.",
  amount_not_positive: "금액은 0보다 커야 합니다(감면은 '직접 입력' 항목으로 넣으세요).",
  payment_not_found: "입금을 찾을 수 없습니다.",
  skip_reason_required: "오래된 관리비를 건너뛰고 충당하려면 이유를 적어야 합니다.",
  cost_requires_revenue_read: "처리에 든 비용은 금액을 볼 수 있는 권한이 있어야 적을 수 있습니다.",
  // 아래는 화면 흐름상 드물게 나오는 서버 힌트(예전에는 일반 오류 문장으로 나갔다)
  target_not_found: "세금계산서 대상을 찾을 수 없습니다. 화면을 새로 정정한 뒤 다시 해 보세요.",
  receivable_not_found: "미수금(관리비)을 찾을 수 없습니다.",
  run_not_found: "계산 결과를 찾을 수 없습니다. 다시 계산해 보세요.",
  bill_not_found: "청구서를 찾을 수 없습니다.",
  batch_not_found: "가져오기 기록을 찾을 수 없습니다.",
  period_not_found: "이 관리비 달의 기록이 없습니다. 먼저 이 달을 열어 주세요.",
  charge_type_not_found: "관리비 항목을 찾을 수 없습니다.",
  contract_not_found: "계약을 찾을 수 없습니다.",
  building_not_found: "건물을 찾을 수 없습니다.",
  business_not_found: "사업장을 찾을 수 없습니다.",
  invalid_lines: "고칠 금액을 한 줄 이상 적어 주세요. 줄마다 이름과 금액이 있어야 합니다.",
  invalid_rows: "올린 줄의 형식이 맞지 않습니다. 파일을 확인해 주세요.",
  invalid_source: "가져올 수 없는 파일 종류입니다.",
  invalid_method: "납부 방법이 올바르지 않습니다.",
  invalid_value: "입력한 값이 올바르지 않습니다.",
  file_hash_required: "파일을 다시 올려 주세요.",
  already_cancelled: "이미 취소한 가져오기입니다.",
  // 화면(액션)이 직접 만드는 힌트
  invalid_paid_at: "입금한 날짜와 시각 형식이 맞지 않습니다(예: 2026-09-30 14:30).",
  bulk_size: "한 번에 1~50건까지 넣을 수 있습니다.",
  not_direct_type: "'직접 입력' 방식으로 만든 관리비 항목에만 넣을 수 있습니다.",
  bill_not_approved: "금액을 확정한 청구서에만 문의·이의를 남길 수 있습니다.",
  note_required: "내용을 1~1000자로 적어 주세요.",
  resolution_required: "처리한 내용을 1~1000자로 적어 주세요.",
  dispute_closed: "이미 처리한 입주자 문의는 답변을 바꿀 수 없습니다. 새 기록으로 남겨 주세요.",
};

/** 코드 없이 오는 DB 제약 오류(SQLSTATE) → [문장, 힌트]. */
const SQLSTATE_TEXT: Record<string, [string, string]> = {
  "23P01": ["기간이 겹칩니다(같은 호실의 사용 중인 번호·계약 기간은 겹칠 수 없습니다).", "overlap"],
  "23505": ["이미 같은 항목이 있습니다.", "duplicate"],
  "23514": ["입력한 값이 규칙에 맞지 않습니다(검침값이 지난달보다 작으면 이유를 적어야 하고, 사업자등록번호는 번호가 맞아야 합니다).", "check_violation"],
};

export const BUILDING_ERROR_FALLBACK = "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요.";

/** 서버 오류 → { message, hint }. 원문(영문 코드·SQL)은 화면 문장에 넣지 않는다. */
export function plainBuildingError(e: { code?: string; message: string; hint?: string | null }): { message: string; hint?: string } {
  const msg = e.message ?? "";
  const hint = e.hint ?? /^([a-z_]+):/.exec(msg)?.[1] ?? undefined;
  if (hint && BUILDING_ERROR_TEXT[hint]) return { message: BUILDING_ERROR_TEXT[hint], hint };
  if (e.code === "42501") return { message: BUILDING_ERROR_TEXT.forbidden, hint: "forbidden" };
  const st = e.code ? SQLSTATE_TEXT[e.code] : undefined;
  if (st) return { message: st[0], hint: st[1] };
  if (e.code === "P0002" || /not_found/.test(msg)) return { message: "대상을 찾을 수 없습니다.", hint: "not_found" };
  return { message: BUILDING_ERROR_FALLBACK };
}

/**
 * 계산 결과의 차단·경고 코드 → 쉬운 문장(호실·항목 이름은 화면이 앞에 붙인다).
 * 여기 없는 코드는 서버 문장을 그대로 쓴다(이미 쉬운 말: 정액 금액이 없습니다 등).
 */
export const BUILDING_ISSUE_TEXT: Record<string, string> = {
  no_units: "이 달에 쓸 수 있는 호실이 없습니다.",
  no_charge_types: "이 달에 쓸 수 있는 관리비 항목이 없습니다(항목의 시작일을 확인하세요).",
  vacant_no_payer: "빈 호실을 대신 납부하는 분이 정해져 있지 않습니다(건물 설정에서 정하세요).",
  association_payer: "관리단이 부담하는 항목이라 호실에는 나누지 않습니다.",
  missing_reading: "검침값이 없습니다.",
  no_meter: "계량기가 없어 0으로 계산합니다.",
  no_expense: "이번 달 비용이 입력되지 않았습니다.",
  zero_denominator: "나누는 기준(면적·지분·사용량)의 합이 0입니다.",
  late_terms_unapproved: "연체료 조건이 확정되지 않아 연체료를 0원으로 둡니다(확인 대기).",
  zero_bill: "이번 달 관리비가 0원입니다.",
  vacant: "빈 호실입니다(대신 납부하는 분에게 청구).",
  partial_month_contract: "달 중간에 계약이 시작·끝나거나 바뀌는 호실입니다. 일할 계산은 아직 없으니 계약 기간을 월 초·월 말로 맞추거나 다음 달에 정산하세요.",
  partial_month_unit: "달 중간에 시작한 호실이라 한 달 전체 금액이 나뉩니다(일할 계산은 아직 없습니다).",
  expense_excluded: "기간이 지났거나 사용하지 않는 항목, 관리단·소유자가 부담하는 항목의 비용은 계산에 들어가지 않습니다.",
  direct_excluded: "대상이 아닌 호실·항목에 직접 넣은 금액은 계산에 들어가지 않습니다.",
  owner_payer_excluded: "소유자가 부담하는 항목은 입주자 청구서에 넣지 않습니다(소유자 청구는 아직 없습니다).",
  other_party_unpaid: "이 호실에 예전 입주자 등 다른 분의 미납액이 남아 있습니다. 그분께 따로 독촉하세요.",
};

/** 차단·경고 한 줄의 본문. 코드가 표에 없으면 서버 문장. */
export const plainIssueMessage = (code: string, serverMessage: string): string => BUILDING_ISSUE_TEXT[code] ?? serverMessage;
