"use client";

/**
 * 정산 표시 + 수납/환불/연체료 확정.
 * 계약 §3: 대여매출·연체료·손상비·할인·보증금잔액·현금수납·미수금을 절대 하나로 합치지 않는다.
 * 보증금을 대여 매출에 합산해 보여주는 화면을 만들지 말 것 — 아래 표는 그래서 항목이 7줄이다.
 */
import * as React from "react";
import { CircleAlert, Lock } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { CONTROL } from "./listkit";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { PAYMENT_STATUS_LABEL, type ReservationBalance, type LedgerEntryRow } from "@/lib/domain/rental-types";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import {
  recordPaymentAction,
  refundDepositAction,
  calcLateFeeAction,
  chargeLateFeeAction,
  settleOutstandingAction,
  type LateFeeQuote,
} from "@/lib/domain/rental-actions";

export function SettlementPanel({
  businessId,
  reservationId,
  balance,
  history,
  canWrite,
  canRefund,
  onChanged,
}: {
  businessId: string;
  reservationId: string;
  balance: ReservationBalance | { masked: true } | null;
  /** 원장 행 시간순(예약 상세에서만 서버가 넘긴다). 없으면 내역 표를 그리지 않는다. */
  history?: { masked: boolean; entries: LedgerEntryRow[] } | null;
  /** CLICK-PATH-218: write 없이는 record_payment/charge_late_fee RPC가 전부 42501로 거부된다 — 폼 자체를 숨긴다. */
  canWrite: boolean;
  canRefund: boolean;
  onChanged: () => void;
}) {
  if (!balance) {
    return <p className="text-[12.5px] text-et">정산 정보를 불러오지 못했습니다.</p>;
  }
  if ("masked" in balance) {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-t3">
        <Lock size={13} /> 매출·정산 조회 권한(revenue.read)이 없어 금액이 표시되지 않습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex w-fit items-center rounded-[6px] bg-sf2 px-2 py-0.5 text-[11px] font-bold text-t2">
        결제상태 · {PAYMENT_STATUS_LABEL[balance.paymentStatus]}
      </span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px] sm:grid-cols-4">
        <Item label="대여매출" value={balance.rentalRevenue} />
        <Item label="연체료" value={balance.lateFee} />
        <Item label="손상비" value={balance.damageCharge} />
        <Item label="할인" value={balance.discount} />
        <Item label="보증금 잔액" value={balance.depositBalance} accent />
        <Item label="현금 수납액" value={balance.cashReceived} />
        <Item label="미수금" value={balance.outstanding} warn={balance.outstanding > 0} />
      </dl>

      {!canWrite && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-t3">
          <Lock size={13} /> 조회만 가능합니다(write 권한 없음) — 수납·연체료·환불 처리는 관리자에게 요청하세요.
        </p>
      )}
      {canWrite && (
        <>
          <PaymentForm businessId={businessId} reservationId={reservationId} onDone={onChanged} />
          <SettleOutstandingBox businessId={businessId} reservationId={reservationId} outstanding={balance.outstanding} onDone={onChanged} />
          <LateFeeBox businessId={businessId} reservationId={reservationId} onDone={onChanged} />
        </>
      )}
      {canWrite && canRefund && (
        <RefundForm businessId={businessId} reservationId={reservationId} depositBalance={balance.depositBalance} onDone={onChanged} />
      )}
      {history && !history.masked && <HistoryTable entries={history.entries} />}
    </div>
  );
}

const ENTRY_LABEL: Record<string, string> = {
  rental_revenue: "대여료",
  discount: "할인",
  deposit_in: "보증금 수납",
  deposit_out: "보증금 반환·차감",
  deposit_forfeit: "보증금 몰수",
  late_fee: "연체료",
  damage_charge: "손상비",
  payment_in: "현금 수납",
  refund: "환급",
};
const METHOD_LABEL: Record<string, string> = { cash: "현금", card: "카드", transfer: "계좌이체", other: "기타" };

