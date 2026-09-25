"use client";

/**
 * 확정 예약 취소(0027 정책 기반). 귀책(손님/매장) → 서버 견적(단계·비율·위약금/배상·환급·보증금 반환) 미리보기 →
 * 금액 직접 수정(사유 필수)·수단 선택 → 실행. 기준 시각은 서버 now() — 브라우저 시각을 보내지 않는다(계약 변경 2026-09-25).
 * 견적과 실행 사이에 구간이 바뀌면 서버가 재견적 오류를 내고, 화면은 견적을 다시 받아 보여준다.
 * 공정위 소비자분쟁해결기준(단기 물품대여) 표는 사업장 규정(getCancelPolicy)을 작게 함께 보여준다.
 */
import * as React from "react";
import { Ban } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Alert, SelectField, CONTROL } from "./listkit";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { CANCEL_CAUSE_LABEL, PAY_METHOD_LABEL, type CancelCause, type CancelPolicy, type CancelQuote, type CancelTier, type PayMethod } from "@/lib/domain/rental-money-types";
import { getCancelQuoteAction } from "@/lib/domain/rental-money-queries";
import { tierLabel, sameTier, sortTiers, isDefaultPolicy } from "./cancel-tier";

import { cancelWithPenaltyAction } from "@/lib/domain/rental-money-actions";

const METHODS = Object.keys(PAY_METHOD_LABEL) as PayMethod[];

