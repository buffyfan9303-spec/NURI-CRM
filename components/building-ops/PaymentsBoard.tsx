"use client";

/**
 * 수납 확인: 입금 등록(자동 배정·선납·중복 거래키 거부) / 미배정 입금의 채권 배정(부분납) / 입금 취소(역분개, 사유 필수).
 * 배정·잔액·중복 판정은 전부 서버 RPC 가 한다. 화면의 후보 추천과 기본 금액은 제안일 뿐이다.
 */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, SelectField, SummaryStrip, TABLE, THEAD, TH, TR, TD, CONTROL } from "@/components/rental/listkit";
import { BankBulkImport } from "./BankBulkImport";
import { allocatePayment, recordPayment, reversePayment, setPaymentUnit } from "@/lib/domain/building-actions";
import type { PaymentMethod, PaymentResult } from "@/lib/domain/building-types";
import type { PaymentLine } from "@/lib/domain/building-types";
import { candidatesFor, defaultAllocAmount, type OpenRec } from "./payment-candidates";
import { useRunAction } from "./client-common";
import { won } from "./format";

const METHOD_LABEL: Record<PaymentMethod, string> = { transfer: "계좌이체", cash: "현금", card: "카드", virtual_account: "가상계좌", auto_debit: "자동이체", other: "기타" };

export interface PaymentsBoardProps {
  businessId: string;
  buildingId: string;
  units: { id: string; label: string }[];
  payments: PaymentLine[];
  recs: (OpenRec & { unitLabel: string })[];
  partyNames: Record<string, string>;
  /** 호실 없이 등록했지만 채권에 배정된 입금 → 배정된 호실 id */
  allocUnit: Record<string, string>;
  canAllocate: boolean;
  today: string;
  tz: string;
}

const digits = (s: string) => Number(s.replace(/[,\s]/g, ""));
const validAmount = (s: string) => /^[\d,\s]+$/.test(s) && Number.isInteger(digits(s)) && digits(s) > 0;

