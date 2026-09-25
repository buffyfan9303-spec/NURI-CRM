"use client";

/**
 * 예약 상세의 신규 흐름(0023): 반납 검수 한 화면(반납 → 손상 청구 N건 → 보증금 차감 → 환불),
 * 확정 예약 취소(환급 동의), 손상 청구 목록·청구서 인쇄, 안내 문구(확정·전날).
 * 멱등키는 crypto.randomUUID 로 1회 만들어 실패·재시도에도 유지하고, 성공했을 때만 새로 만든다.
 */
import * as React from "react";
import Link from "next/link";
import { Plus, Trash2, Printer, Ban, ClipboardCheck, MessageSquare } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { MessageActions } from "@/components/common/MessageActions";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { rentalReservationNotice } from "@/lib/domain/messages";
import {
  CLAIM_KIND_LABEL,
  type ClaimKind,
  type DamageClaimRow,
  type ReservationRow,
  type ReservationBalance,
  type SettlementResult,
} from "@/lib/domain/rental-types";
import {
  inspectReturnAction,
  cancelConfirmedReservation,
  claimDamageAction,
  settleDepositAction,
  type DamageClaimInput,
} from "@/lib/domain/rental-actions";
import { CardHead, Alert, SelectField, CONTROL, TABLE, THEAD, TH, TR, TD } from "./listkit";

const METHODS = [
  ["cash", "현금"],
  ["card", "카드"],
  ["transfer", "계좌이체"],
  ["other", "기타"],
] as const;
type Method = (typeof METHODS)[number][0];

interface ClaimDraft { key: string; itemId: string; kind: ClaimKind; description: string; amount: string; reason: string }
const newClaim = (): ClaimDraft => ({ key: crypto.randomUUID(), itemId: "", kind: "damaged", description: "", amount: "", reason: "" });

function SettlementSummary({ s }: { s: SettlementResult }) {
  if (s.masked) return <p className="text-[12.5px] text-t3">정산 금액은 revenue.read 권한이 있는 사용자에게만 표시됩니다.</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-4">
      <div><dt className="text-[11.5px] text-t3">보증금 차감</dt><dd className="mt-0.5 tabular-nums text-t">{formatKRW(s.applied ?? 0)}</dd></div>
      <div><dt className="text-[11.5px] text-t3">환불</dt><dd className="mt-0.5 tabular-nums font-semibold text-okt">{formatKRW(s.refunded ?? 0)}</dd></div>
      <div><dt className="text-[11.5px] text-t3">남은 보증금</dt><dd className="mt-0.5 tabular-nums text-t">{formatKRW(s.remainingDeposit ?? 0)}</dd></div>
      <div><dt className="text-[11.5px] text-t3">추가 청구</dt><dd className={"mt-0.5 tabular-nums " + ((s.additionalDue ?? 0) > 0 ? "font-semibold text-et" : "text-t")}>{formatKRW(s.additionalDue ?? 0)}</dd></div>
    </dl>
  );
}

