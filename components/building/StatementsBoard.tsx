"use client";

/**
 * 명세서 보내기(§4.7): ① 샘플 보기(PDF iframe) ② 대상 표(채널·연락처 뒤 4자리·금액·발송 상태) ③ 확인 문장 + 큰 보내기.
 * "발송 요청" 과 "발송 성공" 을 구분한다: 인쇄·다운로드·복사는 브라우저가 실제로 했을 때만 sent 로 기록하고,
 * 문자·이메일은 OS 앱을 여는 것까지라 note="요청" 으로 기록해 "요청됨" 으로 보인다. 승인 전에는 전부 비활성(서버 RPC 도 not_approved 로 거부).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard, MOBILE_BARE } from "@/components/ui/ResponsiveTable";
import { Alert, CardHead, CONTROL, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { toast } from "@/components/ui/toast";
import { ExternalLink, FileText, MessageSquare, Copy, Printer, Send, Lock } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { smsHref } from "@/lib/domain/messages";
import type { BillRow, BillingRunRow } from "@/lib/domain/building-types";
import { recordDelivery } from "@/lib/domain/building-actions";
import type { BuildingContext } from "./context";
import { BuildingPeriodBar } from "./BuildingPeriodBar";
import { SavedStatus, useSaveState } from "./SavedStatus";
import { Money, MoneyCell, fmtMoney } from "./Money";
import { LinkButton } from "./StepCard";
import { periodLabel } from "./period";

export interface DeliveryRow { bill_id: string; channel: string; status: "sent" | "failed"; note: string | null; created_at: string }
type Channel = "print" | "download" | "copy" | "sms" | "email";
const CHANNEL_LABEL: Record<string, string> = { print: "인쇄", download: "PDF", copy: "복사", sms: "문자", email: "이메일", alimtalk: "알림톡", portal: "포털" };
const REQUESTED = "요청";
/** 체크박스 22px + 44px 터치 영역(label). */
const CHECK = "h-[22px] w-[22px] accent-[var(--accent-strong)]";
const CHECK_WRAP = "-m-2 inline-flex h-[44px] w-[44px] cursor-pointer items-center justify-center";

const last4 = (v: string | null | undefined) => { const d = (v ?? "").replace(/[^0-9]/g, ""); return d ? `…${d.slice(-4)}` : null; };
const hhmm = (iso: string) => iso.slice(5, 16).replace("T", " ");
const platform = (): "ios" | "android" | "unknown" => (typeof navigator === "undefined" ? "unknown" : /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "unknown");

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 폴백 */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.setAttribute("readonly", "");
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