export function PaymentsBoard(p: PaymentsBoardProps) {
  const [filter, setFilter] = React.useState<"all" | "unallocated" | "reversed">("all");
  const unalloc = p.payments.filter((x) => x.unallocated > 0);
  const unallocSum = unalloc.reduce((s, x) => s + x.unallocated, 0);
  const rows = p.payments.filter((x) => (filter === "unallocated" ? x.unallocated > 0 : filter === "reversed" ? !!x.reversed_by || !!x.reversal_of : true));
  const [openRow, setOpenRow] = React.useState<{ id: string; mode: "alloc" | "reverse" | "unit" } | null>(null);

  return (
    <div className="space-y-4">
      <SummaryStrip
        items={[
          { label: "최근 입금 건수", value: `${p.payments.filter((x) => (x.amount ?? 0) > 0 && !x.reversed_by).length}건` },
          { label: "호실 미지정 입금", value: unalloc.length ? `${unalloc.length}건 · ${won(unallocSum)}` : "없음", tone: unalloc.length ? "danger" : "success", hint: "입금은 됐지만 아직 어느 청구에도 넣지 않은 돈" },
          { label: "미수금", value: `${p.recs.length}건 · ${won(p.recs.reduce((s, r) => s + r.outstanding, 0))}` },
        ]}
      />
      {p.canAllocate ? <><BankBulkImport businessId={p.businessId} buildingId={p.buildingId} units={p.units} tz={p.tz} /><PaymentForm {...p} /></> : <Alert kind="warning">입금 등록과 배정은 수납 배정 권한이 있는 담당자만 할 수 있습니다. 지금은 조회만 됩니다.</Alert>}

      <Card className="p-4 sm:p-5">
        <CardHead
          title="입금 내역"
          description="최근 500건까지 보입니다. 취소된 입금은 지우지 않고 취소 기록을 남깁니다."
          action={
            <div className="flex gap-1" role="group" aria-label="입금 필터">
              {([["all", "전체"], ["unallocated", `호실 미지정 ${unalloc.length}`], ["reversed", "취소"]] as const).map(([k, l]) => (
                <Button key={k} type="button" size="sm" variant={filter === k ? "primary" : "secondary"} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</Button>
              ))}
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title={filter === "all" ? "등록된 입금이 없습니다." : "조건에 맞는 입금이 없습니다."} description={filter === "all" && p.canAllocate ? "위 입금 등록에서 첫 입금을 등록하세요." : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>입금일</th><th className={TH}>호실</th><th className={TH}>입금자</th><th className={TH}>방법</th>
                  <th className={`${TH} text-right`}>금액</th><th className={`${TH} text-right`}>청구 충당</th><th className={`${TH} text-right`}>선납금</th><th className={TH}>상태</th>
                  {p.canAllocate && <th className={TH}><span className="sr-only">작업</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const live = (x.amount ?? 0) > 0 && !x.reversed_by;
                  const isOpen = openRow?.id === x.id;
                  return (
                    <React.Fragment key={x.id}>
                      <tr className={TR}>
                        <td className={`${TD} tabular-nums`}>{x.paid_at.slice(0, 10)}</td>
                        <td className={TD}>
                          {p.units.find((u) => u.id === x.unit_id)?.label ?? (p.allocUnit[x.id] ? <span>{p.units.find((u) => u.id === p.allocUnit[x.id])?.label ?? "배정 호실"}<span className="ml-1 text-[length:var(--fs-meta)] text-t3">(배정)</span></span> : (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-t3">미지정</span>
                              {p.canAllocate && live && !x.unit_id && x.allocated === 0 && x.credit === 0 && (
                                <Button type="button" size="sm" variant="ghost" aria-expanded={isOpen && openRow?.mode === "unit"} onClick={() => setOpenRow(isOpen && openRow?.mode === "unit" ? null : { id: x.id, mode: "unit" })}>호실 지정</Button>
                              )}
                            </span>
                          ))}
                        </td>
                        <td className={TD}>{x.payer_name ?? "—"}</td>
                        <td className={TD}>{METHOD_LABEL[x.method]}</td>
                        <td className={`${TD} text-right tabular-nums`}>{won(x.amount)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{live ? won(x.allocated) : "-"}</td>
                        <td className={`${TD} text-right tabular-nums`}>{live && x.credit > 0 ? won(x.credit) : "-"}</td>
                        <td className={TD}>
                          {(x.amount ?? 0) < 0 ? <Badge kind="info">취소한 기록</Badge>
                            : x.reversed_by ? <Badge kind="info">취소됨</Badge>
                            : x.unallocated > 0 ? <Badge kind="warning">{`미배정 ${won(x.unallocated)}`}</Badge>
                            : x.credit > 0 ? <Badge kind="info">선납금 포함</Badge>
                            : <Badge kind="success">호실 배정</Badge>}
                        </td>
                        {p.canAllocate && (
                          <td className={`${TD} whitespace-nowrap text-right`}>
                            {x.unallocated > 0 && <Button type="button" size="sm" variant="secondary" aria-expanded={isOpen && openRow?.mode === "alloc"} onClick={() => setOpenRow(isOpen && openRow?.mode === "alloc" ? null : { id: x.id, mode: "alloc" })}>호실에 넣기</Button>}{" "}
                            {live && <Button type="button" size="sm" variant="ghost" aria-expanded={isOpen && openRow?.mode === "reverse"} onClick={() => setOpenRow(isOpen && openRow?.mode === "reverse" ? null : { id: x.id, mode: "reverse" })}>입금 취소</Button>}
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-[var(--bd)] bg-sf2/40">
                          <td colSpan={p.canAllocate ? 9 : 8} className="px-3 py-4">
                            {openRow?.mode === "alloc"
                              ? <AllocPanel businessId={p.businessId} pay={x} recs={p.recs} partyNames={p.partyNames} onDone={() => setOpenRow(null)} />
                              : openRow?.mode === "unit"
                                ? <UnitPanel businessId={p.businessId} pay={x} units={p.units} onDone={() => setOpenRow(null)} />
                                : <ReversePanel businessId={p.businessId} pay={x} onDone={() => setOpenRow(null)} />}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PaymentForm(p: PaymentsBoardProps) {
  const { run, pending, error, setError } = useRunAction();
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(p.today);
  const [method, setMethod] = React.useState<PaymentMethod>("transfer");
  const [payer, setPayer] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [key, setKey] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [auto, setAuto] = React.useState(true);
  const [dup, setDup] = React.useState(false);
  const [result, setResult] = React.useState<PaymentResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null); setDup(false); setError(null);
    const r = await run(
      () => recordPayment(p.businessId, p.buildingId, {
        amount: digits(amount), paid_at: `${date} 12:00`, method,
        payer_name: payer.trim() || undefined, external_key: key.trim() || undefined, unit_id: unit || null, memo: memo.trim() || undefined, auto_allocate: auto,
      }),
      { success: "입금을 등록했습니다." }
    );
    if (r.ok) { setResult(r.data); setAmount(""); setPayer(""); setKey(""); setMemo(""); }
    else if (r.hint === "duplicate_payment") setDup(true);
  }
  const noUnit = unit === "";
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="입금 등록" description="호실을 고르면 오래된 미납부터 자동으로 충당하고, 남은 금액은 선납금이 됩니다. 호실을 모르면 비워 두고 아래 내역에서 호실에 배정하세요." />
      <form onSubmit={submit} className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Input label="입금액(원)" required inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right tabular-nums" wrapperClassName="w-full sm:max-w-[14rem]" placeholder="1,000,000" error={amount && !validAmount(amount) ? "1원 이상의 정수로 입력하세요." : undefined} />
        <Input label="입금일" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="tabular-nums" wrapperClassName="w-full sm:max-w-[11rem]" />
        <SelectField label="입금 방법" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} wrapperClassName="w-full sm:w-auto sm:min-w-[8rem]">
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </SelectField>
        <SelectField label="호실" value={unit} onChange={(e) => setUnit(e.target.value)} wrapperClassName="w-full sm:w-auto sm:min-w-[10rem]">
          <option value="">호실 모름(호실 미지정)</option>
          {p.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </SelectField>
        <Input label="입금자명" value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={40} wrapperClassName="w-full sm:max-w-[16rem]" />
        <Input label="거래키(은행 거래번호, 선택)" value={key} onChange={(e) => setKey(e.target.value)} maxLength={80} wrapperClassName="w-full sm:max-w-[14rem]" />
        <Input label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={120} wrapperClassName="w-full sm:max-w-[24rem]" />
        <div className="w-full">
          <label className="mb-3 flex min-h-[44px] cursor-pointer items-center gap-2 text-[length:var(--fs-body)] text-t">
            <input type="checkbox" className="h-5 w-5" checked={auto && !noUnit} disabled={noUnit} onChange={(e) => setAuto(e.target.checked)} />
            오래된 미납부터 자동으로 충당하기{noUnit ? "(호실을 고르면 사용)" : ""}
          </label>
          {dup && <Alert kind="warning" className="mb-3">같은 거래키의 입금이 이미 있어 저장하지 않았습니다. 다른 거래라면 거래키를 바꾸거나 비우고 다시 등록하세요.</Alert>}
          {error && <Alert kind="error" className="mb-3">{error}</Alert>}
          {result && <ResultNote r={result} />}
          <Button type="submit" loading={pending} disabled={!validAmount(amount) || !date}>입금 등록</Button>
        </div>
      </form>
    </Card>
  );
}

function ResultNote({ r }: { r: PaymentResult }) {
  return (
    <Alert kind="success" className="mb-3">
      <span className="block">입금을 등록했습니다.</span>
      {r.allocated.length > 0 && <span className="block tabular-nums">청구에 채움: {r.allocated.map((a) => `${a.period} ${won(a.amount)}`).join(", ")}</span>}
      {r.credit_amount > 0 && <span className="block tabular-nums">남은 {won(r.credit_amount)}은 선납금으로 쌓였습니다.</span>}
      {r.unallocated > 0 && <span className="block tabular-nums">{won(r.unallocated)}은 아직 충당하지 않았습니다. 아래 내역에서 호실에 배정하세요.</span>}
    </Alert>
  );
}

function AllocPanel({ businessId, pay, recs, partyNames, onDone }: { businessId: string; pay: PaymentLine; recs: PaymentsBoardProps["recs"]; partyNames: Record<string, string>; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [needSkip, setNeedSkip] = React.useState(false);
  const [errHint, setErrHint] = React.useState<string | undefined>();
  const [skipReason, setSkipReason] = React.useState("");
  const cands = React.useMemo(() => candidatesFor(pay, recs, (id) => (id ? partyNames[id] ?? null : null)), [pay, recs, partyNames]);
  const candIds = new Set(cands.map((c) => c.id));
  const [rid, setRid] = React.useState(cands[0]?.id ?? "");
  const rec = recs.find((r) => r.id === rid);
  const [amt, setAmt] = React.useState(cands[0] ? String(defaultAllocAmount(pay.unallocated, cands[0].outstanding)) : "");
  const pick = (id: string) => {
    setRid(id); setNeedSkip(false); setErrHint(undefined);
    const r = recs.find((x) => x.id === id);
    setAmt(r ? String(defaultAllocAmount(pay.unallocated, r.outstanding)) : "");
  };
  const label = (r: PaymentsBoardProps["recs"][number]) => `${r.unitLabel} · ${r.period} · 잔액 ${won(r.outstanding)}${r.party_id && partyNames[r.party_id] ? ` · ${partyNames[r.party_id]}` : ""}`;
  return (
    <div className="max-w-[720px]">
      <p className="mb-2 text-[length:var(--fs-body)] text-t">아직 청구에 넣지 않은 <b className="tabular-nums">{won(pay.unallocated)}</b>을 어느 충당할지 고르세요. 넣는 금액이 남은 금액보다 작으면 나머지는 계속 미수금으로 남습니다.</p>
      {recs.length === 0 ? (
        <Alert kind="warning">미수금이 없습니다. 관리비를 승인한 뒤에 넣을 수 있고, 호실을 정해 등록하면 선납금으로 쌓입니다.</Alert>
      ) : (
        <div className="grid gap-x-4 sm:grid-cols-[1fr_180px]">
          <div>
            <label htmlFor={`rec-${pay.id}`} className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">넣을 청구</label>
            <select id={`rec-${pay.id}`} className={`${CONTROL} mb-1`} value={rid} onChange={(e) => pick(e.target.value)}>
              <option value="">선택하세요</option>
              {cands.length > 0 && <optgroup label="추천">{cands.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</optgroup>}
              <optgroup label="전체 미수금">{recs.filter((r) => !candIds.has(r.id)).map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}</optgroup>
            </select>
            <p className="mb-3 text-[length:var(--fs-meta)] text-t3">{cands.find((c) => c.id === rid)?.why.join(" · ") || (cands.length === 0 ? "추천할 만한 후보가 없어 전체에서 고릅니다." : "")}</p>
          </div>
          <Input label="넣을 금액(원)" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} className="tabular-nums" />
        </div>
      )}
      {needSkip && (
        <Alert kind="warning" className="mb-3">
          <span className="block font-medium">더 오래된 미수가 있습니다.</span>
          <span className="block">같은 사람의 더 오래된 미납부터 충당하는 것이 원칙입니다. 그래도 이 청구에 먼저 충당하려면 사유를 적고 건너뛰기를 허용하세요. 사유는 감사 기록에 남습니다.</span>
          <Input label="건너뛰는 사유(필수)" required value={skipReason} onChange={(e) => setSkipReason(e.target.value)} maxLength={200} wrapperClassName="mt-2" />
        </Alert>
      )}
      {error && errHint !== "older_receivable_open" && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" loading={pending} disabled={!rec || !validAmount(amt) || (needSkip && !skipReason.trim())} onClick={async () => {
          const r = await run(() => allocatePayment(businessId, pay.id, rid, digits(amt), needSkip, needSkip ? skipReason.trim() : undefined), { success: "입금을 청구에 넣었습니다." });
          if (r.ok) { onDone(); return; }
          setErrHint(r.hint);
          if (r.hint === "older_receivable_open") setNeedSkip(true);
        }}>{needSkip ? "건너뛰고 넣기" : "호실에 넣기"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}

/** 호실 없이 등록한 입금에 호실을 사후 지정한다. 배정·선납이 생긴 뒤인지, 건물 소속인지는 서버가 다시 검사한다. */
function UnitPanel({ businessId, pay, units, onDone }: { businessId: string; pay: PaymentLine; units: PaymentsBoardProps["units"]; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [unit, setUnit] = React.useState("");
  return (
    <div className="max-w-[560px]">
      <p className="mb-2 text-[length:var(--fs-body)] text-t">{won(pay.amount)} 입금이 들어온 호실을 지정합니다. 청구에 충당하거나 선납금이 생긴 뒤에는 바꿀 수 없습니다.</p>
      <SelectField label="호실" value={unit} onChange={(e) => setUnit(e.target.value)}>
        <option value="">호실을 고르세요</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
      </SelectField>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" loading={pending} disabled={!unit} onClick={async () => { const r = await run(() => setPaymentUnit(businessId, pay.id, unit), { success: "호실을 지정했습니다." }); if (r.ok) onDone(); }}>호실 지정</Button>
        <Button type="button" variant="ghost" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}

function ReversePanel({ businessId, pay, onDone }: { businessId: string; pay: PaymentLine; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [reason, setReason] = React.useState("");
  return (
    <div className="max-w-[560px]">
      <p className="mb-2 text-[length:var(--fs-body)] text-t">{won(pay.amount)} 입금을 취소합니다. 충당한 것이 풀리고 청구는 다시 미수금이 됩니다. 선납금을 이미 쓴 입금은 취소되지 않습니다.</p>
      <Input label="취소 사유(필수)" required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" variant="danger" loading={pending} disabled={!reason.trim()} onClick={async () => { const r = await run(() => reversePayment(businessId, pay.id, reason.trim()), { success: "입금을 취소했습니다." }); if (r.ok) onDone(); }}>입금 취소</Button>
        <Button type="button" variant="ghost" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}
