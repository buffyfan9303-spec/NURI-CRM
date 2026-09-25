/**
 * 렌탈 도메인 타입 + 라벨 상수. 서버 전용 API(next/headers 등)를 전혀 쓰지 않는
 * 순수 모듈이다 — 클라이언트 컴포넌트가 상태 라벨/타입을 안전하게 import할 수 있도록
 * lib/domain/rental.ts(서버 전용, Supabase 호출)에서 일부러 분리했다.
 */

export type UnitStatus =
  | "available"
  | "reserved"
  | "out"
  | "returning"
  | "inspect"
  | "care"
  | "repair"
  | "lost"
  | "retired";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  available: "대여가능",
  reserved: "예약됨",
  out: "출고중",
  returning: "반납접수",
  inspect: "검수중",
  care: "세탁중",
  repair: "수선중",
  lost: "분실",
  retired: "폐기",
};

/** 이 상태의 개체는 새 예약에 배정할 수 없다. */
export const UNIT_BLOCKED: UnitStatus[] = ["inspect", "care", "repair", "lost", "retired"];

export type ReservationStatus =
  | "draft"
  | "confirmed"
  | "out"
  | "partial_return"
  | "returned"
  | "closed"
  | "cancelled";

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  draft: "임시저장",
  confirmed: "확정",
  out: "출고완료",
  partial_return: "부분반납",
  returned: "전체반납",
  closed: "종결",
  cancelled: "취소",
};

/** Badge kind — ReservationList.tsx와 고객 상세 예약 이력(CustomerDetail.tsx)이 공유한다. */
export const RESERVATION_STATUS_BADGE: Record<ReservationStatus, "success" | "warning" | "info" | "error"> = {
  draft: "info",
  confirmed: "success", // 확정은 완료 계열(청록) — 2026-09-25 사용자 지시
  out: "warning",
  partial_return: "warning",
  returned: "success",
  closed: "success",
  cancelled: "error",
};

/** 0027: written_off = 수납 없이 대손으로만 미수가 0 이 된 상태. */
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded" | "written_off";
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "미수납",
  partial: "부분수납",
  paid: "수납완료",
  refunded: "환불됨",
  written_off: "대손처리",
};

export type ItemStatus =
  | "reserved"
  | "assigned"
  | "out"
  | "returned"
  | "missing"
  | "damaged"
  | "cancelled";

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  reserved: "예약(개체 미배정)",
  assigned: "배정됨",
  out: "출고됨",
  returned: "반납됨",
  missing: "누락",
  damaged: "손상",
  cancelled: "취소",
};

export interface RentalProduct {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: string;
  baseFee: number;
  depositAmount: number;
  careBufferHours: number;
  active: boolean;
}

export interface RentalSku {
  id: string;
  productId: string;
  color: string;
  size: string;
  barcode: string | null;
}

export interface RentalUnit {
  id: string;
  businessId: string;
  skuId: string;
  unitCode: string;
  qrPayload: string | null;
  location: string | null;
  status: UnitStatus;
  photoUrl: string | null;
  acquiredOn: string | null;
  measurements: Record<string, unknown>;
  notes: string | null;
  /** cost.read 없으면 undefined — 서버 뷰가 애초에 내려주지 않는다. */
  purchaseCost?: number | null;
}

export interface RentalProductPart {
  id: string;
  productId: string;
  partName: string;
  required: boolean;
  sort: number;
}

export interface ProductWithChildren extends RentalProduct {
  skus: (RentalSku & { units: RentalUnit[] })[];
  parts: RentalProductPart[];
}

export interface ReservationItemRow {
  id: string;
  reservationId: string;
  productId: string;
  productName: string;
  productCode: string;
  skuId: string | null;
  skuColor: string | null;
  skuSize: string | null;
  unitId: string | null;
  unitCode: string | null;
  unitStatus: UnitStatus | null;
  qty: number;
  fee: number;
  discount: number;
  itemStatus: ItemStatus;
}

export interface ReservationRow {
  id: string;
  businessId: string;
  customerRef: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: ReservationStatus;
  periodStart: string;
  periodEnd: string;
  fittingAt: string | null;
  notes: string | null;
  createdAt: string;
  /** 0027: 확정 시각(트리거 스탬프). 구 DB·확정 전에는 null. */
  confirmedAt: string | null;
  /** 0027: 확정 시점 상품 보증금 합 스냅샷(원). 구 DB·확정 전에는 null. */
  depositRequired: number | null;
  items: ReservationItemRow[];
}

export interface ReservationBalance {
  cashReceived: number;
  rentalRevenue: number;
  depositBalance: number;
  lateFee: number;
  damageCharge: number;
  discount: number;
  outstanding: number;
  /** 0009_rental_hardening 이후 컬럼이 아니라 원장에서 도출한 값 — v_reservation_balance/reservation_balance만이 출처다. */
  paymentStatus: PaymentStatus;
  /** 0027 추가 열(구 DB 에서는 0). 몰수된 보증금 — 수익 항목이지만 rental_revenue 에 섞지 않는다. */
  depositForfeited: number;
  /** 0027: 대손 처리액(미수 감소, 매출 아님). */
  writtenOff: number;
  /** 0027: 취소 위약금 수익. */
  cancelPenalty: number;
  /** 0027: 사업자 귀책 취소 배상 지출. */
  compensation: number;
}

