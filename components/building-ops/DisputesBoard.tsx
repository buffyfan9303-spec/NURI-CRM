"use client";

/**
 * 입주자 문의·이의: 확정된 청구서(호실)를 골라 기록 → 열림/처리됨/거절 목록 → 처리(처리 내용 필수).
 * 금액을 고쳐야 하면 '관리비 계산·확정'의 '금액 고치기'로 간다(여기서는 기록만). 쓰기는 recordDispute/resolveDispute(서버가 확정 청구서·열린 건인지 다시 검사).
 */
import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, PILL, SelectField, StatusTab, TEXTAREA, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { recordDispute, resolveDispute } from "@/lib/domain/building-actions";
import { FW, FORM_ROW, FORM_ACTIONS } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { fmtLocal } from "./format";
import type { DisputeKind, DisputeRow, DisputeStatus } from "@/lib/domain/building-types";

export interface DisputesProps {
  businessId: string; buildingId: string; period: string; tz: string; canWrite: boolean; canBilling: boolean;
  /** 이 달 확정된 청구서(호실 이름). 확정 전이면 빈 배열. */
  bills: { id: string; label: string }[];
  unitNames: Record<string, string>;
  /** 항목 id → 이름(입주자가 고른 항목 표시용). 못 읽었으면 빈 객체. */
  chargeNames?: Record<string, string>;
  rows: DisputeRow[];
}

const KIND: Record<DisputeKind, string> = { dispute: "금액 이의", correction_request: "고쳐 달라는 요청", info_request: "정보 요청", note: "메모" };
/** 담당자가 직접 기록할 때 고르는 종류(recordDispute 가 받는 값). 전화·방문으로 받은 정보 요청(14항목 금액 등)도 기록한다. */
const STAFF_KINDS = ["dispute", "correction_request", "info_request", "note"] as const;
const STATUS: Record<DisputeStatus, { label: string; kind: "warning" | "success" | "error" }> = {
  open: { label: "열림", kind: "warning" }, resolved: { label: "처리됨", kind: "success" }, rejected: { label: "거절", kind: "error" },
};
const TABS: { key: DisputeStatus | "all"; label: string }[] = [{ key: "open", label: "열림" }, { key: "resolved", label: "처리됨" }, { key: "rejected", label: "거절" }, { key: "all", label: "전체" }];

