/**
 * 잔액 뷰(v_reservation_balance) 표시용 헬퍼. `discount` 는 뷰에서 **음수**(할인 = 청구를 줄이는 방향)로 온다 —
 * 화면은 항상 절댓값으로 다루고, 청구 합계에서는 빼는 쪽으로 쓴다(재검토 N2). 서버 값을 바꾸지 않는다.
 */
export const discountAbs = (v: number | null | undefined): number => Math.abs(Number(v ?? 0));

/** 청구 합계 = 대여료 + 연체료 + 손상비 + 위약금 − |할인| − 배상. */
export function chargedTotal(b: { rentalRevenue: number; lateFee: number; damageCharge: number; cancelPenalty: number; discount: number; compensation: number }): number {
  return b.rentalRevenue + b.lateFee + b.damageCharge + b.cancelPenalty - discountAbs(b.discount) - b.compensation;
}