export interface CareJobRow {
  id: string;
  unitId: string;
  unitCode: string;
  productName: string;
  kind: "wash" | "repair" | "inspect";
  status: "open" | "doing" | "done" | "cancelled";
  openedAt: string;
  closedAt: string | null;
  cost: number;
  notes: string | null;
}

export interface CustomerRow {
  id: string;
  legacyNo: string | null;
  name: string;
  tags: string[];
  active: boolean;
  createdAt: string;
  hasPhone?: boolean;
  hasEmail?: boolean;
  phone?: string;
  email?: string | null;
  birth?: string | null;
  address?: string | null;
  memo?: string | null;
}

/**
 * 고객 신체 치수(customer_measurements, 0006_customers.sql) — pii.read 게이팅.
 * 개체 실측(rental_units.measurements)과 절대 같은 화면 섹션/헤딩으로 섞지 않는다.
 */
export interface CustomerMeasurementRow {
  id: string;
  customerId: string;
  measuredAt: string;
  measuredBy: string | null;
  values: Record<string, number | string>;
  note: string | null;
}

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string; hint?: string };

export interface ReservationFilters {
  status?: ReservationStatus[];
  from?: string; // ISO — period(대여기간)와 겹치는 예약
  to?: string; // ISO
  customer?: string;
  /** customers.id 정확 일치(고객 상세의 예약 이력용) — customer 텍스트 검색과는 다르다. */
  customerRef?: string;
  productId?: string;
  /** periodEnd(반납 예정)가 [returnFrom,returnTo) 안인 예약만. 홈 "오늘 반납" 지표와 짝. */
  returnFrom?: string;
  returnTo?: string;
  /** fittingAt이 [fittingFrom,fittingTo) 안인 예약만. 홈 "오늘 피팅" 지표와 짝. */
  fittingFrom?: string;
  fittingTo?: string;
}

export interface UnitPickerRow {
  unitId: string;
  unitCode: string;
  productName: string;
  color: string;
  size: string;
  status: UnitStatus;
}

/** 개체 교환 후보 — 같은 SKU 안에서만 고른다(0017_swap_unit.sql sku_mismatch 규칙과 일치). */
export interface SwapCandidateRow {
  unitId: string;
  unitCode: string;
  status: UnitStatus;
}

export interface RentalToday {
  fittingsToday: { id: string; customerName: string | null; fittingAt: string }[];
  checkoutsToday: ReservationRow[];
  returnsToday: ReservationRow[];
  overdue: ReservationRow[];
  careWaiting: CareJobRow[];
  lowStockSkus: { skuId: string; productName: string; color: string; size: string }[];
  /** DB EXCLUDE 제약이 겹치는 확정 예약 자체를 막으므로, "충돌"은 저장되지 않는다.
   *  대신 이미 기간이 시작됐는데 아직 draft(미확정)인 예약을 위험 신호로 보여준다. */
  staleDrafts: ReservationRow[];
}

// ── 손상·분실 청구 + 보증금 정산(0023) ────────────────────────────
export type ClaimKind = "damaged" | "missing" | "other";
export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = { damaged: "손상", missing: "분실", other: "기타" };

export interface DamageClaimRow {
  id: string;
  reservationId: string;
  itemId: string | null;
  kind: ClaimKind;
  description: string;
  reason: string | null;
  /** revenue.read 없으면 null(ledger 가 안 보여 청구 금액도 안 보인다). */
  amount: number | null;
  photoPaths: string[];
  createdAt: string;
}

export interface SettlementResult {
  masked: boolean;
  applied: number | null;
  refunded: number | null;
  remainingDeposit: number | null;
  additionalDue: number | null;
}

export interface ClaimInvoice {
  claimId: string;
  claimNo: string;
  issuedAt: string;
  business: { id: string; name: string };
  customer: { name: string | null; phone: string | null };
  reservation: { id: string; no: string; periodStart: string; periodEnd: string; status: string };
  item: { id: string | null; label: string | null; kind: ClaimKind; description: string; reason: string | null; photoPaths: string[] };
  /** true 면 아래 금액 전부 null(revenue.read 없음). */
  masked: boolean;
  amount: number | null;
  claimsTotal: number | null;
  depositApplied: number | null;
  depositBalance: number | null;
  outstanding: number | null;
}

export interface LedgerEntryRow {
  id: string;
  entryType: string;
  amount: number;
  direction: "in" | "out";
  method: string | null;
  reason: string | null;
  occurredAt: string;
  /** 0027: 수납 단계(contract/balance/collection/deposit/other). 구 행은 null. */
  stage?: string | null;
  approvalNo?: string | null;
  cashReceipt?: boolean | null;
  /** 0027: 이 행이 정정(상계)하는 원본 행 id. */
  reversesId?: string | null;
}
