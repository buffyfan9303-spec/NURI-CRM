"use client";

/**
 * 예약 돈 영역(0027 계약 docs/rental-money-contract.md).
 * 청구 합계·받은 돈·잔금(미수)·보증금(필요/받은/보관)을 한눈에 보여주고, 수납(계약금/잔금/미수회수)·보증금 수령·
 * 연체료·보증금 반환/몰수·대손·정정·종결을 처리한다.
 * 계약 §3: 대여매출과 보증금을 절대 한 금액으로 합치지 않는다. 금액 판정·권한은 전부 서버(RPC)가 한다 —
 * 여기 caps 는 폼을 숨기거나 비활성+이유를 보여주기 위한 것뿐이다.
 */
import * as React from "react";
import Link from "next/link";
import { CircleAlert, Lock, RotateCcw, Printer } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { CONTROL, SelectField, Alert } from "./listkit";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { PAYMENT_STATUS_LABEL, type ReservationBalance, type LedgerEntryRow, type ReservationRow } from "@/lib/domain/rental-types";
import {
  LEDGER_ENTRY_LABEL, PAY_METHOD_LABEL, PAY_STAGE_LABEL, CLOSE_REASON_LABEL,
  type PayMethod, type PayStage, type CloseResult,
} from "@/lib/domain/rental-money-types";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { calcLateFeeAction, chargeLateFeeAction, type LateFeeQuote } from "@/lib/domain/rental-actions";
import {
  receivePaymentAction, chargeUnbilledFeeAction, refundDepositWithMethodAction, forfeitDepositAction,
  writeOffAction, chargeLateFeeOverrideAction, reverseLedgerEntryAction, closeReservationAction,
} from "@/lib/domain/rental-money-actions";
import { discountAbs, chargedTotal } from "./money-view";

const METHODS = Object.keys(PAY_METHOD_LABEL) as PayMethod[];
const STAGES = (["contract", "balance", "collection", "other"] as const) satisfies readonly Exclude<PayStage, "deposit">[];
/** 보증금 반환·몰수가 가능한 예약 상태(서버 not_returned 규칙과 동일). */
const DEPOSIT_SETTLE_STATUS = ["returned", "closed", "cancelled"];

export type SettlementReservation = Pick<ReservationRow, "id" | "status" | "depositRequired"> & { items: { fee: number; discount: number }[] };

