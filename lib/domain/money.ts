/**
 * 렌탈 금액 유틸 — 계약(docs/crm-contract.md §3) 준수.
 *
 * - KRW는 항상 정수(원 단위). 부동소수 연산 금지 — 문자열/숫자 입력은 즉시 정수로 절단한다.
 * - 절대 DOM 텍스트에서 금액을 다시 읽지 않는다. 화면은 서버(RPC/뷰)가 돌려준 숫자만 표시한다.
 *   여기 함수들은 "서버에 보내기 전 견적 표시"용 순수 계산기일 뿐, 진실의 원천이 아니다.
 * - 대여 매출과 보증금은 타입 자체로 분리한다. 두 값을 더해 "총액" 하나로 만드는
 *   함수는 의도적으로 만들지 않는다 — 기준본이 그렇게 했다가 계약을 어겼다(문서 D-4).
 */

/** 원 단위 정수. 타입은 number 그대로지만 이 별칭으로 "정수 원"이라는 의도를 표시한다. */
export type KRW = number;

/** 렌탈료 계정(청구액 계산용). 보증금은 여기 없다 — DepositState로 완전히 분리. */
export interface RentalCharges {
  rentalFee: number;
  discount: number;
  lateFee: number;
  damage: number;
}

/** 보증금은 부채다. 매출(RentalCharges)과 같은 total로 섞지 않는다. */
export interface DepositState {
  held: number;
  refundable: number;
}

/** 정수로 절단(소수 제거). 음수는 그대로 둔다 — 호출부가 맥락에 맞게 검증한다. */
export function toKRW(n: number): KRW {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** 0 이상의 정수인지 검사. 서버가 최종 검증하지만 화면에서도 헛된 제출을 막는다. */
export function isValidKRW(n: unknown): n is KRW {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/**
 * "150,000원" 형태로 표시.
 * ponytail: toLocaleString("ko-KR")은 실행 Node의 ICU 빌드에 따라 그룹 구분자 등이
 * 달라질 수 있어(SSR/CSR ICU 불일치 시 hydration 오류 유발) 안 쓴다. 정수 3자리
 * 콤마 삽입은 로케일이 필요 없는 순수 문자열 연산이라 이 정규식이 가장 단순하고
 * 서버·클라이언트 항상 동일하다.
 */
export function formatKRW(n: number | null | undefined): string {
  // 0025 이후 권한 없는 세션은 금액 열이 null 로 온다 — "0원"으로 오해되지 않게 대시로 보인다.
  if (n == null) return "—";
  const v = toKRW(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** "150,000" / "150000원" / "" 등 사용자 입력을 정수 원으로 파싱. 숫자가 없으면 0. */
export function parseKRW(s: string): KRW {
  const digits = s.replace(/[^0-9]/g, "");
  return digits ? Math.trunc(Number(digits)) : 0;
}

/**
 * 대여료 청구액(보증금 제외): 대여료 − 할인 + 연체료 + 손상비.
 * v_reservation_balance의 outstanding 산식(0004_ledger.sql)과 같은 항목 구성이다.
 */
export function billTotal(c: RentalCharges): KRW {
  return toKRW(c.rentalFee - c.discount + c.lateFee + c.damage);
}

/** 예약 항목(fee/discount)의 합 — 확정 전 견적 미리보기용. 서버 확정값을 대체하지 않는다. */
export function sumItemFees(
  items: { fee: number; discount: number }[]
): { rentalFee: KRW; discount: KRW } {
  return items.reduce(
    (acc, it) => ({
      rentalFee: acc.rentalFee + toKRW(it.fee),
      discount: acc.discount + toKRW(it.discount),
    }),
    { rentalFee: 0, discount: 0 }
  );
}

/**
 * 수납 화면에서 "지금 이 줄들을 보내면 현금 총액이 얼마가 되는가"를 미리 보여주는 용도.
 * record_payment RPC가 하는 부호 합산(0004_ledger.sql: in=+, out=-)과 동일한 규칙이며,
 * 실제 저장값은 항상 서버 응답(reservation_balance)을 신뢰한다 — 이 값은 미리보기일 뿐이다.
 */
export function previewCashDelta(
  lines: { amount: number; direction: "in" | "out" }[]
): KRW {
  return toKRW(
    lines.reduce((sum, l) => sum + (l.direction === "in" ? l.amount : -l.amount), 0)
  );
}
