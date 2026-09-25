/**
 * 렌탈 서버 액션 공용 조각 — rental-actions.ts / rental-money-actions.ts 가 같이 쓴다.
 * "use server" 파일은 async 함수만 export 할 수 있어(상수 export 시 런타임 500) 여기(일반 모듈)로 뺐다.
 * next/headers 를 간접 사용(requireCap → getServerSupabase)하므로 서버에서만 import 한다.
 */
import { revalidatePath } from "next/cache";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";

/** 실패에는 서버 hint(기계용 코드, 예: 'quote_stale')를 함께 준다 — 화면은 문구 문자열이 아니라 hint 로 분기한다. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string; hint?: string };

/** hint → 한국어 안내. 0017_swap_unit.sql 이후 서버가 안정적인 hint를 준다 — 이게 1순위 근거다. */
export const HINT_MESSAGE: Record<string, string> = {
  reservation_conflict: "해당 개체는 그 기간(정비 버퍼 포함)에 이미 예약되어 있습니다. 다른 개체를 배정하거나 기간을 조정하세요.",
  sku_sold_out: "해당 기간에 이 SKU의 가용 재고가 부족합니다. 수량을 줄이거나 다른 기간을 선택하세요.",
  unit_unavailable: "선택한 개체가 현재 대여 불가 상태입니다(검수/세탁/수선/분실/폐기). 다른 개체를 선택하세요.",
  sku_mismatch: "다른 SKU(색상·사이즈)의 개체로는 교환할 수 없습니다. 항목 자체를 바꾸려면 예약을 다시 만드세요.",
  same_unit: "이미 배정된 개체와 같습니다. 다른 개체를 선택하세요.",
  not_assigned: "이 항목은 아직 개체가 배정되지 않았습니다. 교환이 아니라 배정이 필요합니다.",
  reason_required: "사유를 입력해야 합니다.",
  invalid_transition: "이 예약 상태에서는 그 작업을 할 수 없습니다.",
  invalid_period: "반납 일시는 대여 일시보다 뒤여야 합니다.",
  forbidden: "이 작업을 수행할 권한이 없습니다.",
  owner_only: "이 작업은 사업장 owner 만 할 수 있습니다.",
  item_not_found: "예약 항목을 찾을 수 없습니다.",
  unit_not_found: "교환 대상 개체를 찾을 수 없습니다.",
  reservation_not_found: "예약을 찾을 수 없습니다.",
  customer_not_found: "이 사업장의 고객이 아닙니다.",
  entry_not_found: "원장 항목을 찾을 수 없습니다.",
  idempotency_key_required: "재시도 안전을 위한 요청 키가 없습니다. 새로고침 후 다시 시도하세요.",
  refund_exceeds_deposit: "금액이 남은 보증금 잔액을 초과합니다.",
  exceeds_outstanding: "금액이 현재 미수금을 초과합니다. 청구가 없다면 먼저 대여료를 청구하세요.",
  discount_exceeds_charges: "누적 할인이 누적 청구를 초과합니다.",
  invalid_amount: "금액은 0보다 큰 정수여야 합니다.",
  invalid_kind: "처리 종류가 올바르지 않습니다.",
  invalid_stage: "수납 단계가 올바르지 않습니다(계약금/잔금/미수회수/기타).",
  invalid_cause: "취소 귀책(소비자/사업자)이 올바르지 않습니다.",
  invalid_channel: "독촉 수단이 올바르지 않습니다(문자/전화/카카오/방문/기타).",
  invalid_tiers: "취소 단계표 형식이 올바르지 않습니다(min_days 0 이상 정수, rate 0~100, 당일(0) 단계 필수).",
  invalid_value: "입력값이 허용 범위를 벗어났습니다.",
  name_required: "이름을 입력하세요.",
  job_not_found: "정비 작업을 찾을 수 없습니다.",
  description_required: "청구 항목(내용)을 입력하세요.",
  invalid_photo_path: "이 사업장의 파일 경로가 아닙니다.",
  invalid_method: "지급 방법이 올바르지 않습니다.",
  invalid_claims: "청구 목록 형식이 올바르지 않습니다.",
  claim_not_found: "청구를 찾을 수 없습니다.",
  refund_required: "수납·보증금이 있는 예약입니다. 환급을 함께 확정해야 취소할 수 있습니다.",
  idempotency_key_conflict: "이 요청 키는 다른 처리에 이미 사용됐습니다. 화면을 새로고침한 뒤 다시 시도하세요.",
  amount_too_large: "금액은 1억 원을 넘을 수 없습니다.",
  not_returned: "반납 완료 전에는 보증금을 정산·환불할 수 없습니다. 반납·검수를 먼저 처리하세요(취소 환급은 예약 취소로).",
  already_out: "출고가 시작된 예약은 취소할 수 없습니다. 반납·정산으로 처리하세요.",
  already_reversed: "이미 정정된 원장 항목입니다.",
  quote_required: "먼저 취소 견적을 확인한 뒤 실행하세요.",
  quote_stale: "견적 이후 취소 단계가 바뀌었습니다. 견적을 다시 확인하세요.",
  fee_already_billed: "누적 대여료 청구가 예약 항목의 대여료 합을 넘습니다. 항목 대여료를 먼저 수정하세요.",
  cancel_invariant: "취소 원장 계산이 맞지 않아 처리하지 않았습니다. 관리자에게 문의하세요.",
  cannot_reverse_reversal: "정정 항목은 다시 정정할 수 없습니다. 원본을 다시 기록하세요.",
  entry_type_not_allowed: "이 계정은 전용 처리(대손·취소)로만 기록할 수 있습니다.",
  payment_in_is_derived: "현금 수납 총액은 서버가 계산합니다.",
  unknown_entry_type: "알 수 없는 원장 계정입니다.",
};