export function SettlementPanel({
  businessId,
  reservation,
  balance,
  history,
  canWrite,
  canRefund,
  canManage = false,
  isOwner = false,
  onChanged,
}: {
  businessId: string;
  reservation: SettlementReservation;
  balance: ReservationBalance | { masked: true } | null;
  /** 원장 행 시간순(예약 상세에서만 서버가 넘긴다). 없으면 내역 표를 그리지 않는다. */
  history?: { masked: boolean; entries: LedgerEntryRow[] } | null;
  /** CLICK-PATH-218: write 없이는 수납 RPC 가 전부 42501 — 폼 자체를 숨긴다. */
  canWrite: boolean;
  canRefund: boolean;
  /** owner/manager — 원장 정정·보증금 몰수. 서버(refund+revenue.read)가 다시 판정한다. */
  canManage?: boolean;
  /** owner — 대손 처리(RPC 가 memberships.role 로 재검사). */
  isOwner?: boolean;
  onChanged: () => void;
}) {
  const reservationId = reservation.id;
  if (!balance) return <p className="text-[12.5px] text-et">정산 정보를 불러오지 못했습니다.</p>;
  if ("masked" in balance) {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-t3">
        <Lock size={13} /> 매출·정산 조회 권한(revenue.read)이 없어 금액이 표시되지 않습니다.
      </p>
    );
  }

  const status = reservation.status;
  const charged = chargedTotal(balance); // discount 는 뷰에서 음수 — 헬퍼가 절댓값으로 뺀다
  const receivedForFee = balance.cashReceived - balance.depositBalance;
  const depositIn = history && !history.masked ? sumSigned(history.entries, "deposit_in") : null;
  const active = !["draft", "cancelled", "closed"].includes(status);
  // 구예약: 항목 대여료가 원장보다 크면 차액만큼 "빠진 청구"가 있다(서버 chargeUnbilledFee 가 같은 규칙으로 차액만 청구).
  const itemFee = reservation.items.reduce((s, i) => s + i.fee, 0);
  const itemDiscount = reservation.items.reduce((s, i) => s + i.discount, 0);
  const unbilled = active && status !== "draft" ? Math.max(0, itemFee - balance.rentalRevenue) : 0;
  const unbilledDiscount = active && status !== "draft" ? Math.max(0, itemDiscount - discountAbs(balance.discount)) : 0;
  const depositSettleable = DEPOSIT_SETTLE_STATUS.includes(status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge kind={balance.paymentStatus === "paid" ? "success" : balance.outstanding > 0 ? "warning" : "info"}>{PAYMENT_STATUS_LABEL[balance.paymentStatus]}</Badge>
        <Link href={`/w/${businessId}/reservations/${reservationId}/statement/print`} className="inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]">
          <Printer size={13} aria-hidden />거래명세서
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="청구 합계" value={charged} sub={breakdown(balance)} />
        <Tile label="받은 돈(보증금 제외)" value={receivedForFee} />
        <Tile label="잔금(미수)" value={balance.outstanding} warn={balance.outstanding > 0} sub={balance.writtenOff > 0 ? `대손 ${formatKRW(balance.writtenOff)}` : undefined} />
        <Tile
          label="보증금 보관 잔액"
          value={balance.depositBalance}
          accent
          sub={[
            reservation.depositRequired != null ? `필요 ${formatKRW(reservation.depositRequired)}` : null,
            depositIn != null ? `받음 ${formatKRW(depositIn)}` : null,
            balance.depositForfeited > 0 ? `몰수 ${formatKRW(balance.depositForfeited)}` : null,
          ].filter(Boolean).join(" · ") || undefined}
        />
      </div>

      {canWrite && (unbilled > 0 || unbilledDiscount > 0) && (
        <UnbilledBox businessId={businessId} reservationId={reservationId} fee={unbilled} discount={unbilledDiscount} onDone={onChanged} />
      )}

      {!canWrite && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-t3">
          <Lock size={13} /> 조회만 가능합니다(write 권한 없음) — 수납·연체료·환불 처리는 관리자에게 요청하세요.
        </p>
      )}
      {canWrite && active && (
        <>
          <ReceiveForm businessId={businessId} reservationId={reservationId} outstanding={balance.outstanding} depositRequired={reservation.depositRequired} depositBalance={balance.depositBalance} onDone={onChanged} />
          <LateFeeBox businessId={businessId} reservationId={reservationId} onDone={onChanged} />
        </>
      )}
      {/* 취소 예약의 위약금 미수는 '미수 회수' 단계로만 받을 수 있다(계약 v2 §2 M1). */}
      {canWrite && status === "cancelled" && balance.outstanding > 0 && (
        <ReceiveForm businessId={businessId} reservationId={reservationId} outstanding={balance.outstanding} depositRequired={null} depositBalance={balance.depositBalance} collectionOnly onDone={onChanged} />
      )}
      {canRefund && status !== "draft" && (
        <DepositBox
          businessId={businessId}
          reservationId={reservationId}
          depositBalance={balance.depositBalance}
          enabled={depositSettleable}
          canForfeit={canManage}
          onDone={onChanged}
        />
      )}
      {isOwner && canRefund && balance.outstanding > 0 && status !== "draft" && (
        <WriteOffBox businessId={businessId} reservationId={reservationId} outstanding={balance.outstanding} onDone={onChanged} />
      )}
      {canWrite && status === "returned" && (
        <CloseBox businessId={businessId} reservationId={reservationId} outstanding={balance.outstanding} depositBalance={balance.depositBalance} onDone={onChanged} />
      )}
      {history && !history.masked && (
        <HistoryTable businessId={businessId} entries={history.entries} canReverse={canManage && canRefund} onChanged={onChanged} />
      )}
    </div>
  );
}