export function StatementsBoard({
  businessId, base, tz, ctx, run, bills, deliveries, unitNo, parties, canWrite, canReadPii, emailOn, bank, dueDate,
}: {
  businessId: string; base: string; tz: string; ctx: BuildingContext; run: BillingRunRow | null; bills: BillRow[]; deliveries: DeliveryRow[];
  unitNo: Record<string, string>; parties: Record<string, { name: string; phone: string | null; email: string | null }>;
  canWrite: boolean; canReadPii: boolean; emailOn: boolean; alimtalkOn?: boolean; bank: string | null; dueDate: string | null;
}) {
  const router = useRouter();
  const save = useSaveState();
  const building = ctx.building!;
  const approved = run?.status === "approved";
  const status = ctx.periodRow?.status ?? null;
  const rows = React.useMemo(() => bills.filter((b) => b.bill_kind === "regular").sort((a, b) => (unitNo[a.unit_id] ?? "").localeCompare(unitNo[b.unit_id] ?? "", "ko", { numeric: true })), [bills, unitNo]);
  const lastBy = React.useMemo(() => { const m = new Map<string, DeliveryRow>(); for (const d of deliveries) if (!m.has(d.bill_id)) m.set(d.bill_id, d); return m; }, [deliveries]);
  const party = (b: BillRow) => (b.bill_to_party_id ? parties[b.bill_to_party_id] : undefined);
  const pdfUrl = (ids: string[], download = false) => `/api/pdf/building-statement?businessId=${businessId}&${ids.length === 1 ? `bill=${ids[0]}` : `bills=${ids.join(",")}`}${download ? "&download=1" : ""}`;
  const smsText = (b: BillRow) => [
    `[${building.name}] ${unitNo[b.unit_id] ?? ""}호 ${party(b)?.name ?? ""}님, ${periodLabel(ctx.period)} 관리비 안내입니다.`,
    `납부 요청액: ${fmtMoney(b.amount_due)}`,
    b.prior_unpaid ? `(전월 미납 ${fmtMoney(b.prior_unpaid)} 포함)` : null,
    dueDate ? `납부기한: ${dueDate}` : null,
    bank ? `입금 계좌: ${bank}` : null,
    "이 안내는 세금계산서가 아닙니다.",
  ].filter(Boolean).join("\n");

  const [channel, setChannel] = React.useState<Record<string, Channel>>({});
  const chanOf = (b: BillRow): Channel => channel[b.id] ?? (canReadPii && party(b)?.phone ? "sms" : "print");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const picked = rows.filter((r) => selected.has(r.id));
  const counts = picked.reduce((m, b) => { const c = chanOf(b); m[c] = (m[c] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const pickedTotal = picked.reduce((s, b) => s + (b.amount_due ?? 0), 0);

  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = React.useState<string[]>([]);
  const busy = progress !== null;

  /** 한 건 기록. 실패는 false. */
  const record = async (b: BillRow, ch: Channel, note?: string) => {
    try { const r = await recordDelivery(businessId, b.id, ch, "sent", note); if (!r.ok) { setError(r.message); return false; } return true; } catch { setError("서버와 통신하지 못했습니다."); return false; }
  };

  const openPdf = async (b: BillRow) => {
    window.open(pdfUrl([b.id]), "_blank", "noopener");
    if (canWrite && approved) { save.saving(); (await record(b, "download")) ? save.saved() : save.failed("기록 실패"); router.refresh(); }
  };
  const sendSms = async (b: BillRow) => {
    const href = smsHref(party(b)?.phone, smsText(b), platform());
    if (!href) { setError("연락처가 없어 문자를 보낼 수 없습니다."); return; }
    window.location.href = href;
    if (canWrite && approved) { save.saving(); (await record(b, "sms", REQUESTED)) ? save.saved() : save.failed("기록 실패"); router.refresh(); }
  };
  const copyOne = async (b: BillRow) => {
    if (!(await copyText(smsText(b)))) { setError("복사하지 못했습니다. 문구를 길게 눌러 직접 복사해 주세요."); return; }
    toast.success("안내 문구를 복사했습니다.");
    if (canWrite && approved) { save.saving(); (await record(b, "copy")) ? save.saved() : save.failed("기록 실패"); router.refresh(); }
  };

  /** 일괄: 인쇄·PDF 는 한 문서로 열고 건별 기록. 문자·이메일·복사는 행마다 앱을 열어야 하므로 일괄에서 제외(안내). */
  const sendAll = async (targets = picked) => {
    setError(null); setFailed([]);
    const batch = targets.filter((b) => chanOf(b) === "print" || chanOf(b) === "download");
    if (batch.length === 0) { setError("일괄로 보낼 수 있는 채널(인쇄·PDF)이 선택되지 않았습니다. 문자·복사는 행의 버튼으로 한 건씩 보냅니다."); return; }
    const prints = batch.filter((b) => chanOf(b) === "print"), downloads = batch.filter((b) => chanOf(b) === "download");
    if (prints.length) window.open(pdfUrl(prints.map((b) => b.id)), "_blank", "noopener");
    if (downloads.length) window.open(pdfUrl(downloads.map((b) => b.id), true), "_blank", "noopener");
    setProgress({ done: 0, total: batch.length }); save.saving();
    const fails: string[] = [];
    for (let i = 0; i < batch.length; i++) {
      const ok = await record(batch[i], chanOf(batch[i]));
      if (!ok) fails.push(batch[i].id);
      setProgress({ done: i + 1, total: batch.length });
    }
    setFailed(fails);
    if (fails.length) save.failed(`${fails.length}건 기록 실패`); else save.saved();
    setProgress(null);
    router.refresh();
    if (!fails.length) toast.success(`${batch.length}건을 보냈습니다(기록 완료).`);
  };

  const header = (
    <>
      <BuildingPeriodBar buildings={ctx.buildings} buildingId={building.id} period={ctx.period} tz={tz} status={status}>
        <SavedStatus state={save.state} />
      </BuildingPeriodBar>
      <PageHeader
        title="명세서 보내기"
        description={`${building.name} · ${periodLabel(ctx.period)}${run ? ` · 계산 ${run.revision}차` : ""}`}
        actions={approved && rows.length > 0 ? (
          <a href={pdfUrl(rows.map((r) => r.id))} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd-strong)] bg-sf px-4 text-[length:var(--fs-body)] font-medium text-t shadow-card hover:bg-sf2">
            <Printer size={16} aria-hidden />전체 인쇄용 PDF
          </a>
        ) : undefined}
      />
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      {progress && <p role="status" aria-live="polite" className="mb-3 text-[length:var(--fs-body)] font-medium text-t">{progress.done} / {progress.total} 보냄 — 끝날 때까지 화면을 닫지 마세요(취소 불가)</p>}
    </>
  );

  if (!run || rows.length === 0) {
    return (<>{header}<Card><EmptyState title="보낼 명세서가 없습니다." description="관리비를 계산하고 승인하면 호실별 명세서를 보낼 수 있습니다." action={<LinkButton href={`${base}/billing${ctx.qs}`} size="md">관리비 계산·확인으로</LinkButton>} /></Card></>);
  }

  const deliveryCell = (b: BillRow) => {
    const d = lastBy.get(b.id);
    if (!d) return <span className="text-t3">미발송</span>;
    const requested = d.note === REQUESTED;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge kind={d.status === "failed" ? "error" : requested ? "info" : "success"}>{CHANNEL_LABEL[d.channel] ?? d.channel} {d.status === "failed" ? "실패" : requested ? "요청됨" : "보냄"}</Badge>
        <span className="whitespace-nowrap text-[length:var(--fs-meta)] tabular-nums text-t3 max-xl:hidden">{hhmm(d.created_at)}</span>
      </span>
    );
  };
  const actionsFor = (b: BillRow, size: "sm" | "md" = "sm") => {
    const p = party(b);
    return (
      <>
        <Button size={size} variant="secondary" disabled={busy} onClick={() => openPdf(b)}><FileText size={14} aria-hidden />PDF</Button>
        {canReadPii && p?.phone ? (
          <Button size={size} variant="ghost" disabled={busy || !approved} onClick={() => sendSms(b)}><MessageSquare size={14} aria-hidden />문자</Button>
        ) : (
          <Button size={size} variant="ghost" disabled={busy} onClick={() => copyOne(b)}><Copy size={14} aria-hidden />문구 복사</Button>
        )}
      </>
    );
  };
  const channelSelect = (b: BillRow) => {
    const p = party(b);
    return (
      <select aria-label={`${unitNo[b.unit_id] ?? ""}호 채널`} className={cn(CONTROL, "w-auto min-w-[110px]")} value={chanOf(b)} disabled={!approved || busy} onChange={(e) => setChannel((m) => ({ ...m, [b.id]: e.target.value as Channel }))}>
        <option value="print">인쇄</option>
        <option value="download">PDF 저장</option>
        {canReadPii && p?.phone && <option value="sms">문자</option>}
        {emailOn && p?.email && <option value="email">이메일</option>}
        <option value="copy">복사</option>
      </select>
    );
  };

  const table = (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <thead className={THEAD}>
          <tr>
            <th className={cn(TH, "w-[52px]")} scope="col">
              <label className={CHECK_WRAP}><input type="checkbox" aria-label="전체 선택" className={CHECK} checked={allOn} disabled={!approved || busy} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></label>
            </th>
            <th className={TH} scope="col">호실</th>
            <th className={TH} scope="col">청구받는 분</th>
            <th className={TH} scope="col">채널</th>
            <th className={cn(TH, "max-xl:hidden")} scope="col">연락처</th>
            <th className={cn(TH, "text-right")} scope="col">납부 요청액</th>
            <th className={TH} scope="col">발송 상태</th>
            <th className={cn(TH, "text-right")} scope="col">동작</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const p = party(b);
            const isFail = failed.includes(b.id);
            return (
              <tr key={b.id} className={cn(TR, isFail && "border-l-[3px] border-l-[var(--et)]")}>
                <td className={TD}><label className={CHECK_WRAP}><input type="checkbox" aria-label={`${unitNo[b.unit_id] ?? ""}호 선택`} className={CHECK} checked={selected.has(b.id)} disabled={!approved || busy} onChange={() => toggle(b.id)} /></label></td>
                <td className={cn(TD, "font-semibold tabular-nums text-t")}>{unitNo[b.unit_id] ?? "—"}호</td>
                <td className={cn(TD, "text-t")}>{p?.name ?? <span className="text-et">부담자 없음</span>}</td>
                <td className={TD}>{channelSelect(b)}</td>
                <td className={cn(TD, "whitespace-nowrap tabular-nums text-t2 max-xl:hidden")}>{canReadPii ? (last4(p?.phone) ?? (p?.email ? "이메일" : "없음")) : <span className="text-t3">권한 없음</span>}</td>
                <MoneyCell value={b.amount_due} strong />
                <td className={TD}>{deliveryCell(b)}</td>
                <td className={cn(TD, "whitespace-nowrap text-right")}><span className="inline-flex gap-1">{actionsFor(b)}</span></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--t)] font-semibold text-t">
            <td className={TD} colSpan={5}>합계 {rows.length}호실 · 선택 {picked.length}</td>
            <MoneyCell value={rows.reduce((s, b) => s + (b.amount_due ?? 0), 0)} strong />
            <td className={TD} colSpan={2}>보냄 {rows.filter((b) => lastBy.get(b.id)?.status === "sent").length}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <>
      {header}
      {!approved && (
        <Alert kind="warning" className="mb-4">
          <Lock size={14} className="mr-1 inline-block align-[-2px]" aria-hidden />
          승인 완료 후 보낼 수 있습니다. 지금은 미리보기만 됩니다. <a href={`${base}/billing${ctx.qs}`} className="font-medium underline">관리비 계산·확인으로</a>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 [@media(min-width:1400px)]:grid-cols-[minmax(320px,2fr)_3fr]">
        <Card className="p-4">
          <CardHead title="① 샘플 보기" description={`${unitNo[rows[0].unit_id] ?? ""}호 명세서 — 실제로 보내는 그대로`} action={<a href={pdfUrl([rows[0].id])} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] font-medium text-[var(--accent-ink)] hover:bg-sf2">새 탭 <ExternalLink size={14} aria-hidden /></a>} />
          <iframe title={`${unitNo[rows[0].unit_id] ?? ""}호 명세서 미리보기`} src={`${pdfUrl([rows[0].id])}#toolbar=0`} className="h-[520px] w-full rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2" />
        </Card>
        <Card className={cn("sm:p-0", MOBILE_BARE)}>
          <div className="px-4 pt-4 sm:px-5"><CardHead title="② 보낼 대상" description="채널을 고르고 체크한 호실만 보냅니다. 문자·복사는 행의 버튼으로 한 건씩." /></div>
          <TableOrCards
            rows={rows}
            keyOf={(b) => b.id}
            table={table}
            card={(b) => (
              <MobileCard
                title={`${unitNo[b.unit_id] ?? "—"}호 · ${party(b)?.name ?? "부담자 없음"}`}
                badge={deliveryCell(b)}
                fields={[["납부 요청액", <Money key="a" value={b.amount_due} strong className="text-[length:var(--fs-money)]" />], ["연락처", canReadPii ? (last4(party(b)?.phone) ?? "없음") : "권한 없음"]]}
                actions={actionsFor(b, "md")}
              >
                <label className="flex items-center gap-2 text-[length:var(--fs-body)] text-t2">
                  <span className={CHECK_WRAP}><input type="checkbox" className={CHECK} checked={selected.has(b.id)} disabled={!approved || busy} onChange={() => toggle(b.id)} /></span>
                  일괄 포함
                  {channelSelect(b)}
                </label>
              </MobileCard>
            )}
          />
        </Card>
      </div>
      <Card className="mt-4 p-4 sm:p-5">
        <CardHead title="③ 확인하고 보내기" />
        <p className="break-keep text-[length:var(--fs-card)] leading-relaxed text-t">
          <strong className="tabular-nums">{picked.length}호실</strong>, 합계 <strong className="tabular-nums">{fmtMoney(pickedTotal)}</strong>
          {picked.length > 0 && <> — {Object.entries(counts).map(([c, n]) => `${CHANNEL_LABEL[c]} ${n}`).join(" · ")}</>}
          {" "}을 보냅니다.
          {(counts.sms || counts.copy || counts.email) ? <span className="block text-[length:var(--fs-body)] text-t2">문자·이메일·복사로 고른 {(counts.sms ?? 0) + (counts.copy ?? 0) + (counts.email ?? 0)}건은 표의 행 버튼으로 한 건씩 보냅니다.</span> : null}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={!approved || !canWrite || picked.length === 0 || busy} loading={busy} onClick={() => sendAll()}>
            <Send size={18} aria-hidden />명세서 보내기
          </Button>
          {failed.length > 0 && (
            <Button size="lg" variant="secondary" disabled={busy} onClick={() => sendAll(rows.filter((b) => failed.includes(b.id)))}>실패 {failed.length}건만 다시 보내기</Button>
          )}
          {!canWrite && approved && <span className="text-[length:var(--fs-body)] text-t2">발송 기록에는 write 권한이 필요합니다.</span>}
        </div>
      </Card>
    </>
  );
}