/** 청구 입력 행(검수 패널·개별 청구 공용). */
function ClaimRows({
  claims,
  setClaims,
  items,
}: {
  claims: ClaimDraft[];
  setClaims: React.Dispatch<React.SetStateAction<ClaimDraft[]>>;
  items: ReservationRow["items"];
}) {
  const update = (key: string, patch: Partial<ClaimDraft>) => setClaims((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  return (
    <div className="flex flex-col gap-2">
      {claims.map((c) => (
        <div key={c.key} className="rounded-[var(--r-md)] border border-[var(--bd)] p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_40px]">
            <select value={c.itemId} onChange={(e) => update(c.key, { itemId: e.target.value })} aria-label="대상 항목" className={CONTROL}>
              <option value="">항목 지정 없음</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.productName}{i.unitCode ? ` · ${i.unitCode}` : ""}</option>
              ))}
            </select>
            <select value={c.kind} onChange={(e) => update(c.key, { kind: e.target.value as ClaimKind })} aria-label="청구 종류" className={CONTROL}>
              {(Object.keys(CLAIM_KIND_LABEL) as ClaimKind[]).map((k) => <option key={k} value={k}>{CLAIM_KIND_LABEL[k]}</option>)}
            </select>
            <input value={c.amount} onChange={(e) => update(c.key, { amount: e.target.value })} placeholder="청구액(원)" aria-label="청구액(원)" inputMode="numeric" className={CONTROL} />
            <button
              type="button"
              onClick={() => setClaims((cs) => cs.filter((x) => x.key !== c.key))}
              aria-label="청구 삭제"
              className="flex h-[40px] items-center justify-center rounded-[var(--r-md)] border border-[var(--bd2)] text-et hover:bg-eb [@media(pointer:coarse)]:h-[44px]"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={c.description} onChange={(e) => update(c.key, { description: e.target.value })} placeholder="내용(필수) 예: 재킷 소매 얼룩" aria-label="청구 내용" className={CONTROL} />
            <input value={c.reason} onChange={(e) => update(c.key, { reason: e.target.value })} placeholder="산정 근거(선택) 예: 세탁비 실비" aria-label="산정 근거" className={CONTROL} />
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setClaims((cs) => [...cs, newClaim()])}>
        <Plus size={13} aria-hidden />청구 추가
      </Button>
    </div>
  );
}

function toInputs(claims: ClaimDraft[]): DamageClaimInput[] {
  return claims.map((c) => ({ kind: c.kind, description: c.description.trim(), amount: parseKRW(c.amount || "0"), itemId: c.itemId || null, reason: c.reason.trim() || undefined }));
}

/**
 * 반납 검수 한 화면. 출고 중 항목이 있을 때만 그린다. 권한: write(반납)·revenue.read(청구)·refund(정산) —
 * 셋 중 하나라도 없으면 서버가 전부 롤백하므로 세 권한이 모두 있을 때만 패널을 연다.
 */