/** 같은 계정의 부호 합(정정 행은 반대 방향이라 자연히 상계된다). */
function sumSigned(entries: LedgerEntryRow[], type: string): number {
  return entries.filter((e) => e.entryType === type).reduce((s, e) => s + (e.direction === "in" ? e.amount : -e.amount), 0);
}

function breakdown(b: ReservationBalance): string {
  const parts = [
    `대여료 ${formatKRW(b.rentalRevenue)}`,
    discountAbs(b.discount) > 0 ? `할인 −${formatKRW(discountAbs(b.discount))}` : null,
    b.lateFee > 0 ? `연체료 ${formatKRW(b.lateFee)}` : null,
    b.damageCharge > 0 ? `손상비 ${formatKRW(b.damageCharge)}` : null,
    b.cancelPenalty > 0 ? `위약금 ${formatKRW(b.cancelPenalty)}` : null,
    b.compensation > 0 ? `배상 −${formatKRW(b.compensation)}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function Tile({ label, value, sub, accent, warn }: { label: string; value: number; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={"rounded-[var(--r-md)] border px-3 py-2.5 " + (accent ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--bd)] bg-sf")}>
      <p className="text-[11.5px] text-t3">{label}</p>
      <p className={"mt-0.5 text-[16px] font-semibold tabular-nums " + (warn ? "text-et" : accent ? "text-[var(--accent-ink)]" : "text-t")}>{formatKRW(value)}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-t3" title={sub}>{sub}</p>}
    </div>
  );
}

function Box({ title, children, hint }: { title: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">{title}</h3>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-t3">{hint}</p>}
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-2 flex items-start gap-1.5 text-[12px] text-et">
      <CircleAlert size={13} className="mt-[1px] shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function MoneyInput({ label, value, onChange, placeholder = "0" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[11.5px] text-t2">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode="numeric" className={CONTROL} />
    </label>
  );
}

function MethodSelect({ value, onChange, label = "결제수단" }: { value: PayMethod; onChange: (m: PayMethod) => void; label?: string }) {
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value as PayMethod)} wrapperClassName="mb-0" className="h-[40px] [@media(pointer:coarse)]:h-[44px]">
      {METHODS.map((m) => <option key={m} value={m}>{PAY_METHOD_LABEL[m]}</option>)}
    </SelectField>
  );
}

/** 훅 공통: 멱등키는 마운트 시 1회, 성공 후에만 새로 만든다(계약 §0). */
function useIdemKey() {
  const [key, setKey] = React.useState(() => crypto.randomUUID());
  return [key, () => setKey(crypto.randomUUID())] as const;
}

// ── 구예약: 빠진 대여료 청구 ────────────────────────────────────
function UnbilledBox({ businessId, reservationId, fee, discount, onDone }: { businessId: string; reservationId: string; fee: number; discount: number; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    const r = await chargeUnbilledFeeAction(businessId, reservationId);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone();
  };
  return (
    <Alert kind="warning">
      <span className="flex flex-wrap items-center gap-2">
        <span>항목 금액 중 아직 원장에 반영되지 않은 것이 있습니다 — {[fee > 0 ? `대여료 ${formatKRW(fee)}` : null, discount > 0 ? `할인 ${formatKRW(discount)}` : null].filter(Boolean).join(" · ")}. 대여료 청구 전에는 수납이 막힙니다.</span>
        <Button size="sm" onClick={run} loading={busy}>빠진 대여료 청구</Button>
      </span>
      {error && <span className="mt-1 block">{error}</span>}
    </Alert>
  );
}

// ── 수납 / 보증금 받기 ───────────────────────────────────────────
function ReceiveForm({ businessId, reservationId, outstanding, depositRequired, depositBalance, collectionOnly = false, onDone }: {
  businessId: string; reservationId: string; outstanding: number; depositRequired: number | null; depositBalance: number;
  /** 취소 예약: 위약금 미수 회수만(보증금 받기·다른 단계 숨김). */
  collectionOnly?: boolean; onDone: () => void;
}) {
  const [kind, setKind] = React.useState<"payment" | "deposit">("payment");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PayMethod>("cash");
  const [stage, setStage] = React.useState<Exclude<PayStage, "deposit">>(collectionOnly ? "collection" : "contract");
  const [approvalNo, setApprovalNo] = React.useState("");
  const [cashReceipt, setCashReceipt] = React.useState(false);
  const [memo, setMemo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, rotate] = useIdemKey();

  const submit = async () => {
    const amt = parseKRW(amount);
    if (amt <= 0) { setError("금액을 입력하세요."); return; }
    if (kind === "payment" && amt > outstanding) { setError(`현재 미수금 ${formatKRW(outstanding)}을 넘는 금액입니다.`); return; }
    setBusy(true); setError(null);
    const r = await receivePaymentAction(businessId, reservationId, {
      amount: amt, method, kind, stage: kind === "payment" ? stage : undefined,
      approvalNo: method === "card" ? approvalNo : undefined, cashReceipt: method === "cash" ? cashReceipt : null, memo, idempotencyKey: key,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setAmount(""); setApprovalNo(""); setMemo(""); setCashReceipt(false);
    rotate();
    onDone();
  };

  const depositShort = depositRequired != null ? Math.max(0, depositRequired - depositBalance) : 0;
  const tab = (v: "payment" | "deposit", l: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === v}
      onClick={() => setKind(v)}
      className={"inline-flex h-[32px] items-center rounded-[var(--r-sm)] border px-3 text-[12.5px] font-medium [@media(pointer:coarse)]:h-[44px] " + (kind === v ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] text-t2 hover:bg-sf2")}
    >
      {l}
    </button>
  );

  return (
    <Box
      title={collectionOnly ? "위약금 미수 회수" : "수납"}
      hint={kind === "payment"
        ? `현재 미수금 ${formatKRW(outstanding)}. 미수를 넘는 금액은 서버가 거부합니다(이중 수납 방지).`
        : `보증금은 대여료와 별도 계정에 보관됩니다. ${depositRequired != null ? `필요액 ${formatKRW(depositRequired)}${depositShort > 0 ? ` · 아직 ${formatKRW(depositShort)} 덜 받음` : " · 충족"}` : "필요액은 확정 시 계산됩니다"}.`}
    >
      {!collectionOnly && (
        <div className="mb-2.5 flex gap-1.5" role="tablist">
          {tab("payment", "대여료 수납")}
          {tab("deposit", "보증금 받기")}
        </div>
      )}
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <MoneyInput label="금액(원)" value={amount} onChange={setAmount} placeholder={kind === "payment" ? String(outstanding) : String(depositShort || "")} />
        <MethodSelect value={method} onChange={setMethod} />
        {kind === "payment" ? (
          <SelectField label="구분" value={stage} disabled={collectionOnly} onChange={(e) => setStage(e.target.value as Exclude<PayStage, "deposit">)} wrapperClassName="mb-0" className="h-[40px] [@media(pointer:coarse)]:h-[44px]">
            {STAGES.map((s) => <option key={s} value={s}>{PAY_STAGE_LABEL[s]}</option>)}
          </SelectField>
        ) : (
          <div className="hidden sm:block" />
        )}
        {method === "card" ? (
          <label className="flex flex-col gap-1 text-[11.5px] text-t2">
            카드 승인번호(선택)
            <input value={approvalNo} onChange={(e) => setApprovalNo(e.target.value)} maxLength={40} placeholder="12345678" className={CONTROL} />
          </label>
        ) : method === "cash" ? (
          <label className="flex min-h-[40px] items-center gap-2 self-end text-[12.5px] text-t2 [@media(pointer:coarse)]:min-h-[44px]">
            <input type="checkbox" checked={cashReceipt} onChange={(e) => setCashReceipt(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--accent-strong)]" />
            현금영수증 발행
          </label>
        ) : (
          <div className="hidden sm:block" />
        )}
        <label className="flex flex-col gap-1 text-[11.5px] text-t2 sm:col-span-3">
          메모(선택)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 잔금 절반 먼저" className={CONTROL} />
        </label>
        <Button size="sm" onClick={submit} loading={busy} disabled={kind === "payment" && outstanding <= 0} className="h-[40px] self-end [@media(pointer:coarse)]:h-[44px]">
          {kind === "payment" ? "수납 기록" : "보증금 수령 기록"}
        </Button>
      </div>
    </Box>
  );
}

// ── 연체료: 산출값 청구 / 직접 입력 청구 ────────────────────────
function LateFeeBox({ businessId, reservationId, onDone }: { businessId: string; reservationId: string; onDone: () => void }) {
  const [quote, setQuote] = React.useState<LateFeeQuote | null>(null);
  const [override, setOverride] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, rotate] = useIdemKey();

  const check = async () => {
    setBusy(true); setError(null);
    const r = await calcLateFeeAction(businessId, reservationId);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setQuote(r.data);
  };
  const chargeQuoted = async () => {
    if (!quote) return;
    setBusy(true); setError(null);
    const r = await chargeLateFeeAction(businessId, reservationId, quote.amount, key);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setQuote(null); rotate(); onDone();
  };
  const chargeOverride = async () => {
    const amt = parseKRW(override);
    if (amt <= 0) { setError("청구할 연체료를 입력하세요."); return; }
    if (!reason.trim()) { setError("산출값과 다른 금액을 청구하려면 사유가 필요합니다."); return; }
    setBusy(true); setError(null);
    const r = await chargeLateFeeOverrideAction(businessId, reservationId, { amount: amt, reason, idempotencyKey: key });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setOverride(""); setReason(""); setQuote(null); rotate(); onDone();
  };

  return (
    <Box title="연체료" hint="사업장 연체료 기준(유예시간·일당) 스냅샷으로 계산합니다. 청구는 미수에 더해질 뿐 수납이 아닙니다 — 돈은 위 '수납'에서 받으세요.">
      <ErrorLine message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={check} loading={busy}>연체료 계산</Button>
        {quote && (
          <>
            <span className="text-[12.5px] text-t2">
              산출 <span className="font-semibold tabular-nums text-t">{formatKRW(quote.amount)}</span> — 연체 {quote.lateDays}일 × 일 {formatKRW(quote.lateFeePerDay)}{quote.graceHours ? `, 유예 ${quote.graceHours}시간` : ""}
            </span>
            {quote.amount > 0 && <Button size="sm" onClick={chargeQuoted} loading={busy}>이 금액으로 청구</Button>}
          </>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <MoneyInput label="직접 입력 청구(원)" value={override} onChange={setOverride} />
        <label className="flex flex-col gap-1 text-[11.5px] text-t2 sm:col-span-2">
          사유(필수)
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 반나절 지연이라 반액만" className={CONTROL} />
        </label>
        <Button size="sm" variant="secondary" onClick={chargeOverride} loading={busy} disabled={!override} className="h-[40px] self-end [@media(pointer:coarse)]:h-[44px]">사유와 함께 청구</Button>
      </div>
    </Box>
  );
}

// ── 보증금 반환 / 몰수 ──────────────────────────────────────────
function DepositBox({ businessId, reservationId, depositBalance, enabled, canForfeit, onDone }: {
  businessId: string; reservationId: string; depositBalance: number; enabled: boolean; canForfeit: boolean; onDone: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PayMethod>("transfer");
  const [reason, setReason] = React.useState("");
  const [forfeitAmt, setForfeitAmt] = React.useState("");
  const [forfeitReason, setForfeitReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, rotate] = useIdemKey();
  const [fkey, frotate] = useIdemKey();
  const blockedWhy = !enabled ? "반납 완료 전에는 보증금을 반환·몰수할 수 없습니다. 반납·검수를 먼저 처리하세요." : depositBalance <= 0 ? "보관 중인 보증금이 없습니다." : "";

  const refund = async () => {
    const amt = parseKRW(amount);
    if (amt <= 0) { setError("반환할 금액을 입력하세요."); return; }
    if (amt > depositBalance) { setError("보관 잔액을 넘는 금액입니다."); return; }
    if (!window.confirm(`보증금 ${formatKRW(amt)}을 ${PAY_METHOD_LABEL[method]}로 반환합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    setBusy(true); setError(null);
    const r = await refundDepositWithMethodAction(businessId, reservationId, { amount: amt, method, reason, idempotencyKey: key });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setAmount(""); setReason(""); rotate(); onDone();
  };
  const forfeit = async () => {
    const amt = parseKRW(forfeitAmt);
    if (amt <= 0) { setError("몰수할 금액을 입력하세요."); return; }
    if (!forfeitReason.trim()) { setError("몰수 사유를 입력하세요."); return; }
    if (!window.confirm(`보증금 ${formatKRW(amt)}을 몰수(매장 수익)합니다. 고객에게 돌려주지 않습니다. 계속할까요?`)) return;
    setBusy(true); setError(null);
    const r = await forfeitDepositAction(businessId, reservationId, { amount: amt, reason: forfeitReason, idempotencyKey: fkey });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setForfeitAmt(""); setForfeitReason(""); frotate(); onDone();
  };

  const disabled = !!blockedWhy;
  return (
    <Box title="보증금 반환·몰수" hint={blockedWhy || `보관 잔액 ${formatKRW(depositBalance)}. 손상·미수 차감은 '손상·분실 청구' 카드의 보증금 정산으로 처리합니다.`}>
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4" title={blockedWhy || undefined}>
        <MoneyInput label="반환액(원)" value={amount} onChange={setAmount} placeholder={String(depositBalance)} />
        <MethodSelect value={method} onChange={setMethod} label="반환 수단" />
        <label className="flex flex-col gap-1 text-[11.5px] text-t2">
          사유(선택)
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 검수 이상 없음" className={CONTROL} disabled={disabled} />
        </label>
        <Button size="sm" onClick={refund} loading={busy} disabled={disabled} title={blockedWhy || undefined} className="h-[40px] self-end [@media(pointer:coarse)]:h-[44px]">보증금 반환</Button>
      </div>
      {canForfeit && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--bd)] pt-3 sm:grid-cols-4" title={blockedWhy || undefined}>
          <MoneyInput label="몰수액(원)" value={forfeitAmt} onChange={setForfeitAmt} />
          <label className="flex flex-col gap-1 text-[11.5px] text-t2 sm:col-span-2">
            몰수 사유(필수)
            <input value={forfeitReason} onChange={(e) => setForfeitReason(e.target.value)} placeholder="예: 노쇼 · 반납 거부" className={CONTROL} disabled={disabled} />
          </label>
          <Button size="sm" variant="danger" onClick={forfeit} loading={busy} disabled={disabled} title={blockedWhy || undefined} className="h-[40px] self-end [@media(pointer:coarse)]:h-[44px]">보증금 몰수</Button>
        </div>
      )}
    </Box>
  );
}

