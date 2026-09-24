"use client";

/**
 * 수강료·미납 — 합계 4칸 → 상태 탭 → 표(PC 8열)/카드. 납부·면제·청구서 발행·일괄 발행은 전부 모달.
 * 레퍼런스: 클래스업(수업 일정 기준 청구서 자동 생성 → 미납 통합 목록), 토스 매출 장부(합계 → 목록).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, MailCheck, Send, Banknote } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { SelectField, StatusTab, FilterRow, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { AcadInvoiceBalance, AcadEnrollment, AcadStudent, AcadClass } from "@/lib/domain/academy";
import { createInvoice, recordAcadPayment, exemptInvoice, issueMonthlyInvoices } from "@/lib/domain/academy-actions";
import { academyUnpaidNotice } from "@/lib/domain/messages";
import { MessageActions } from "@/components/common/MessageActions";
import { formatKRW } from "@/lib/domain/money";

export const INVOICE_STATUS_KIND: Record<string, BadgeKind> = { 완납: "success", 부분납: "warning", 미납: "error", 면제: "info" };
const STATUSES = ["미납", "부분납", "완납", "면제"] as const;
const PAY_METHODS = ["카드", "현금", "계좌이체"];

/** 학원 납부 등록 모달 — 수강료 화면과 학생 상세가 같이 쓴다. 대상이 바뀌면 입력을 초기화한다(CLICK-PATH-215). */
export function AcadPayModal({ businessId, target, onClose, onDone }: { businessId: string; target: (AcadInvoiceBalance & { studentName?: string }) | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState(PAY_METHODS[0]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (target) { setAmount(String(target.outstanding)); setMethod(PAY_METHODS[0]); setError(null); } }, [target]);

  const submit = async () => {
    if (!target) return;
    const amt = Number(amount) || 0;
    if (amt <= 0) { setError("납부 금액을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await recordAcadPayment(businessId, { invoiceId: target.invoiceId, amount: amt, method });
      if (!r.ok) { setError(r.message); return; }
      onDone();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="납부 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>납부 등록</Button>
        </>
      }
    >
      {target && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[var(--r-md)] bg-sf2 px-3.5 py-3 text-[12.5px]">
            {target.studentName && (<><dt className="text-t3">학생</dt><dd className="truncate font-medium text-t">{target.studentName}</dd></>)}
            <dt className="text-t3">청구월</dt><dd className="tabular-nums text-t">{target.period}</dd>
            <dt className="text-t3">청구 금액</dt><dd className="tabular-nums text-t">{formatKRW(target.amount)}</dd>
            <dt className="text-t3">남은 미수</dt><dd className="font-semibold tabular-nums text-et">{formatKRW(target.outstanding)}</dd>
          </dl>
          {error && <Alert className="mb-3">{error}</Alert>}
          <Input label="납부 금액(원)" required inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <SelectField label="결제 수단" value={method} onChange={(e) => setMethod(e.target.value)} wrapperClassName="mb-0">
            {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </SelectField>
        </form>
      )}
    </Modal>
  );
}

export function TuitionBoard({ businessId, businessName, canWrite, canRefund, enrollments, students, classes, invoices, guardianPhoneByStudent = {}, initialStatus }: {
  businessId: string; businessName: string; canWrite: boolean; canRefund: boolean; enrollments: AcadEnrollment[]; students: AcadStudent[]; classes: AcadClass[]; invoices: AcadInvoiceBalance[];
  /** 학생 id → 보호자 대표번호(pii.read 없으면 빈 객체, page.tsx가 애초에 조회하지 않는다). */
  guardianPhoneByStudent?: Record<string, string>;
  /** 홈 "미납" 지표(?status=미납)에서 넘어온 초기 탭. */
  initialStatus?: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState<string>(initialStatus && (STATUSES as readonly string[]).includes(initialStatus) ? initialStatus : "all");
  const [invOpen, setInvOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [payFor, setPayFor] = React.useState<(AcadInvoiceBalance & { studentName?: string }) | null>(null);
  const [exemptFor, setExemptFor] = React.useState<AcadInvoiceBalance | null>(null);
  const [exemptReason, setExemptReason] = React.useState("");
  const [bulkNotice, setBulkNotice] = React.useState<string | null>(null);
  const [noticeFor, setNoticeFor] = React.useState<AcadInvoiceBalance | null>(null);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [invForm, setInvForm] = React.useState({ enrollmentId: "", period: thisMonth, amount: "", dueDate: "" });
  const [bulkPeriod, setBulkPeriod] = React.useState(thisMonth);

  const studentByEnrollment = React.useMemo(() => {
    const m = new Map<string, AcadStudent>();
    for (const e of enrollments) {
      const s = students.find((st) => st.id === e.studentId);
      if (s) m.set(e.id, s);
    }
    return m;
  }, [enrollments, students]);
  const classByEnrollment = React.useMemo(() => {
    const m = new Map<string, AcadClass>();
    for (const e of enrollments) {
      const c = classes.find((cl) => cl.id === e.classId);
      if (c) m.set(e.id, c);
    }
    return m;
  }, [enrollments, classes]);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      return false;
    } finally { setBusy(false); }
  };

  const label = (e: AcadEnrollment) => `${students.find((s) => s.id === e.studentId)?.name ?? e.studentId.slice(0, 8)} · ${classes.find((c) => c.id === e.classId)?.name ?? ""}`;
  const rows = tab === "all" ? invoices : invoices.filter((i) => i.status === tab);
  const countOf = (st: string) => invoices.filter((i) => i.status === st).length;
  const sum = invoices.reduce((s, i) => ({ amount: s.amount + i.amount, paid: s.paid + i.paid, outstanding: s.outstanding + i.outstanding }), { amount: 0, paid: 0, outstanding: 0 });

  const rowView = (inv: AcadInvoiceBalance) => {
    const st = studentByEnrollment.get(inv.enrollmentId);
    return {
      student: st?.name ?? "학생",
      studentId: st?.id,
      cls: classByEnrollment.get(inv.enrollmentId)?.name ?? "-",
      due: inv.outstanding > 0,
      overdue: inv.outstanding > 0 && inv.dueDate < new Date().toISOString().slice(0, 10),
    };
  };
  const actionsOf = (inv: AcadInvoiceBalance, v: ReturnType<typeof rowView>) => {
    const nodes: React.ReactNode[] = [];
    if (canWrite && inv.outstanding > 0) nodes.push(<Button key="pay" variant="secondary" size="sm" onClick={() => setPayFor({ ...inv, studentName: v.student })}><Banknote size={13} aria-hidden />납부</Button>);
    if (inv.outstanding > 0) nodes.push(<Button key="notice" variant="ghost" size="sm" onClick={() => setNoticeFor(inv)}><MailCheck size={13} aria-hidden />안내 문구</Button>);
    if (canRefund && !inv.exempted && inv.outstanding > 0) nodes.push(<Button key="exempt" variant="ghost" size="sm" onClick={() => { setExemptFor(inv); setExemptReason(""); }}>면제</Button>);
    return nodes;
  };

  return (
    <>
      <PageHeader
        title="수강료·미납"
        description="수강 등록 단위로 청구서를 만들고 납부·미수를 관리합니다."
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => { setBulkNotice(null); setBulkOpen(true); }}><Send size={14} aria-hidden />이번 달 일괄 발행</Button>
              <Button onClick={() => { setInvForm({ enrollmentId: "", period: thisMonth, amount: "", dueDate: "" }); setInvOpen(true); }}><Plus size={15} aria-hidden />청구서 발행</Button>
            </>
          ) : undefined
        }
      >
        <FilterRow>
          <StatusTab active={tab === "all"} onClick={() => setTab("all")} count={invoices.length}>전체</StatusTab>
          {STATUSES.map((st) => <StatusTab key={st} active={tab === st} onClick={() => setTab(st)} count={countOf(st)}>{st}</StatusTab>)}
        </FilterRow>
      </PageHeader>

      {error && <Alert className="mb-4">{error}</Alert>}
      {bulkNotice && <Alert kind="success" className="mb-4">{bulkNotice}</Alert>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
        {[
          ["청구 합계", formatKRW(sum.amount), "text-t"],
          ["납부 합계", formatKRW(sum.paid), "text-okt"],
          ["미수 합계", formatKRW(sum.outstanding), sum.outstanding > 0 ? "text-et" : "text-t"],
          ["미납 청구서", `${countOf("미납")}건`, countOf("미납") > 0 ? "text-et" : "text-t"],
        ].map(([l, v, cls]) => (
          <Card key={l} className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-t2">{l}</p>
            <p className={`mt-1.5 truncate text-[22px] font-bold leading-none tabular-nums ${cls}`}>{v}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <CardHead title={tab === "all" ? "청구·납부 현황" : `${tab} 청구서`} description={`${rows.length}건`} />
        {rows.length === 0 ? (
          <EmptyState
            title={tab === "all" ? "청구서가 없습니다." : `${tab} 상태인 청구서가 없습니다.`}
            description={tab === "all" && canWrite ? "이번 달 일괄 발행으로 활성 수강 전원의 청구서를 한 번에 만들 수 있습니다." : undefined}
            action={tab === "all" && canWrite ? <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>이번 달 일괄 발행</Button> : undefined}
          />
        ) : (
          <TableOrCards
            rows={rows}
            keyOf={(i) => i.invoiceId}
            table={
              <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className={`${TABLE} min-w-[900px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>학생 · 반</th>
                      <th className={TH}>청구월</th>
                      <th className={TH}>납부기한</th>
                      <th className={`${TH} text-right`}>청구</th>
                      <th className={`${TH} text-right`}>납부</th>
                      <th className={`${TH} text-right`}>미수</th>
                      <th className={TH}>상태</th>
                      <th className={`${TH} text-right`}>동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((inv) => {
                      const v = rowView(inv);
                      const acts = actionsOf(inv, v);
                      return (
                        <tr key={inv.invoiceId} className={`${TR} h-[52px] hover:bg-sf2`}>
                          <td className={TD}>
                            <CellName max={180}>{v.student}</CellName>
                            <span className="block max-w-[180px] truncate text-[11.5px] text-t3" title={v.cls}>{v.cls}</span>
                          </td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{inv.period}</td>
                          <td className={`${TD} whitespace-nowrap tabular-nums ${v.overdue ? "font-medium text-et" : "text-t2"}`}>{inv.dueDate}{v.overdue && <span className="ml-1 text-[11px]">지남</span>}</td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{formatKRW(inv.amount)}</td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t2`}>{formatKRW(inv.paid)}</td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums ${v.due ? "font-semibold text-et" : "text-t3"}`}>{formatKRW(inv.outstanding)}</td>
                          <td className={TD}><Badge kind={INVOICE_STATUS_KIND[inv.status] ?? "info"}>{inv.status}</Badge></td>
                          <td className={`${TD} text-right`}>{acts.length > 0 && <span className="inline-flex flex-wrap items-center justify-end gap-1">{acts}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            }
            card={(inv) => {
              const v = rowView(inv);
              const acts = actionsOf(inv, v);
              return (
                <MobileCard
                  title={v.student}
                  sub={<><span>{v.cls}</span><span>· {inv.period}</span></>}
                  badge={<Badge kind={INVOICE_STATUS_KIND[inv.status] ?? "info"}>{inv.status}</Badge>}
                  fields={[
                    ["납부기한", <span key="d" className={v.overdue ? "font-medium text-et" : undefined}>{inv.dueDate}</span>],
                    ["청구", formatKRW(inv.amount)],
                    ["납부", formatKRW(inv.paid)],
                    ["미수", <span key="o" className={v.due ? "font-semibold text-et" : undefined}>{formatKRW(inv.outstanding)}</span>],
                  ]}
                  actions={acts.length > 0 ? acts : undefined}
                />
              );
            }}
          />
        )}
      </Card>

      <AcadPayModal businessId={businessId} target={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); router.refresh(); }} />

      <Modal
        open={!!exemptFor}
        onClose={() => setExemptFor(null)}
        title="청구서 면제"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExemptFor(null)} disabled={busy}>취소</Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!exemptReason.trim()}
              onClick={async () => {
                if (!exemptFor) return;
                if (!window.confirm("면제 처리하면 되돌릴 UI가 없습니다. 계속할까요?")) return;
                const ok = await run(() => exemptInvoice(businessId, exemptFor.invoiceId, exemptReason.trim()));
                if (ok) { setExemptFor(null); setExemptReason(""); }
              }}
            >
              면제 확정
            </Button>
          </>
        }
      >
        {exemptFor && (
          <form onSubmit={(e) => e.preventDefault()}>
            <p className="mb-4 text-[12.5px] leading-relaxed text-t2">{rowView(exemptFor).student} · {exemptFor.period} 청구서(미수 {formatKRW(exemptFor.outstanding)})를 면제합니다. 사유는 감사 기록에 남습니다.</p>
            <Input label="면제 사유" required value={exemptReason} onChange={(e) => setExemptReason(e.target.value)} placeholder="예: 형편 곤란 승인(2026-09 원장 승인)" autoFocus wrapperClassName="mb-0" />
          </form>
        )}
      </Modal>

      <Modal
        open={invOpen}
        onClose={() => setInvOpen(false)}
        title="청구서 발행"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvOpen(false)} disabled={busy}>취소</Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!invForm.enrollmentId || !invForm.dueDate) { setError("수강등록·납부기한을 입력하세요."); return; }
                const ok = await run(() => createInvoice(businessId, { ...invForm, amount: Number(invForm.amount) || 0 }));
                if (ok) setInvOpen(false);
              }}
            >
              발행
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col">
          <SelectField label="수강등록" required value={invForm.enrollmentId} onChange={(e) => { const id = e.target.value; const cls = classByEnrollment.get(id); setInvForm((f) => ({ ...f, enrollmentId: id, amount: f.amount || (cls ? String(cls.tuitionAmount) : "") })); }} autoFocus>
            <option value="">선택</option>
            {enrollments.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-x-3">
            <Input label="청구월" type="month" value={invForm.period} onChange={(e) => setInvForm((f) => ({ ...f, period: e.target.value }))} />
            <Input label="금액(원)" inputMode="numeric" value={invForm.amount} onChange={(e) => setInvForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </div>
          <Input label="납부기한" type="date" required value={invForm.dueDate} onChange={(e) => setInvForm((f) => ({ ...f, dueDate: e.target.value }))} wrapperClassName="mb-0" />
        </form>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="이번 달 일괄 발행"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkOpen(false)} disabled={busy}>취소</Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!window.confirm(`${bulkPeriod} 청구서를 활성 수강 전원에게 일괄 발행합니다. 계속할까요?`)) return;
                setBusy(true); setBulkNotice(null); setError(null);
                try {
                  const r = await issueMonthlyInvoices(businessId, bulkPeriod);
                  if (!r.ok) { setError(r.message); setBulkOpen(false); return; }
                  setBulkNotice(`${bulkPeriod} 청구서 ${r.data.created}건 발행, ${r.data.skipped}건 건너뜀(이미 존재) · 납부기한 ${r.data.dueDate}`);
                  setBulkOpen(false);
                  router.refresh();
                } catch {
                  setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
                  setBulkOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send size={14} aria-hidden />일괄 발행
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[12.5px] leading-relaxed text-t2">활성 수강 전원에게 해당 월 청구서를 만듭니다. 이미 있는 청구서는 건너뜁니다.</p>
        <Input label="청구월" type="month" value={bulkPeriod} onChange={(e) => setBulkPeriod(e.target.value)} wrapperClassName="mb-0" />
      </Modal>

      <Modal open={!!noticeFor} onClose={() => setNoticeFor(null)} title="미납 안내 문구">
        {noticeFor && (
          <MessageActions
            title="미납 안내"
            phone={guardianPhoneByStudent[studentByEnrollment.get(noticeFor.enrollmentId)?.id ?? ""]}
            text={academyUnpaidNotice({
              businessName,
              studentName: studentByEnrollment.get(noticeFor.enrollmentId)?.name ?? "학생",
              period: noticeFor.period,
              dueDate: noticeFor.dueDate,
              outstanding: noticeFor.outstanding,
            })}
          />
        )}
      </Modal>
    </>
  );
}