export function pgError(e: { code?: string; message: string; hint?: string | null }): string {
  const msg = e.message ?? "";
  // 1순위: hint(0017_swap_unit.sql 이후 서버가 붙여주는 안정적인 기계용 코드).
  if (e.hint && HINT_MESSAGE[e.hint]) return HINT_MESSAGE[e.hint];

  // 2순위: 메시지 패턴 폴백 — hint가 없는(0016 이하) DB에도 그대로 동작해야 한다.
  if (/reservation_conflict/.test(msg)) return HINT_MESSAGE.reservation_conflict;
  if (/sku_sold_out/.test(msg)) return HINT_MESSAGE.sku_sold_out;
  if (/unit_unavailable/.test(msg)) return HINT_MESSAGE.unit_unavailable;
  if (/invalid_unit_transition/.test(msg)) return "개체 상태를 그렇게 바꿀 수 없습니다(허용된 흐름을 벗어났습니다). 세탁·수선이나 예약 화면에서 순서대로 처리하세요.";
  if (/sku_mismatch/.test(msg)) return HINT_MESSAGE.sku_mismatch;
  if (/same_unit/.test(msg)) return HINT_MESSAGE.same_unit;
  if (/not_assigned/.test(msg)) return HINT_MESSAGE.not_assigned;
  if (/reason_required/.test(msg)) return HINT_MESSAGE.reason_required;
  if (/invalid_transition/.test(msg)) return HINT_MESSAGE.invalid_transition;
  if (/invalid_period/.test(msg)) return HINT_MESSAGE.invalid_period;
  if (/idempotency_key_required/.test(msg)) return HINT_MESSAGE.idempotency_key_required;
  if (/refund_exceeds_deposit/.test(msg)) return HINT_MESSAGE.refund_exceeds_deposit;
  if (/invalid_amount/.test(msg)) return HINT_MESSAGE.invalid_amount;
  if (e.code === "42501") return HINT_MESSAGE.forbidden;
  if (/item_not_found/.test(msg)) return HINT_MESSAGE.item_not_found;
  if (/unit_not_found/.test(msg)) return HINT_MESSAGE.unit_not_found;
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  if (e.code === "23P01") return "동일 자원에 대한 동시 처리 충돌이 발생했습니다. 잠시 후 다시 시도하세요.";
  if (/range lower bound must be less than or equal to range upper bound/.test(msg)) return "종료 시각이 시작 시각보다 빠릅니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[rental pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요.";
}

/** PostgREST 오류 → {ok:false, message, hint}. hint 는 서버가 붙인 기계용 코드(없으면 undefined). */
export function failFrom(e: { code?: string; message: string; hint?: string | null }): { ok: false; message: string; hint?: string } {
  return { ok: false, message: pgError(e), hint: e.hint ?? undefined };
}

/** cap 배열이면 전부 필요(예: 연체료 확정 = write + revenue.read — RPC 요구와 동일). */
export async function withCap<T>(
  businessId: string,
  cap: Cap | Cap[],
  fn: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  try {
    for (const c of Array.isArray(cap) ? cap : [cap]) await requireCap(businessId, c);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  return fn();
}

/** 홈(오늘 현황)과 캘린더도 예약·정비 변화를 보여주므로 같이 무효화한다(CLICK-PATH-217). */
export function revalRental(businessId: string) {
  for (const seg of ["", "reservations", "calendar", "catalog", "care", "settlement", "customers"]) {
    revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
  }
}