// ── 대손(owner) ─────────────────────────────────────────────────
function WriteOffBox({ businessId, reservationId, outstanding, onDone }: { businessId: string; reservationId: string; outstanding: number; onDone: () => void }) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, rotate] = useIdemKey();
  const submit = async () => {
    const amt = parseKRW(amount);
    if (amt <= 0 || amt > outstanding) { setError(`1원 이상 미수금(${formatKRW(outstanding)}) 이하로 입력하세요.`); return; }
    if (!reason.trim()) { setError("대손 사유를 입력하세요."); return; }
    if (!window.confirm(`미수금 ${formatKRW(amt)}을 회수 불능(대손)으로 처리합니다. 매출은 그대로 남고 미수만 줄어듭니다. 계속할까요?`)) return;
    setBusy(true); setError(null);
    const r = await writeOffAction(businessId, reservationId, { amount: amt, reason, idempotencyKey: key });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setAmount(""); setReason(""); rotate(); onDone();
  };
  return (
    <Box title="대손 처리(사업장 owner 전용)" hint="연락 두절 등으로 받을 수 없는 미수를 지웁니다. 매출 보고는 줄지 않습니다.">
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <MoneyInput label="대손액(원)" value={amount} onChange={setAmount} placeholder={String(outstanding)} />
        <label className="flex flex-col gap-1 text-[11.5px] text-t2 sm:col-span-2">
          사유(필수)
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 연락 두절 6개월" className={CONTROL} />
        </label>
        <Button size="sm" variant="danger" onClick={submit} loading={busy} className="h-[40px] self-end [@media(pointer:coarse)]:h-[44px]">대손 처리</Button>
      </div>
    </Box>
  );
}

