/**
 * 렌탈 돈 흐름 "읽기"를 클라이언트 컴포넌트가 부를 수 있게 감싼 서버 액션(UI 담당 소유).
 * rental-money.ts 의 읽기 함수는 next/headers 를 쓰는 서버 전용이라 클라이언트에서 직접 import 할 수 없다.
 * 권한은 RPC 가 첫 줄에서 다시 검사한다(is_member / revenue.read 마스킹) — 여기서는 회원 여부(view)만 앞단에서 거른다.
 */
"use server";

import { withCap, type ActionResult } from "./rental-action-kit";
import { getCancelQuote, getCustomerMoneySummary } from "./rental-money";
import type { CancelCause, CancelQuote, CustomerMoneySummary } from "./rental-money-types";

/**
 * 취소 견적(계산만, 서버 now() 기준 — 브라우저 시각은 받지 않는다, H2).
 * 실행(cancelWithPenaltyAction)에 quote.rate 를 expectedRate 로 넘기고, quote_stale 문구가 오면 이 액션으로 다시 견적을 받는다.
 */
export async function getCancelQuoteAction(
  businessId: string, reservationId: string, cause: CancelCause, opts?: { overrideAmount?: number | null; limitToPaid?: boolean }
): Promise<ActionResult<CancelQuote>> {
  return withCap(businessId, "view", async () => {
    const r = await getCancelQuote(reservationId, cause, opts);
    return r.ok ? { ok: true, data: r.data } : { ok: false, message: r.message, hint: r.hint };
  });
}

/** 고객별 미수·보관 보증금 요약(예약 폼에서 고객 선택 시). revenue.read 없으면 has_* 여부만 온다. */
export async function getCustomerMoneySummaryAction(businessId: string, customerId: string): Promise<ActionResult<CustomerMoneySummary>> {
  return withCap(businessId, "view", async () => {
    const r = await getCustomerMoneySummary(customerId);
    return r.ok ? { ok: true, data: r.data } : { ok: false, message: r.message, hint: r.hint };
  });
}