/** 정산 내역 = 원장 행 시간순. 합산하지 않고 그대로 보여준다(계약 §3). */
function HistoryTable({ entries }: { entries: LedgerEntryRow[] }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">정산 내역 <span className="font-normal text-t3">({entries.length}건)</span></h3>
      {entries.length === 0 ? (
        <p className="text-[12.5px] text-t3">기록된 원장 항목이 없습니다.</p>
      ) : (
        <div className="-mx-3.5 overflow-x-auto px-3.5">
          <table className="w-full min-w-[480px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--bd)] text-left text-[11.5px] font-medium text-t3">
                <th className="py-2 pr-3 font-medium">일시</th>
                <th className="py-2 pr-3 font-medium">항목</th>
                <th className="py-2 pr-3 font-medium">수단·사유</th>
                <th className="py-2 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--bd)] last:border-b-0">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-t3">{formatInTz(e.occurredAt, DEFAULT_TZ, "M. d. HH:mm")}</td>
                  <td className="py-2 pr-3 text-t">{ENTRY_LABEL[e.entryType] ?? e.entryType}</td>
                  <td className="py-2 pr-3 text-t2">
                    {e.method ? (METHOD_LABEL[e.method] ?? e.method) : ""}
                    {e.reason && <span className="block truncate text-[11.5px] text-t3" title={e.reason}>{e.reason}</span>}
                  </td>
                  <td className={"whitespace-nowrap py-2 text-right tabular-nums " + (e.direction === "out" ? "text-et" : "text-t")}>
                    {e.direction === "out" ? "−" : "+"}{formatKRW(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Item({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11.5px] text-t3">{label}</dt>
      <dd className={"mt-0.5 text-[14px] tabular-nums " + (warn ? "font-semibold text-et" : accent ? "font-semibold text-t" : "text-t")}>{formatKRW(value)}</dd>
    </div>
  );
}

function PaymentForm({ businessId, reservationId, onDone }: { businessId: string; reservationId: string; onDone: () => void }) {
  const [rentalFee, setRentalFee] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [depositIn, setDepositIn] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState(() => crypto.randomUUID());

  const submit = async () => {
    const lines = [
      rentalFee && { entryType: "rental_revenue" as const, amount: parseKRW(rentalFee) },
      discount && { entryType: "discount" as const, amount: parseKRW(discount) },
      depositIn && { entryType: "deposit_in" as const, amount: parseKRW(depositIn) },
    ].filter(Boolean) as { entryType: "rental_revenue" | "discount" | "deposit_in"; amount: number }[];
    if (lines.length === 0) { setError("수납할 금액을 하나 이상 입력하세요."); return; }
    setBusy(true);
    setError(null);
    const r = await recordPaymentAction(businessId, reservationId, lines, key);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setRentalFee(""); setDiscount(""); setDepositIn("");
    setKey(crypto.randomUUID());
    onDone();
  };

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">수납 입력</h3>
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <LabeledMoneyInput label="대여료" value={rentalFee} onChange={setRentalFee} />
        <LabeledMoneyInput label="할인" value={discount} onChange={setDiscount} />
        <LabeledMoneyInput label="보증금 수납" value={depositIn} onChange={setDepositIn} />
        <Button size="sm" onClick={submit} loading={busy} className="self-end h-[40px] [@media(pointer:coarse)]:h-[44px]">수납 기록</Button>
      </div>
      <p className="mt-1.5 text-[11px] text-t3">현금 수납 총액은 서버가 계산합니다(대여료+보증금 등 입력한 항목의 합).</p>
    </div>
  );
}

/**
 * 미수금 즉시 수납 — "수납 입력"(새 청구를 만들며 동시에 받는 돈)과 절대 같은 폼에 두지 않는다.
 * 여기는 이미 잡혀 있는 미수금을 현금으로만 줄이는 경로다(record_payment의 p_settle).
 */
function SettleOutstandingBox({
  businessId,
  reservationId,
  outstanding,
  onDone,
}: {
  businessId: string;
  reservationId: string;
  outstanding: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState(() => crypto.randomUUID());

  const submit = async () => {
    const amt = parseKRW(amount);
    if (amt <= 0) { setError("수납액을 입력하세요."); return; }
    setBusy(true); setError(null);
    const r = await settleOutstandingAction(businessId, reservationId, amt, key);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setAmount("");
    setKey(crypto.randomUUID());
    onDone();
  };

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">미수금 수납(새 청구 없음)</h3>
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <LabeledMoneyInput label={`수납액(현재 미수금 ${formatKRW(outstanding)})`} value={amount} onChange={setAmount} />
        <Button size="sm" onClick={submit} loading={busy} disabled={outstanding <= 0} className="self-end h-[40px] [@media(pointer:coarse)]:h-[44px]">미수금 수납</Button>
      </div>
      <p className="mt-1.5 text-[11px] text-t3">이미 잡힌 미수금을 현금으로만 줄입니다. 새 대여료·연체료 등을 청구하려면 위 &ldquo;수납 입력&rdquo;을 쓰세요.</p>
    </div>
  );
}

function LateFeeBox({ businessId, reservationId, onDone }: { businessId: string; reservationId: string; onDone: () => void }) {
  const [quote, setQuote] = React.useState<LateFeeQuote | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState(() => crypto.randomUUID());

  const check = async () => {
    setBusy(true); setError(null);
    const r = await calcLateFeeAction(businessId, reservationId);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setQuote(r.data);
  };

  const confirmCharge = async () => {
    if (!quote) return;
    setBusy(true); setError(null);
    const r = await chargeLateFeeAction(businessId, reservationId, quote.amount, key);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setQuote(null);
    setKey(crypto.randomUUID());
    onDone();
  };

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">연체료</h3>
      <ErrorLine message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={check} loading={busy}>연체료 계산(제안값)</Button>
        {quote && (
          <>
            <span className="text-[12.5px] text-t2">
              제안 {formatKRW(quote.amount)} — 연체 {quote.lateDays}일 × 일 {formatKRW(quote.lateFeePerDay)}
              {quote.graceHours ? `, 유예 ${quote.graceHours}시간` : ""}
            </span>
            {quote.amount > 0 && (
              <Button size="sm" onClick={confirmCharge} loading={busy}>이 금액으로 청구 확정</Button>
            )}
          </>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-t3">확정 시점 요금 정책 스냅샷 기준으로 산출됩니다. 확정은 청구일 뿐 수납이 아닙니다 — 현금은 위 &ldquo;수납 입력&rdquo;에서 별도로 받으세요.</p>
    </div>
  );
}

function RefundForm({ businessId, reservationId, depositBalance, onDone }: { businessId: string; reservationId: string; depositBalance: number; onDone: () => void }) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState(() => crypto.randomUUID());

  const submit = async () => {
    const amt = parseKRW(amount);
    if (amt <= 0) { setError("환불액을 입력하세요."); return; }
    if (!window.confirm(`${formatKRW(amt)}을 환불 처리합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    setBusy(true); setError(null);
    const r = await refundDepositAction(businessId, reservationId, amt, reason, key);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setAmount(""); setReason("");
    setKey(crypto.randomUUID());
    onDone();
  };

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf p-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-t">보증금 환불</h3>
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <LabeledMoneyInput label={`환불액(잔액 ${formatKRW(depositBalance)})`} value={amount} onChange={setAmount} />
        <label className="flex flex-col gap-1 text-[11.5px] text-t2 sm:col-span-2">사유(선택)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 오염 세탁비 차감 후 환급" className={CONTROL} /></label>
        <Button size="sm" variant="danger" onClick={submit} loading={busy} disabled={depositBalance <= 0} className="self-end h-[40px] [@media(pointer:coarse)]:h-[44px]">환불 처리</Button>
      </div>
    </div>
  );
}

function LabeledMoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11.5px] text-t2">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" inputMode="numeric" className={CONTROL} />
    </label>
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