// ── 종결 ────────────────────────────────────────────────────────
function CloseBox({ businessId, reservationId, outstanding, depositBalance, onDone }: { businessId: string; reservationId: string; outstanding: number; depositBalance: number; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CloseResult | null>(null);
  const hints = [outstanding > 0 ? `미수금 ${formatKRW(outstanding)}` : null, depositBalance > 0 ? `보증금 잔액 ${formatKRW(depositBalance)}` : null].filter(Boolean);
  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    const r = await closeReservationAction(businessId, reservationId);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setResult(r.data);
    if (r.data.closed) onDone();
  };
  return (
    <Box title="정산 완료(종결)" hint="모든 항목이 반납·처리되고 미수 0·보증금 잔액 0 이면 종결됩니다. 최종 판정은 서버가 합니다.">
      <ErrorLine message={error} />
      {result && !result.closed && (
        <Alert kind="warning" className="mb-2">
          아직 종결할 수 없습니다: {result.reasons.map((x) => `${CLOSE_REASON_LABEL[x.code] ?? x.code}${x.amount != null ? `(${formatKRW(x.amount)})` : x.count != null ? `(${x.count}건)` : ""}`).join(" · ")}
        </Alert>
      )}
      {result?.closed && <Alert kind="success" className="mb-2">예약이 종결되었습니다.</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} loading={busy} disabled={hints.length > 0} title={hints.length ? `먼저 처리: ${hints.join(", ")}` : undefined}>정산 완료(종결)</Button>
        {hints.length > 0 && <span className="text-[12px] text-t3">먼저 처리: {hints.join(" · ")}</span>}
      </div>
    </Box>
  );
}