export function DisputesBoard(p: DisputesProps) {
  const [tab, setTab] = React.useState<DisputeStatus | "all">("open");
  const count = (k: DisputeStatus | "all") => (k === "all" ? p.rows.length : p.rows.filter((r) => r.status === k).length);
  const shown = tab === "all" ? p.rows : p.rows.filter((r) => r.status === tab);
  const billingHref = `/w/${p.businessId}/billing?b=${p.buildingId}`;
  return (
    <div className="space-y-4">
      <RecordCard {...p} />
      <Card className="p-4 sm:p-5">
        <CardHead title="접수한 문의·이의" description="입주자가 알려 온 내용을 처리 상태별로 봅니다." />
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="처리 상태">
          {TABS.map((t) => <StatusTab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={count(t.key)}>{t.label}</StatusTab>)}
        </div>
        {shown.length === 0 ? (
          <EmptyState title={p.rows.length === 0 ? "접수한 문의·이의가 없습니다." : "이 상태의 건이 없습니다."} description={p.canWrite && p.rows.length === 0 ? "위에서 청구서를 고르고 내용을 기록하세요." : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr><th className={TH}>접수일</th><th className={TH}>호실</th><th className={TH}>관리비 달</th><th className={TH}>종류</th><th className={TH}>내용</th><th className={TH}>상태</th><th className={TH}><span className="sr-only">처리</span></th></tr>
              </thead>
              <tbody>{shown.map((r) => <Row key={r.id} r={r} p={p} billingHref={r.period ? `${billingHref}&p=${r.period}` : billingHref} />)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RecordCard(p: DisputesProps) {
  const { run, pending, error } = useRunAction();
  const [billId, setBillId] = React.useState("");
  const [kind, setKind] = React.useState<(typeof STAFF_KINDS)[number]>("dispute");
  const [note, setNote] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billId || !note.trim()) return;
    const r = await run(() => recordDispute(p.businessId, billId, { kind, note: note.trim() }), { success: "기록했습니다." });
    if (r.ok) { setNote(""); setBillId(""); }
  };
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="문의·이의 기록하기" description={`${p.period} 관리비 청구서 중에서 호실을 고르고, 입주자가 한 말을 적습니다.`} />
      {!p.canWrite ? (
        <Alert kind="warning">기록은 쓰기 권한이 있는 담당자가 합니다. 아래 목록은 볼 수 있습니다.</Alert>
      ) : p.bills.length === 0 ? (
        <Alert kind="warning">{p.period} 관리비는 아직 확정되지 않아 청구서가 없습니다. 위에서 확정된 달을 고르세요. 확정 전이라면 계산·입력 화면에서 바로 고치면 됩니다.</Alert>
      ) : (
        <form onSubmit={submit} className={FORM_ROW}>
          <SelectField label="호실(청구서)" required value={billId} onChange={(e) => setBillId(e.target.value)} wrapperClassName={FW.select}>
            <option value="">선택</option>
            {p.bills.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </SelectField>
          <SelectField label="종류" value={kind} onChange={(e) => setKind(e.target.value as (typeof STAFF_KINDS)[number])} wrapperClassName={FW.select}>
            {STAFF_KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
          </SelectField>
          <div className="w-full sm:max-w-[560px]">
            <label htmlFor="dispute-note" className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">내용<span className="ml-0.5 text-et" aria-hidden>*</span></label>
            <textarea id="dispute-note" className={`${TEXTAREA} min-h-[80px]`} rows={3} required value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="예: 전기요금이 지난달보다 두 배라고 하십니다. 계량기 숫자를 다시 확인해 달라고 요청." />
          </div>
          <div className={FORM_ACTIONS}>
            {error && <Alert kind="error" className="w-full">{error}</Alert>}
            <Button type="submit" loading={pending} disabled={!billId || !note.trim()}>기록하기</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Row({ r, p, billingHref }: { r: DisputeRow; p: DisputesProps; billingHref: string }) {
  const [open, setOpen] = React.useState(false);
  const s = STATUS[r.status];
  return (
    <>
      <tr className={TR}>
        <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtLocal(r.created_at, p.tz).slice(0, 10)}</td>
        <td className={`${TD} whitespace-nowrap font-medium`}>{r.unit_id ? p.unitNames[r.unit_id] ?? "-" : "-"}</td>
        <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.period ?? "-"}</td>
        <td className={`${TD} whitespace-nowrap`}>
          {KIND[r.kind] ?? r.kind}
          {r.source === "tenant" && <span className={`${PILL} mt-1 flex w-fit`}>입주자 접수</span>}
        </td>
        <td className={`${TD} min-w-[220px] max-w-[420px] whitespace-pre-wrap break-words`}>
          {r.note}
          {r.charge_type_id && <span className="mt-1 block text-[length:var(--fs-meta)] text-t2">항목: {p.chargeNames?.[r.charge_type_id] ?? "(항목 이름을 불러오지 못함)"}</span>}
          {r.contact && <span className="mt-1 block text-[length:var(--fs-meta)] text-t2">연락처: {r.contact}</span>}
          {r.resolution && <span className="mt-1 block text-[length:var(--fs-meta)] text-t3">처리 내용: {r.resolution}{r.resolved_at ? ` (${fmtLocal(r.resolved_at, p.tz).slice(0, 10)})` : ""}</span>}
        </td>
        <td className={TD}><Badge kind={s.kind}>{s.label}</Badge></td>
        <td className={`${TD} whitespace-nowrap text-right`}>
          {p.canWrite && r.status === "open" && <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "닫기" : "처리"}</Button>}
        </td>
      </tr>
      {open && <tr className="border-b border-[var(--bd)] bg-sf2/40"><td colSpan={7} className="px-3 py-4"><Resolve r={r} p={p} billingHref={billingHref} onDone={() => setOpen(false)} /></td></tr>}
    </>
  );
}

function Resolve({ r, p, billingHref, onDone }: { r: DisputeRow; p: DisputesProps; billingHref: string; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [status, setStatus] = React.useState<"resolved" | "rejected">("resolved");
  const [text, setText] = React.useState("");
  const save = async () => {
    const res = await run(() => resolveDispute(p.businessId, r.id, status, text.trim()), { success: status === "resolved" ? "처리했습니다." : "거절로 기록했습니다." });
    if (res.ok) onDone();
  };
  return (
    <div>
      {r.kind !== "note" && p.canBilling && (
        <p className="mb-3 text-[length:var(--fs-body)] text-t2">
          관리비 금액을 고쳐야 한다면 <Link href={billingHref} className="font-medium text-t underline">관리비 계산·확정 화면의 &apos;금액 고치기&apos;</Link>로 고친 뒤, 여기에 처리 내용을 남기세요.
        </p>
      )}
      <div className={`${FORM_ROW} mb-3`}>
        <SelectField label="결과" value={status} onChange={(e) => setStatus(e.target.value as "resolved" | "rejected")} wrapperClassName={FW.select}>
          <option value="resolved">처리함</option><option value="rejected">거절</option>
        </SelectField>
        <div className="w-full sm:max-w-[560px]">
          <label htmlFor={`resolution-${r.id}`} className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">처리 내용<span className="ml-0.5 text-et" aria-hidden>*</span></label>
          <textarea id={`resolution-${r.id}`} className={`${TEXTAREA} min-h-[72px]`} rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} aria-describedby={r.source === "tenant" ? `resolution-note-${r.id}` : undefined} placeholder="예: 계량기 숫자 다시 확인, 이상 없음을 입주자에게 설명함" />
          {r.source === "tenant" && (
            <p id={`resolution-note-${r.id}`} className="mt-1.5 text-[length:var(--fs-meta)] font-medium text-wt">
              입주자에게 보입니다 — 이 처리 내용은 입주자 조회 화면에 그대로 나옵니다. 다른 호실 이야기나 내부 메모는 적지 마세요.
            </p>
          )}
        </div>
      </div>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex gap-2"><Button type="button" loading={pending} disabled={!text.trim()} onClick={save}>저장</Button><Button type="button" variant="ghost" onClick={onDone}>닫기</Button></div>
    </div>
  );
}
