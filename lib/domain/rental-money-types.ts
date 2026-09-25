/**
 * 렌탈 돈 흐름(0027_rental_money.sql) 타입 + 라벨. 순수 모듈 — 클라이언트 컴포넌트가 import 해도 된다.
 * 서버 호출은 rental-money.ts(읽기) / rental-money-actions.ts(쓰기).
 */

export type PayMethod = "cash" | "card" | "transfer" | "other";
export const PAY_METHOD_LABEL: Record<PayMethod, string> = { cash: "현금", card: "카드", transfer: "계좌이체", other: "기타" };

export type PayStage = "contract" | "balance" | "collection" | "deposit" | "other";
export const PAY_STAGE_LABEL: Record<PayStage, string> = { contract: "계약금", balance: "잔금", collection: "미수 회수", deposit: "보증금", other: "기타" };

export type CollectionChannel = "sms" | "call" | "kakao" | "visit" | "other";
export const COLLECTION_CHANNEL_LABEL: Record<CollectionChannel, string> = { sms: "문자", call: "전화", kakao: "카카오", visit: "방문", other: "기타" };

export type CancelCause = "customer" | "business";
export const CANCEL_CAUSE_LABEL: Record<CancelCause, string> = { customer: "소비자 귀책", business: "사업자 귀책" };

export type AgingBucket = "not_due" | "d1_7" | "d8_30" | "d31_60" | "d61_90" | "d90p";
export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  not_due: "미도래", d1_7: "1~7일", d8_30: "8~30일", d31_60: "31~60일", d61_90: "61~90일", d90p: "90일 초과",
};
export const AGING_BUCKET_ORDER: AgingBucket[] = ["not_due", "d1_7", "d8_30", "d31_60", "d61_90", "d90p"];

/** 원장 계정 라벨(0004 + 0027). SettlementPanel 의 ENTRY_LABEL 을 대체할 단일 출처. */
export const LEDGER_ENTRY_LABEL: Record<string, string> = {
  rental_revenue: "대여료",
  discount: "할인",
  deposit_in: "보증금 수납",
  deposit_out: "보증금 반환·차감",
  deposit_forfeit: "보증금 몰수",
  late_fee: "연체료",
  damage_charge: "손상비",
  payment_in: "현금 수납",
  refund: "환급",
  write_off: "대손",
  cancel_penalty: "취소 위약금",
  compensation: "취소 배상",
};

/** 계약 v2: {min_days} 또는 {min_months} 둘 중 하나(1개월 = 달력 기준 interval '1 month'). 배열에 min_days 0(당일) 필수. */
export interface CancelTier { min_days?: number; min_months?: number; rate: number }

export interface CancelPolicy {
  customerTiers: CancelTier[];
  businessTiers: CancelTier[];
  contractGraceHours: number;
  isDefault: boolean;
  source: string;
}

/** revenue.read 없으면 masked=true 이고 금액 필드는 전부 null(단계·일수만). asOf 는 서버 now()(호출자 시각을 받지 않는다, H2). */
export interface CancelQuote {
  masked: boolean;
  cause: CancelCause;
  asOf: string;
  useDate: string;
  daysBefore: number;
  withinContractGrace: boolean;
  contractGraceHours: number;
  contractedAt: string;
  tier: { min_days: number | null; min_months?: number | null; rate: number; label?: string };
  rate: number;
  policyIsDefault: boolean;
  baseFee: number | null;
  computedAmount: number | null;
  overrideAmount: number | null;
  effectiveAmount: number | null;
  limitToPaid: boolean;
  cashReceived: number | null;
  depositBalance: number | null;
  /** 누적 몰수액 — 환급·한도 계산에서 이미 빠져 있다(H1). */
  depositForfeited: number | null;
  paidFee: number | null;
  chargesToVoid: number | null;
  penalty: number | null;
  compensation: number | null;
  refundCash: number | null;
  depositReturned: number | null;
  receivableLeft: number | null;
  totalPayout: number | null;
}

export interface ReceivableRow {
  reservationId: string;
  customerRef: string | null;
  customerName: string | null;
  /** pii.read 없으면 null */
  customerPhone: string | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  outstanding: number;
  dueDate: string;
  daysOverdue: number;
  bucket: AgingBucket;
  lastContactAt: string | null;
  lastContactChannel: CollectionChannel | null;
  promisedPayDate: string | null;
}

export interface ReceivablesReport {
  asOf: string;
  total: number;
  count: number;
  byBucket: Partial<Record<AgingBucket, { count: number; total: number }>>;
  rows: ReceivableRow[];
}

export interface DepositHeldRow {
  reservationId: string;
  customerRef: string | null;
  customerName: string | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  depositBalance: number;
  depositRequired: number | null;
  outstanding: number;
}

export interface DepositsHeld { count: number; total: number; rows: DepositHeldRow[] }

export interface CollectionLogRow {
  id: string;
  reservationId: string;
  contactedAt: string;
  channel: CollectionChannel;
  note: string | null;
  promisedPayDate: string | null;
  createdBy: string | null;
}

/** revenue.read 없으면 masked=true, 금액은 null 이고 has_* 여부만 온다(예약 생성 화면의 경고용). */
export interface CustomerMoneySummary {
  customerId: string;
  masked: boolean;
  hasOutstanding: boolean;
  hasDeposit: boolean;
  openReservations: number;
  reservationsWithOutstanding: number;
  outstandingTotal: number | null;
  depositHeldTotal: number | null;
}

export interface FeePolicy {
  id: string;
  name: string;
  graceHours: number;
  lateFeePerDay: number;
  lateFeeRate: number | null;
  damageDefault: number;
  effectiveFrom: string;
}

export interface CloseResult {
  closed: boolean;
  status: string;
  /** code: invalid_status | items_open | outstanding_remaining | deposit_remaining. amount 는 revenue.read 없으면 null */
  reasons: { code: string; status?: string; count?: number; amount?: number | null }[];
}
export const CLOSE_REASON_LABEL: Record<string, string> = {
  invalid_status: "반납 완료 상태가 아닙니다",
  items_open: "아직 반납·처리되지 않은 항목이 있습니다",
  outstanding_remaining: "미수금이 남아 있습니다",
  deposit_remaining: "보증금 잔액이 남아 있습니다",
};

export interface StatementEntry {
  id: string;
  entryType: string;
  amount: number;
  direction: "in" | "out";
  method: string | null;
  stage: string | null;
  approvalNo: string | null;
  cashReceipt: boolean | null;
  reason: string | null;
  occurredAt: string;
  reversesId: string | null;
  reversedBy: string | null;
}

export interface Statement {
  reservation: { id: string; no: string; status: string; periodStart: string; periodEnd: string; fittingAt: string | null; confirmedAt: string | null; depositRequired: number | null; createdAt: string; notes: string | null };
  business: { id: string; name: string };
  customer: { id: string | null; name: string | null; phone: string | null };
  items: { itemId: string; productName: string; productCode: string; color: string | null; size: string | null; unitCode: string | null; qty: number; fee: number; discount: number; depositAmount: number; itemStatus: string }[];
  balance: Record<string, number | string>;
  entries: StatementEntry[];
  claims: { claimId: string; kind: string; description: string; amount: number; createdAt: string }[];
  collectionLogs: Omit<CollectionLogRow, "reservationId" | "createdBy">[];
  cancelPolicy: CancelPolicy;
  /** confirmed 상태일 때만(지금 소비자 귀책으로 취소하면). */
  cancelQuoteNow: CancelQuote | null;
  issuedAt: string;
}