// ── 원장 내역 + 정정 ────────────────────────────────────────────
function HistoryTable({ businessId, entries, canReverse, onChanged }: { businessId: string; entries: LedgerEntryRow[]; canReverse: boolean; onChanged: () => void }) {
  const [target, setTarget] = React.useState<LedgerEntryRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reversedIds = React.useMemo(() => new Set(entries.map((e) => e.reversesId).filter(Boolean) as string[]), [entries]);

  const submit = async () => {
    if (!target) return;
    if (!reason.trim()) { setError("정정 사유를 입력하세요."); return; }
    setBusy(true); setError(null);
    const r = await reverseLedgerEntryAction(businessId, target.id, reason);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setTarget(null); setReason(""); onChanged();
  };
  const pairHint = (t: string) => (t === "deposit_in" || t === "payment_in") ? "보증금 수납은 '보증금 수납'과 '현금 수납' 두 행이 짝입니다. 둘 다 정정해야 잔액이 맞습니다."
    : (t === "deposit_out" || t === "refund") ? "보증금 반환은 '보증금 반환·차감'과 '환급' 두 행이 짝입니다. 둘 다 정정해야 잔액이 맞습니다." : null;
  // 보증금 계정 행(deposit_in/out)은 현금 이동이 아니라 "보관 계정"의 증감 — 같은 시각의 현금 행(현금 수납/환급) 뒤에 들여쓴 짝 행으로 보여
  // '현금 수납 +50,000'과 '보증금 수납 +50,000'이 받은 돈 두 배처럼 읽히지 않게 한다. 금액·건수는 그대로다.
  const isDepositRow = (t: string) => t === "deposit_in" || t === "deposit_out";
  const ordered = React.useMemo(
    () => [...entries].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || Number(isDepositRow(a.entryType)) - Number(isDepositRow(b.entryType))),
    [entries]
  );

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">원장 내역 <span className="font-normal text-t3">({entries.length}건)</span></h3>
      {entries.length === 0 ? (
        <p className="text-[12.5px] text-t3">기록된 원장 항목이 없습니다.</p>
      ) : (
        /* relative: 마지막 열 sr-only(absolute) 제목이 static 래퍼 밖(뷰포트)을 기준으로 잡혀 휴대폰에서 문서를 넓히던 결함(D1). */
        <div className="relative -mx-3.5 overflow-x-auto px-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" tabIndex={0} role="region" aria-label="원장 내역 표(가로 스크롤)">
          <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--bd)] text-left text-[11.5px] font-medium text-t3">
                <th className="py-2 pr-3 font-medium">일시</th>
                <th className="py-2 pr-3 font-medium">계정</th>
                <th className="py-2 pr-3 font-medium">단계·수단</th>
                <th className="py-2 pr-3 font-medium">메모</th>
                <th className="py-2 text-right font-medium">금액</th>
                {canReverse && <th className="py-2 pl-3"><span className="sr-only">정정</span></th>}
              </tr>
            </thead>
            <tbody>
              {ordered.map((e) => {
                const struck = reversedIds.has(e.id) || !!e.reversesId;
                const depositRow = isDepositRow(e.entryType);
                return (
                  <tr key={e.id} className={"border-b border-[var(--bd)] last:border-b-0 " + (struck ? "text-t3 line-through" : depositRow ? "bg-sf2/60" : "")}>
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-t3">{formatInTz(e.occurredAt, DEFAULT_TZ, "M. d. HH:mm")}</td>
                    <td className={"py-2 pr-3 " + (depositRow ? "pl-4 text-t2" : "text-t")}>
                      {depositRow ? `↳ ${e.entryType === "deposit_in" ? "보증금으로 보관(위 현금 수납 중)" : "보관 보증금 해제(현금은 '환급' 행)"}` : e.entryType === "payment_in" && e.stage === "deposit" ? "현금 수납(보증금)" : LEDGER_ENTRY_LABEL[e.entryType] ?? e.entryType}
                      {e.reversesId && <span className="ml-1 rounded-[4px] bg-sf3 px-1 text-[10.5px] no-underline">정정</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-t2">
                      {depositRow ? <span className="text-t3">보관 계정</span> : [e.stage ? PAY_STAGE_LABEL[e.stage as PayStage] ?? e.stage : null, e.method ? PAY_METHOD_LABEL[e.method as PayMethod] ?? e.method : null].filter(Boolean).join(" · ")}
                      {e.approvalNo && <span className="block text-[11px] text-t3">승인 {e.approvalNo}</span>}
                      {e.cashReceipt && <span className="block text-[11px] text-t3">현금영수증</span>}
                    </td>
                    <td className="max-w-[220px] py-2 pr-3 text-t2"><span className="block truncate" title={e.reason ?? undefined}>{e.reason ?? ""}</span></td>
                    <td className={"whitespace-nowrap py-2 text-right tabular-nums " + (depositRow ? "text-t3" : e.direction === "out" ? "text-et" : "text-t")}>{depositRow ? "보관 " : ""}{e.direction === "out" ? "−" : "+"}{formatKRW(e.amount)}</td>
                    {canReverse && (
                      <td className="py-1 pl-3 text-right">
                        {!struck && (
                          <Button size="sm" variant="ghost" onClick={() => { setTarget(e); setReason(""); setError(null); }} aria-label="이 행 정정">
                            <RotateCcw size={13} aria-hidden />정정
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="원장 항목 정정"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>취소</Button>
            <Button variant="danger" onClick={submit} loading={busy}>정정 기록</Button>
          </>
        }
      >
        {target && (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {error && <Alert className="mb-3">{error}</Alert>}
            <p className="mb-3 text-[12.5px] text-t2">
              {LEDGER_ENTRY_LABEL[target.entryType] ?? target.entryType} {target.direction === "out" ? "−" : "+"}{formatKRW(target.amount)} ({formatInTz(target.occurredAt, DEFAULT_TZ, "M. d. HH:mm")}) 를 반대 방향의 상계 행으로 정정합니다. 원본은 지워지지 않고 취소선으로 남습니다.
            </p>
            {pairHint(target.entryType) && <Alert kind="warning" className="mb-3">{pairHint(target.entryType)}</Alert>}
            <Input label="정정 사유" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 금액 오입력(30,000 → 300,000)" wrapperClassName="mb-0" />
          </form>
        )}
      </Modal>
    </div>
  );
}