export function ReturnInspectionPanel({
  businessId,
  reservation,
  balance,
  onDone,
}: {
  businessId: string;
  reservation: ReservationRow;
  balance: ReservationBalance | null;
  onDone: () => void;
}) {
  const returnable = reservation.items.filter((i) => i.itemStatus === "out");
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(returnable.map((i) => i.id)));
  const [claims, setClaims] = React.useState<ClaimDraft[]>([]);
  const [refundRemaining, setRefundRemaining] = React.useState(true);
  const [method, setMethod] = React.useState<Method>("cash");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ returned: number; claimIds: string[]; settlement: SettlementResult; reservationStatus: string } | null>(null);
  const key = React.useRef(crypto.randomUUID());

  React.useEffect(() => {
    if (open) { setSelected(new Set(returnable.map((i) => i.id))); setClaims([]); setRefundRemaining(true); setMethod("cash"); setError(null); setResult(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const claimTotal = claims.reduce((s, c) => s + parseKRW(c.amount || "0"), 0);

  const submit = async () => {
    if (selected.size === 0 && claims.length === 0) { setError("반납할 항목을 선택하거나 청구를 추가하세요."); return; }
    for (const c of claims) {
      if (!c.description.trim()) { setError("청구 내용을 입력하세요."); return; }
      if (parseKRW(c.amount || "0") <= 0) { setError("청구액은 1원 이상이어야 합니다."); return; }
    }
    if (!window.confirm(`선택 ${selected.size}건 반납 접수${claims.length ? `, 청구 ${claims.length}건(${formatKRW(claimTotal)})` : ""} 후 보증금을 정산합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    setBusy(true); setError(null);
    const r = await inspectReturnAction(businessId, reservation.id, key.current, {
      returnedItemIds: [...selected],
      claims: toInputs(claims),
      refundRemaining,
      method,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    key.current = crypto.randomUUID();
    setResult(r.data);
  };
  // 결함 D5 와 같은 결: 서버 액션의 revalidatePath 로 전부 반납된 데이터가 곧바로 내려와 이 패널이 null 이 되면(returnable 0)
  // 정산 결과 요약이 사라진다 — 결과를 들고 있는 동안은 패널을 유지하고(트리거는 숨김), 닫을 때 새로고침한다.
  const close = () => { setOpen(false); if (result) { setResult(null); onDone(); } };

  if (returnable.length === 0 && !result) return null;
  return (
    <>
      {!result && (
        <Button onClick={() => setOpen(true)}>
          <ClipboardCheck size={15} aria-hidden />반납 검수
        </Button>
      )}
      <Modal
        open={open}
        onClose={close}
        title="반납 검수 · 청구 · 보증금 정산"
        className="sm:max-w-[640px]"
        footer={
          result ? (
            <Button onClick={close}>닫기</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>취소</Button>
              <Button onClick={submit} loading={busy}>{busy ? "처리 중…" : "검수 완료·정산"}</Button>
            </>
          )
        }
      >
        {error && <Alert className="mb-3">{error}</Alert>}
        {result ? (
          <div className="flex flex-col gap-3">
            <Alert kind="success">반납 {result.returned}건 접수{result.claimIds.length ? ` · 청구 ${result.claimIds.length}건 등록` : ""} · 예약 상태 {result.reservationStatus}</Alert>
            <SettlementSummary s={result.settlement} />
            {(result.settlement.additionalDue ?? 0) > 0 && (
              <Alert kind="warning">보증금으로 부족한 {formatKRW(result.settlement.additionalDue ?? 0)}은 아래 정산 카드의 &ldquo;미수금 수납&rdquo;으로 받으세요.</Alert>
            )}
            {result.claimIds.length > 0 && (
              <p className="text-[12.5px] text-t2">청구서 인쇄는 아래 &ldquo;손상·분실 청구&rdquo; 카드에서 건별로 할 수 있습니다.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-t">1. 반납 항목</h3>
              <ul className="flex flex-col divide-y divide-[var(--bd)] rounded-[var(--r-md)] border border-[var(--bd)]">
                {returnable.map((i) => (
                  <li key={i.id}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 text-[13px] hover:bg-sf2">
                      <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="h-[18px] w-[18px] accent-[var(--accent-strong)]" />
                      <span className="min-w-0 flex-1 truncate text-t">{i.productName}{i.skuColor && i.skuSize ? ` · ${i.skuColor}/${i.skuSize}` : ""}</span>
                      <span className="font-mono text-[12px] text-t3">{i.unitCode ?? "미배정"}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-1 text-[13px] font-semibold text-t">2. 손상·분실 청구 <span className="font-normal text-t3">(없으면 비워 두세요)</span></h3>
              <p className="mb-2 text-[12px] text-t3">청구는 원장에 손상비로 잡히고 보증금에서 먼저 차감됩니다. 항목을 지정하면 그 개체는 검수 대기(손상)·분실로 표시됩니다.</p>
              <ClaimRows claims={claims} setClaims={setClaims} items={reservation.items} />
            </section>
            <section className="rounded-[var(--r-md)] bg-sf2 p-3">
              <h3 className="mb-2 text-[13px] font-semibold text-t">3. 보증금 정산</h3>
              <dl className="mb-3 grid grid-cols-3 gap-2 text-[12.5px]">
                <div><dt className="text-[11.5px] text-t3">보증금 잔액</dt><dd className="tabular-nums text-t">{balance ? formatKRW(balance.depositBalance) : "-"}</dd></div>
                <div><dt className="text-[11.5px] text-t3">기존 미수금</dt><dd className="tabular-nums text-t">{balance ? formatKRW(balance.outstanding) : "-"}</dd></div>
                <div><dt className="text-[11.5px] text-t3">이번 청구 합계</dt><dd className="tabular-nums font-medium text-t">{formatKRW(claimTotal)}</dd></div>
              </dl>
              <label className="flex min-h-[44px] items-center gap-2 text-[13px] text-t2">
                <input type="checkbox" checked={refundRemaining} onChange={(e) => setRefundRemaining(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--accent-strong)]" />
                차감 후 남은 보증금을 지금 환불
              </label>
              {refundRemaining && (
                <SelectField label="환불 수단" value={method} onChange={(e) => setMethod(e.target.value as Method)} wrapperClassName="mb-0 mt-1">
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </SelectField>
              )}
            </section>
          </div>
        )}
      </Modal>
    </>
  );
}

/** 확정 예약(출고 전) 취소. 수납·보증금이 있으면 환급 동의가 필요하다(서버 refund_required). */
export function CancelConfirmedButton({
  businessId,
  reservationId,
  hasMoney,
  canRefund,
  onDone,
}: {
  businessId: string;
  reservationId: string;
  /** 수납액 또는 보증금 잔액이 있는가(revenue.read 없으면 알 수 없어 true 로 두고 동의 칸을 보여준다). */
  hasMoney: boolean;
  canRefund: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [refund, setRefund] = React.useState(false);
  const [method, setMethod] = React.useState<Method>("cash");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ masked: boolean; refundedCash: number | null; depositReturned: number | null } | null>(null);
  const key = React.useRef(crypto.randomUUID());

  React.useEffect(() => { if (open) { setReason(""); setRefund(false); setMethod("cash"); setError(null); setResult(null); } }, [open]);

  const submit = async () => {
    if (hasMoney && !refund) { setError("수납액·보증금이 있는 예약은 전액 환급에 동의해야 취소할 수 있습니다."); return; }
    setBusy(true); setError(null);
    const r = await cancelConfirmedReservation(businessId, reservationId, key.current, { reason: reason.trim() || undefined, refund, method });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    key.current = crypto.randomUUID();
    setResult(r.data);
    onDone();
  };

  return (
    <>
      <Button variant="secondary" className="text-et" onClick={() => setOpen(true)}>
        <Ban size={15} aria-hidden />예약 취소
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="확정 예약 취소"
        footer={
          result ? (
            <Button onClick={() => setOpen(false)}>닫기</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>돌아가기</Button>
              <Button variant="danger" onClick={submit} loading={busy}>{busy ? "취소 중…" : "예약 취소 확정"}</Button>
            </>
          )
        }
      >
        {error && <Alert className="mb-3">{error}</Alert>}
        {result ? (
          <div className="flex flex-col gap-2">
            <Alert kind="success">예약이 취소되었습니다. 배정된 개체는 대여가능으로 돌아갔습니다.</Alert>
            {!result.masked && (
              <p className="text-[12.5px] text-t2">현금 환급 {formatKRW(result.refundedCash ?? 0)} · 보증금 반환 {formatKRW(result.depositReturned ?? 0)}</p>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <p className="mb-3 text-[12.5px] leading-relaxed text-t2">출고 전 확정 예약만 취소할 수 있습니다. 취소하면 항목은 취소 상태가 되고 개체 점유가 풀립니다. 되돌릴 수 없습니다.</p>
            <Input label="취소 사유(선택)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 고객 요청, 행사 취소" />
            {hasMoney && (
              <div className="rounded-[var(--r-md)] bg-sf2 p-3">
                <label className="flex min-h-[44px] items-start gap-2 text-[13px] text-t">
                  <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} disabled={!canRefund} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[var(--accent-strong)]" />
                  <span>
                    수납액·보증금을 전액 환급하는 데 동의합니다.
                    {!canRefund && <span className="block text-[12px] text-et">환불 권한(refund)이 없어 이 예약은 취소할 수 없습니다. 관리자에게 요청하세요.</span>}
                  </span>
                </label>
                {refund && (
                  <SelectField label="환급 수단" value={method} onChange={(e) => setMethod(e.target.value as Method)} wrapperClassName="mb-0 mt-1">
                    {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </SelectField>
                )}
              </div>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}

/** 예약 확정·전날 안내 문구 — 복사/공유/문자/전화. 금액은 revenue.read 일 때만 넣는다. */
export function NoticeButton({
  businessName,
  reservation,
  balance,
  tz,
}: {
  businessName: string;
  reservation: ReservationRow;
  balance: ReservationBalance | null;
  tz: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [when, setWhen] = React.useState<"confirmed" | "day_before">("confirmed");
  const rentalFee = balance ? reservation.items.reduce((s, i) => s + i.fee - i.discount, 0) : null;
  const text = rentalReservationNotice(
    {
      businessName,
      customerName: reservation.customerName,
      periodStartIso: reservation.periodStart,
      periodEndIso: reservation.periodEnd,
      fittingAtIso: reservation.fittingAt,
      items: reservation.items.map((i) => ({ label: `${i.productName}${i.skuColor && i.skuSize ? ` ${i.skuColor}/${i.skuSize}` : ""}`, qty: i.qty })),
      rentalFee,
      deposit: balance && balance.depositBalance > 0 ? balance.depositBalance : null,
      tz,
    },
    when
  );
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <MessageSquare size={15} aria-hidden />안내 문구
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="고객 안내 문구" footer={<Button variant="secondary" onClick={() => setOpen(false)}>닫기</Button>}>
        <div className="mb-3 flex gap-1.5" role="tablist">
          {([["confirmed", "예약 확정 안내"], ["day_before", "전날 안내"]] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={when === v}
              onClick={() => setWhen(v)}
              className={"inline-flex h-[32px] items-center rounded-[var(--r-sm)] border px-3 text-[12.5px] font-medium [@media(pointer:coarse)]:h-[44px] " + (when === v ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] text-t2 hover:bg-sf2")}
            >
              {l}
            </button>
          ))}
        </div>
        <MessageActions text={text} phone={reservation.customerPhone ?? undefined} title="문구(수정 가능)" />
      </Modal>
    </>
  );
}

/** 손상·분실 청구 목록 + 개별 청구 추가 + 보증금 정산 + 청구서 인쇄 링크. */
export function ClaimsCard({
  businessId,
  reservation,
  claims,
  balance,
  canWrite,
  canRefund,
  canRevenueRead,
  onChanged,
}: {
  businessId: string;
  reservation: ReservationRow;
  claims: DamageClaimRow[];
  balance: ReservationBalance | null;
  canWrite: boolean;
  canRefund: boolean;
  canRevenueRead: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<ClaimDraft[]>([newClaim()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [settleResult, setSettleResult] = React.useState<SettlementResult | null>(null);
  const settleKey = React.useRef(crypto.randomUUID());

  React.useEffect(() => { if (addOpen) { setDrafts([newClaim()]); setError(null); } }, [addOpen]);

  const submitClaims = async () => {
    const inputs = toInputs(drafts);
    for (const c of inputs) {
      if (!c.description) { setError("청구 내용을 입력하세요."); return; }
      if (c.amount <= 0) { setError("청구액은 1원 이상이어야 합니다."); return; }
    }
    setBusy(true); setError(null);
    // 여러 건은 순차 등록 — 멱등키는 초안(d.key)마다 고정한다. 중간 실패 후 재시도해도 이미 등록된
    // 건은 같은 키로 흡수되고, 성공한 초안은 목록에서 빼서 실패한 건만 다시 보낸다(이중 청구 방지).
    for (let i = 0; i < drafts.length; i++) {
      const r = await claimDamageAction(businessId, reservation.id, inputs[i], drafts[i].key);
      if (!r.ok) {
        const doneKeys = new Set(drafts.slice(0, i).map((d) => d.key));
        setDrafts((ds) => ds.filter((d) => !doneKeys.has(d.key)));
        setBusy(false); setError(r.message); if (i > 0) onChanged(); return;
      }
    }
    setBusy(false);
    setAddOpen(false);
    setNotice(`청구 ${inputs.length}건을 등록했습니다.`);
    onChanged();
  };

  const settle = async () => {
    // 일부 반납(partial_return) 상태는 서버가 차감만 하고 현금 환불은 하지 않는다(0025 F12) — 확인 문구도 그 규칙을 따른다.
    const partial = reservation.status === "partial_return";
    const msg = partial
      ? "아직 반납되지 않은 항목이 있어, 미수금(손상·연체·대여료)만 보증금에서 차감합니다. 남은 보증금 환불은 모든 항목이 반납된 뒤에 할 수 있습니다. 되돌릴 수 없습니다. 계속할까요?"
      : "미수금(손상·연체·대여료)을 보증금에서 차감하고 남은 보증금을 환불합니다. 되돌릴 수 없습니다. 계속할까요?";
    if (!window.confirm(msg)) return;
    setBusy(true); setError(null); setSettleResult(null);
    const r = await settleDepositAction(businessId, reservation.id, settleKey.current, { refundRemaining: true, method: "cash" });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    settleKey.current = crypto.randomUUID();
    setSettleResult(r.data);
    onChanged();
  };

  const canSettle = canWrite && canRefund && !!balance && (balance.outstanding > 0 || balance.depositBalance > 0) && ["returned", "partial_return", "closed"].includes(reservation.status);

  return (
    <>
      <CardHead
        title="손상·분실 청구"
        description={claims.length ? `${claims.length}건 · 청구서는 건별로 인쇄합니다.` : "반납 검수에서 등록한 청구가 여기 쌓입니다."}
        action={
          canWrite && canRevenueRead ? (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus size={13} aria-hidden />청구 추가
            </Button>
          ) : undefined
        }
      />
      {error && !addOpen && <Alert className="mb-3">{error}</Alert>}
      {notice && <Alert kind="success" className="mb-3">{notice}</Alert>}
      {settleResult && (
        <div className="mb-3 rounded-[var(--r-md)] bg-sf2 p-3">
          <p className="mb-2 text-[12.5px] font-medium text-t">보증금 정산 결과</p>
          <SettlementSummary s={settleResult} />
        </div>
      )}
      {claims.length === 0 ? (
        <p className="text-[12.5px] text-t3">등록된 청구가 없습니다.</p>
      ) : (
        /* relative: 마지막 열의 sr-only(absolute) 제목이 static 래퍼 밖(뷰포트)을 기준으로 잡혀
           360px 에서 문서를 140px 넓히던 결함. 스크롤 래퍼를 containing block 으로 만든다. */
        <div className="relative -mx-4 overflow-x-auto px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:-mx-5 sm:px-5" tabIndex={0} role="region" aria-label="손상·분실 청구 표(가로 스크롤)">
          <table className={`${TABLE} min-w-[560px]`}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>종류</th>
                <th className={TH}>내용</th>
                <th className={`${TH} text-right`}>금액</th>
                <th className={TH}>등록일</th>
                <th className={TH}><span className="sr-only">인쇄</span></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className={`${TR} h-[48px]`}>
                  <td className={TD}><Badge kind={c.kind === "missing" ? "error" : c.kind === "damaged" ? "warning" : "info"}>{CLAIM_KIND_LABEL[c.kind]}</Badge></td>
                  <td className={TD}>
                    <span className="block max-w-[320px] truncate text-t" title={c.description}>{c.description}</span>
                    {c.reason && <span className="block truncate text-[11.5px] text-t3">{c.reason}</span>}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-t`}>{c.amount == null ? <span className="text-t3">비공개</span> : formatKRW(c.amount)}</td>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-t3`}>{formatInTz(c.createdAt, DEFAULT_TZ, "yyyy. M. d.")}</td>
                  <td className={`${TD} text-right`}>
                    <Link
                      href={`/w/${businessId}/reservations/${reservation.id}/claims/${c.id}/print`}
                      className="inline-flex h-[32px] items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]"
                    >
                      <Printer size={13} aria-hidden />청구서
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canSettle && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2/40 px-3.5 py-3">
          <p className="text-[12.5px] text-t2">
            미수금 <span className="font-semibold tabular-nums text-et">{formatKRW(balance!.outstanding)}</span> · 보증금 잔액 <span className="font-semibold tabular-nums text-t">{formatKRW(balance!.depositBalance)}</span>
          </p>
          <Button size="sm" onClick={settle} loading={busy}>{reservation.status === "partial_return" ? "보증금에서 차감" : "보증금 차감·환불"}</Button>
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="손상·분실 청구 추가"
        className="sm:max-w-[640px]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={submitClaims} loading={busy} disabled={drafts.length === 0}>{busy ? "등록 중…" : `청구 ${drafts.length}건 등록`}</Button>
          </>
        }
      >
        {error && <Alert className="mb-3">{error}</Alert>}
        <p className="mb-3 text-[12.5px] text-t2">청구는 원장에 손상비로 잡힙니다. 보증금 차감은 아래 &ldquo;보증금 차감·환불&rdquo;에서 따로 확정합니다.</p>
        <ClaimRows claims={drafts} setClaims={setDrafts} items={reservation.items} />
      </Modal>
    </>
  );
}