export function CancelPenaltyButton({
  businessId,
  reservationId,
  policy,
  canRefund,
  isOwner = false,
  onResult,
  onDone,
}: {
  businessId: string;
  reservationId: string;
  policy: CancelPolicy | null;
  /** 돈이 움직이면 서버가 refund 캡을 요구한다 — 없으면 실행 버튼을 막고 이유를 보여준다. */
  canRefund: boolean;
  /** 사업자 귀책 배상을 대여료 100% 초과로 직접 입력하는 것은 대표(owner)만(서버가 재검사). */
  isOwner?: boolean;
  /** 취소 성공 직후(결과 요약을 보여주는 동안) — 부모는 이 버튼을 계속 마운트해 둬야 한다(결함 D5). */
  onResult?: () => void;
  /** 결과 요약을 닫을 때(부모가 새로고침·마운트 해제). */
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [cause, setCause] = React.useState<CancelCause>("customer");
  const [limitToPaid, setLimitToPaid] = React.useState(true);
  const [override, setOverride] = React.useState("");
  const [useOverride, setUseOverride] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [method, setMethod] = React.useState<PayMethod>("transfer");
  const [quote, setQuote] = React.useState<CancelQuote | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ masked: boolean; quote: CancelQuote | null } | null>(null);
  const [quoteVersion, setQuoteVersion] = React.useState(0);
  const key = React.useRef(crypto.randomUUID());

  const overrideAmount = useOverride && override !== "" ? parseKRW(override) : null;

  React.useEffect(() => {
    if (!open) return;
    setCause("customer"); setLimitToPaid(true); setOverride(""); setUseOverride(false); setReason(""); setMethod("transfer");
    setQuote(null); setError(null); setResult(null);
  }, [open]);

  // 귀책·한도·직접입력이 바뀔 때마다 서버 견적을 다시 받는다(입력 중 과호출은 300ms 디바운스). 기준 시각은 서버.
  React.useEffect(() => {
    if (!open || result) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await getCancelQuoteAction(businessId, reservationId, cause, { overrideAmount, limitToPaid });
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) { setError(r.message); setQuote(null); return; }
      setError(null); setQuote(r.data);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, result, businessId, reservationId, cause, overrideAmount, limitToPaid, quoteVersion]);

  const overBaseFee = cause === "business" && overrideAmount != null && quote?.baseFee != null && overrideAmount > quote.baseFee;
  const ownerOnlyBlock = overBaseFee && !isOwner;

  const moneyMoves = !!quote && !quote.masked && ((quote.totalPayout ?? 0) > 0 || (quote.penalty ?? 0) > 0 || (quote.compensation ?? 0) > 0 || (quote.chargesToVoid ?? 0) > 0);
  // 결함 D3: 견적이 masked(revenue.read 없음)면 돈이 움직이는지 화면이 알 수 없다 — refund 캡이 없으면 서버가 거부하므로 실행을 막고 이유를 보여준다.
  const refundBlock = !canRefund && (moneyMoves || !!quote?.masked);
  const refundWhy = !canRefund && quote?.masked
    ? "금액 조회 권한(revenue.read)이 없어 돈이 움직이는지 확인할 수 없습니다. 환불 권한(refund)이 있는 관리자에게 요청하세요."
    : "환불 권한(refund)이 없어 돈이 움직이는 취소는 할 수 없습니다. 관리자에게 요청하세요.";
  // 결함 D5: 서버 액션의 revalidatePath 로 '취소' 상태가 곧바로 내려오면 부모가 이 버튼을 내려 결과 요약이 사라졌다 —
  // 성공 시 onResult 로 부모에게 "유지"를 알리고, 닫을 때 onDone 으로 새로고침·해제한다.
  const close = () => { setOpen(false); if (result) onDone(); };
  const submit = async () => {
    if (overrideAmount != null && !reason.trim()) { setError("금액을 직접 정하면 사유를 입력해야 합니다."); return; }
    if (ownerOnlyBlock) { setError("대여료(100%)를 넘는 배상금은 사업장 대표(owner)만 정할 수 있습니다."); return; }
    if (!quote) { setError("견적을 먼저 확인하세요."); return; }
    if (!window.confirm("예약을 취소하고 위약금·환급을 원장에 기록합니다. 개체 점유가 풀리며 되돌릴 수 없습니다. 계속할까요?")) return;
    setBusy(true); setError(null);
    // asOf 는 보내지 않는다(서버 now()). 직전 견적의 rate 를 expectedRate 로 보내고, 단계가 바뀌었으면(quote_stale) 그때만 자동 재견적(계약 v2 §5).
    const r = await cancelWithPenaltyAction(businessId, reservationId, {
      cause, idempotencyKey: key.current, expectedRate: quote.rate, overrideAmount, limitToPaid, method, reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); if (r.hint === "quote_stale") setQuoteVersion((v) => v + 1); return; }
    key.current = crypto.randomUUID();
    setResult({ masked: r.data.masked, quote: r.data.quote });
    onResult?.();
  };

  const tiers = policy ? (cause === "customer" ? policy.customerTiers : policy.businessTiers) : [];

  return (
    <>
      {!result && (
        <Button variant="secondary" className="text-et" onClick={() => setOpen(true)}>
          <Ban size={15} aria-hidden />예약 취소
        </Button>
      )}
      <Modal
        open={open}
        onClose={close}
        title="확정 예약 취소 · 위약금 계산"
        className="sm:max-w-[640px]"
        footer={
          result ? (
            <Button onClick={close}>닫기</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>돌아가기</Button>
              <Button variant="danger" onClick={submit} loading={busy} disabled={loading || !quote || refundBlock || ownerOnlyBlock} title={refundBlock ? refundWhy : ownerOnlyBlock ? "대여료를 넘는 배상금은 대표만 정할 수 있습니다." : undefined}>
                {busy ? "취소 중…" : "예약 취소 확정"}
              </Button>
            </>
          )
        }
      >
        {error && <Alert className="mb-3">{error}</Alert>}
        {result ? (
          <div className="flex flex-col gap-2">
            <Alert kind="success">예약이 취소되었습니다. 배정된 개체는 대여가능으로 돌아갔습니다.</Alert>
            {!result.masked && result.quote && (
              <section className="rounded-[var(--r-md)] bg-sf2 p-3">
                <p className="mb-2 text-[12px] text-t2">원장에 기록된 내용입니다. 닫으면 정산 카드가 새로 고쳐집니다.</p>
                <QuoteSummary q={result.quote} />
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-1.5" role="tablist" aria-label="귀책">
              {(Object.keys(CANCEL_CAUSE_LABEL) as CancelCause[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={cause === c}
                  onClick={() => setCause(c)}
                  className={"inline-flex h-[36px] flex-1 items-center justify-center rounded-[var(--r-sm)] border px-3 text-[12.5px] font-medium [@media(pointer:coarse)]:h-[44px] " + (cause === c ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] text-t2 hover:bg-sf2")}
                >
                  {c === "customer" ? "손님 사정(소비자 귀책)" : "매장 사정(사업자 귀책)"}
                </button>
              ))}
            </div>

            {loading && !quote ? (
              <p className="py-3 text-center text-[12.5px] text-t3">위약금을 계산하는 중…</p>
            ) : quote ? (
              <section className="rounded-[var(--r-md)] bg-sf2 p-3">
                <p className="mb-2 text-[12.5px] text-t2">
                  사용 예정일 {formatInTz(quote.useDate, DEFAULT_TZ, "M. d.")} 기준 <span className="font-semibold text-t">{quote.daysBefore >= 0 ? `${quote.daysBefore}일 전` : `${-quote.daysBefore}일 지남`}</span>
                  {quote.withinContractGrace && <span className="ml-1 rounded-[4px] bg-okb px-1.5 py-0.5 text-[11px] font-medium text-okt">계약 후 {quote.contractGraceHours}시간 이내 · 위약금 없음</span>}
                  {" · "}적용 비율 <span className="font-semibold text-t">{quote.rate}%</span>
                  {(quote.policyIsDefault || isDefaultPolicy(policy)) && <span className="ml-1 text-[11px] text-t3">(공정위 기본 기준)</span>}
                </p>
                {quote.masked ? (
                  <p className="text-[12.5px] text-t3">금액은 매출·정산 조회 권한(revenue.read)이 있어야 표시됩니다.</p>
                ) : (
                  <QuoteSummary q={quote} />
                )}
              </section>
            ) : null}

            {quote && !quote.masked && (
              <section className="flex flex-col gap-2.5">
                <label className="flex min-h-[44px] items-center gap-2 text-[13px] text-t">
                  <input type="checkbox" checked={useOverride} onChange={(e) => { setUseOverride(e.target.checked); if (!e.target.checked) setOverride(""); }} className="h-[18px] w-[18px] accent-[var(--accent-strong)]" />
                  {cause === "customer" ? "위약금" : "배상금"}을 직접 정하기(사유 필수)
                </label>
                {useOverride && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11.5px] text-t2">
                      금액(원)
                      <input value={override} onChange={(e) => setOverride(e.target.value)} inputMode="numeric" placeholder={String(quote.computedAmount ?? 0)} className={CONTROL} />
                    </label>
                    <Input label="사유" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 단골 배려 · 재대여 약속" wrapperClassName="mb-0" />
                  </div>
                )}
                {cause === "customer" && (
                  <label className="flex min-h-[44px] items-start gap-2 text-[13px] text-t">
                    <input type="checkbox" checked={limitToPaid} onChange={(e) => setLimitToPaid(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[var(--accent-strong)]" />
                    <span>
                      받은 돈(보증금 제외) 한도까지만 공제
                      <span className="block text-[11.5px] text-t3">체크 해제하면 부족분이 미수금으로 남아 미수금 보드에 뜹니다.</span>
                    </span>
                  </label>
                )}
                {!useOverride && (
                  <Input label="취소 사유(선택)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 고객 요청, 행사 취소" wrapperClassName="mb-0" />
                )}
                {(quote.totalPayout ?? 0) > 0 && (
                  <SelectField label="환급 수단" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} wrapperClassName="mb-0">
                    {METHODS.map((m) => <option key={m} value={m}>{PAY_METHOD_LABEL[m]}</option>)}
                  </SelectField>
                )}
                {ownerOnlyBlock && <Alert kind="warning">대여료(100%)를 넘는 배상금은 사업장 대표(owner)만 정할 수 있습니다.</Alert>}
              </section>
            )}
            {refundBlock && <Alert kind="warning">{refundWhy}</Alert>}

            {tiers.length > 0 && <TierTable tiers={tiers} cause={cause} active={quote?.tier ?? null} isDefault={isDefaultPolicy(policy)} />}
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * 결함 D2: 서버 견적(계약 §5)에서 refund_cash 는 보증금을 포함한 "손님에게 실제로 돌려줄 현금"이고 deposit_returned 는
 * 그 안에 든 보증금 몫(원장 deposit_out, 현금 이동 아님)이다. 사업자 귀책의 total_payout = refund_cash + compensation.
 * 그래서 총액 한 줄을 굵게 두고 그 아래를 '포함' 내역으로만 적어 어떤 줄도 더해지는 것처럼 보이지 않게 한다.
 */
function QuoteSummary({ q }: { q: CancelQuote }) {
  const n = (v: number | null | undefined) => v ?? 0;
  const paidFee = n(q.paidFee), penalty = n(q.penalty), dep = n(q.depositReturned), refund = n(q.refundCash), forfeited = n(q.depositForfeited);
  // 소비자 귀책: refund = max(paidFee + dep − penalty, 0). 대여료 몫을 먼저 채우고 나머지가 보증금 몫(한도 해제 시 보증금이 위약금 부족분을 메울 수 있다).
  const feeRefund = Math.max(paidFee - penalty, 0);
  const depositRefund = Math.max(refund - feeRefund, 0);
  const depositUsed = Math.max(dep - depositRefund, 0);
  const customer = q.cause === "customer";
  const totalLabel = customer ? "손님에게 돌려줄 현금" : "손님에게 지급할 현금(총액)";
  const total = customer ? refund : n(q.totalPayout);
  const rows: { k: string; v: number; sub?: boolean; note?: string; cls?: string }[] = customer
    ? [
        { k: "포함 · 대여료 환급", v: feeRefund, sub: true, note: `받은 대여료 ${formatKRW(paidFee)} − 위약금 공제 ${formatKRW(penalty)}` },
        { k: "포함 · 보증금 반환", v: depositRefund, sub: true, note: depositUsed > 0 ? `보관 보증금 ${formatKRW(dep)} 중 ${formatKRW(depositUsed)}은 위약금 부족분에 충당` : undefined },
        ...(n(q.receivableLeft) > 0 ? [{ k: "남는 미수(손님이 더 낼 돈)", v: n(q.receivableLeft), cls: "text-et" }] : []),
      ]
    : [
        { k: "포함 · 받은 돈 전액 환급", v: refund, sub: true, note: `대여료 ${formatKRW(paidFee)} + 보증금 ${formatKRW(dep)}` },
        { k: "포함 · 배상금", v: n(q.compensation), sub: true, note: `계약 대여료 ${formatKRW(n(q.baseFee))}의 ${q.rate}%${q.overrideAmount != null ? " 대신 직접 입력" : ""}` },
      ];
  const basis = customer
    ? `계약 대여료 ${formatKRW(n(q.baseFee))} · 위약금 ${formatKRW(n(q.effectiveAmount))}(${q.overrideAmount != null ? "직접 입력" : `${q.rate}%`})${penalty !== n(q.effectiveAmount) ? ` → 실제 공제 ${formatKRW(penalty)}(받은 대여료 한도)` : ""}`
    : `계약 대여료 ${formatKRW(n(q.baseFee))} · 배상 비율 ${q.rate}%`;
  return (
    <dl className="flex flex-col text-[12.5px]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--bd)] pb-1.5">
        <dt className="font-semibold text-t">{totalLabel}</dt>
        <dd className={"text-[16px] font-bold tabular-nums " + (total > 0 ? "text-okt" : "text-t")}>{formatKRW(total)}</dd>
      </div>
      {rows.map((r) => (
        <div key={r.k} className={"flex items-baseline justify-between gap-3 py-1 " + (r.sub ? "pl-3" : "")}>
          <dt className={r.sub ? "text-t2" : "font-medium text-t"}>
            {r.k}
            {r.note && <span className="block text-[11px] text-t3">{r.note}</span>}
          </dt>
          <dd className={"shrink-0 tabular-nums " + (r.cls ?? (r.sub ? "text-t2" : "text-t"))}>{formatKRW(r.v)}</dd>
        </div>
      ))}
      <div className="mt-1 border-t border-[var(--bd)] pt-1.5 text-[11px] text-t3">
        <dt className="sr-only">산정 근거</dt>
        <dd>{basis}{forfeited > 0 ? ` · 이미 몰수한 보증금 ${formatKRW(forfeited)}은 돌려주지 않습니다` : ""}</dd>
      </div>
    </dl>
  );
}

function TierTable({ tiers, cause, active, isDefault }: { tiers: CancelTier[]; cause: CancelCause; active: CancelQuote["tier"] | null; isDefault: boolean }) {
  const sorted = sortTiers(tiers);
  return (
    <details className="text-[12px] text-t2">
      <summary className="cursor-pointer select-none py-1 text-t3">
        {cause === "customer" ? "위약금" : "배상"} 단계표{isDefault ? " (공정위 소비자분쟁해결기준 · 단기 물품대여)" : " (사업장 규정)"}
      </summary>
      <table className="mt-1 w-full border-collapse">
        <tbody>
          {sorted.map((t, i) => (
            <tr key={i} className={"border-b border-[var(--bd)] last:border-b-0 " + (sameTier(active, t) ? "font-semibold text-[var(--accent-ink)]" : "")}>
              <td className="py-1 pr-3">{tierLabel(t, cause)}</td>
              <td className="py-1 text-right tabular-nums">대여료의 {t.rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-t3">계약 후 24시간 이내 취소는 0%. 남은 기간 = 사용 예정일 − 오늘(서버 기준). &lsquo;개월&rsquo;은 달력 기준입니다.</p>
    </details>
  );
}
