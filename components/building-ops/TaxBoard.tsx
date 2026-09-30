"use client";

/**
 * 세금계산서 일괄발행(building): 1 이번 달 발행할 목록 → 2 홈택스 업로드 엑셀 → 3 홈택스에 올리는 방법 → 4 승인번호 넣기.
 * 파일을 만들거나 내려받아도 발행으로 보지 않는다. 발행 완료는 승인번호를 기록했을 때만 표시한다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FW } from "@/components/building/FieldWidths";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, SummaryStrip, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { TaxStatusPill } from "@/components/building/StatusPill";
import { buildTaxTargets, markTaxFailed, markTaxFileGenerated, markTaxIssued, setBuildingFeature } from "@/lib/domain/building-actions";
import type { TaxIssueStatus, TaxKind } from "@/lib/domain/building-types";
import { useRunAction } from "./client-common";
import { approvalNoNote, fileCount, tally } from "./tax-ui";
import { won } from "./format";

export interface TaxLine {
  id: string; kind: TaxKind; receiver: string; supply: number | null; tax: number | null; total: number | null; writeDate: string;
  status: TaxIssueStatus; blockReasons: string[]; fileName: string | null; approvalNo: string | null; failReason: string | null;
}
export interface TaxBoardProps {
  businessId: string; runId: string | null; runApproved: boolean; lines: TaxLine[]; canIssue: boolean; periodLocked: boolean;
}
const KIND_LABEL: Record<TaxKind, string> = { tax_invoice: "전자세금계산서(과세)", invoice_exempt: "전자계산서(면세)" };
type DlIssue = { row: number; field: string; message: string; targetId: string | null };

export function TaxBoard(p: TaxBoardProps) {
  const t = tally(p.lines.map((l) => ({ issue_status: l.status })));
  return (
    <div className="space-y-4">
      <SummaryStrip
        items={[
          { label: "발행 대상", value: `${p.lines.length}건` },
          { label: "발행 불가", value: `${t.blocked}건`, tone: t.blocked > 0 ? "danger" : "default", hint: t.blocked > 0 ? "사유를 해결해야 파일에 들어갑니다." : undefined },
          { label: "파일 만들기 전", value: `${t.ready}건`, hint: "파일을 아직 내려받지 않은 대상" },
          { label: "파일 생성됨(발행 확인 대기)", value: `${t.file_generated}건`, hint: "홈택스에서 발급한 뒤 승인번호를 기록하세요." },
          { label: "발행 완료(승인번호 기록)", value: `${t.issued}건`, tone: t.issued > 0 ? "success" : "default" },
        ]}
      />
      <TargetsStep {...p} />
      <FilesStep {...p} />
      <HowToCard />
      <ApprovalStep {...p} />
    </div>
  );
}

function TargetsStep(p: TaxBoardProps) {
  const { run, pending, error } = useRunAction();
  const [note, setNote] = React.useState<string | null>(null);
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="1. 이번 달 발행할 목록"
        description="승인된 청구에서 세금계산서와 계산서를 낼 곳을 모두 모았습니다. 발행 불가 건은 사유를 해소한 뒤 목록을 다시 만드세요."
        action={p.canIssue && p.runId && p.runApproved ? (
          <Button type="button" size="sm" loading={pending} onClick={async () => { setNote(null); const r = await run(() => buildTaxTargets(p.businessId, p.runId!), { success: "발행할 목록을 만들었습니다." }); if (r.ok) setNote(`엑셀로 만들 수 있는 건 ${r.data.ready}건, 막힌 건 ${r.data.blocked}건입니다.`); }}>{p.lines.length ? "목록 다시 만들기" : "이번 달 발행 목록 만들기"}</Button>
        ) : undefined}
      />
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      {note && <Alert kind="success" className="mb-3">{note}</Alert>}
      {!p.runId ? (
        <EmptyState title="계산 결과가 아직 없습니다." description="청구 계산을 만들고 승인한 뒤에 발행 대상을 만들 수 있습니다." />
      ) : !p.runApproved ? (
        <Alert kind="warning">이 청구월의 계산이 아직 승인되지 않았습니다. 승인된 계산만 발행 대상으로 만들 수 있습니다.</Alert>
      ) : p.lines.length === 0 ? (
        <EmptyState title="발행 대상이 없습니다." description={p.canIssue ? "위 버튼으로 발행 대상을 만드세요." : "세무 발행 권한이 있는 사람이 발행 대상을 만듭니다."} />
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>종류</th><th className={TH}>받는 곳</th><th className={`${TH} text-right`}>공급가액</th><th className={`${TH} text-right`}>세액</th><th className={`${TH} text-right`}>합계</th><th className={TH}>작성일자</th><th className={TH}>상태</th><th className={TH}>막힌 이유·메모</th></tr></thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.id} className={TR}>
                  <td className={TD}>{KIND_LABEL[l.kind]}</td><td className={TD}>{l.receiver}</td>
                  <td className={`${TD} text-right tabular-nums`}>{l.supply == null ? "-" : won(l.supply)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{l.tax == null ? "-" : won(l.tax)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{l.total == null ? "-" : won(l.total)}</td>
                  <td className={`${TD} tabular-nums`}>{l.writeDate}</td>
                  <td className={TD}><TaxStatusPill status={l.status} /></td>
                  <td className={TD}>
                    {l.blockReasons.length > 0 ? <ul className="list-disc pl-4">{l.blockReasons.map((r) => <li key={r}>{r}</li>)}</ul> : l.status === "failed" ? l.failReason ?? "실패" : l.status === "issued" ? <span className="tabular-nums">승인번호 {l.approvalNo}</span> : <span className="text-t3">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function FilesStep(p: TaxBoardProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [issues, setIssues] = React.useState<DlIssue[]>([]);
  const byId = new Map(p.lines.map((l) => [l.id, l.receiver]));
  const kinds = (["tax_invoice", "invoice_exempt"] as const).map((k) => ({ k, n: p.lines.filter((l) => l.kind === k && (l.status === "ready" || l.status === "file_generated")).length })).filter((x) => x.n > 0);

  const download = async (kind: TaxKind, i: number) => {
    const key = `${kind}-${i}`;
    setBusy(key); setMsg(null); setIssues([]);
    try {
      const res = await fetch(`/api/building/tax-xls?businessId=${encodeURIComponent(p.businessId)}&run=${encodeURIComponent(p.runId ?? "")}&kind=${kind}&i=${i}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string; errors?: DlIssue[] } | null;
        setMsg({ kind: "error", text: j?.error ?? "파일을 만들지 못했습니다." });
        setIssues(j?.errors ?? []);
        return;
      }
      const name = decodeURIComponent(res.headers.get("X-Tax-File-Name") ?? `홈택스_${kind}_${i + 1}.xls`);
      const ids = (res.headers.get("X-Tax-Target-Ids") ?? "").split(",").filter(Boolean);
      await saveBlob(await res.blob(), name);
      const r = await markTaxFileGenerated(p.businessId, ids, name);
      if (!r.ok) setMsg({ kind: "error", text: `파일은 내려받았지만 상태를 기록하지 못했습니다. ${r.message}` });
      else { setMsg({ kind: "success", text: `${name} 파일을 만들었습니다(${r.data.updated}건). 아직 발행된 것이 아닙니다. 홈택스에 올려 발급한 뒤 3단계에서 승인번호를 기록하세요.` }); router.refresh(); }
    } catch {
      setMsg({ kind: "error", text: "요청을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="2. 홈택스에 올릴 엑셀 내려받기" description="홈택스 일괄발급 양식(.xls)입니다. 100건이 넘으면 1/2, 2/2처럼 자동으로 나눕니다. 내려받기만으로는 발행되지 않습니다." />
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-[length:var(--fs-body)] text-t">
        <li>아래 버튼으로 파일을 내려받습니다. 파일이 여러 개면 모두 내려받으세요.</li>
        <li>홈택스에 로그인해 전자(세금)계산서 일괄 발급 메뉴에서 파일을 올립니다.</li>
        <li>홈택스에서 발급을 마치면 나오는 국세청 승인번호를 3단계에 기록합니다.</li>
      </ol>
      {msg && <Alert kind={msg.kind} className="mb-3">{msg.text}</Alert>}
      {issues.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 pl-5 text-[length:var(--fs-body)] text-t" role="alert">
          {issues.map((e, n) => <li key={n}>{e.targetId ? `${byId.get(e.targetId) ?? "대상"}: ` : ""}{e.field ? `${e.field} ` : ""}{e.message}</li>)}
        </ul>
      )}
      {!p.canIssue ? (
        <Alert kind="warning">세금계산서 발행 권한이 없어 엑셀을 만들 수 없습니다. 목록은 볼 수 있습니다.</Alert>
      ) : kinds.length === 0 ? (
        <EmptyState title="파일로 만들 대상이 없습니다." description="1단계에서 파일 준비 가능한 대상이 생기면 여기에 나타납니다." />
      ) : (
        <div className="space-y-3">
          {kinds.map(({ k, n }) => (
            <div key={k} className="rounded-[var(--r-md)] border border-[var(--bd)] p-3">
              <p className="mb-2 text-[length:var(--fs-body)] font-medium text-t">{KIND_LABEL[k]} <span className="tabular-nums text-t2">{n}건, 파일 {fileCount(n)}개</span></p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: fileCount(n) }, (_, i) => (
                  <Button key={i} type="button" variant="secondary" loading={busy === `${k}-${i}`} disabled={busy !== null && busy !== `${k}-${i}`} onClick={() => download(k, i)}>엑셀 {i + 1}/{fileCount(n)} 내려받기</Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ApprovalStep(p: TaxBoardProps) {
  const open = p.lines.filter((l) => l.status === "ready" || l.status === "file_generated");
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="4. 발행을 마쳤으면 승인번호 넣기" description="홈택스에서 발급을 마친 건만 넣으세요. 승인번호를 넣어야 발행 완료로 바뀝니다." />
      {open.length === 0 ? (
        <EmptyState title="승인번호를 기록할 건이 없습니다." description="파일을 만든 뒤 홈택스에서 발급하면 여기서 기록합니다." />
      ) : !p.canIssue ? (
        <Alert kind="warning">세금계산서 발행 권한이 없어 승인번호를 넣을 수 없습니다.</Alert>
      ) : (
        <div className="space-y-3">{open.map((l) => <ApprovalRow key={l.id} businessId={p.businessId} l={l} />)}</div>
      )}
    </Card>
  );
}

function ApprovalRow({ businessId, l }: { businessId: string; l: TaxLine }) {
  const { run, pending, error } = useRunAction();
  const [no, setNo] = React.useState("");
  const [failing, setFailing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const note = no.trim() ? approvalNoNote(no) : null;
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[length:var(--fs-body)] text-t">
        <span className="font-medium">{l.receiver}</span><span className="text-t2">{KIND_LABEL[l.kind]}</span>
        <span className="tabular-nums">{l.total == null ? "" : won(l.total)}</span><TaxStatusPill status={l.status} short={false} />
      </div>
      {l.fileName && <p className="mb-2 text-[length:var(--fs-meta)] text-t3">파일 {l.fileName}</p>}
      {error && <Alert kind="error" className="mb-2">{error}</Alert>}
      {!failing ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input label="국세청 승인번호" wrapperClassName={FW.memo} value={no} onChange={(e) => setNo(e.target.value)} className="tabular-nums" hint={note ?? undefined} />
          <Button type="button" loading={pending} disabled={!/^[0-9A-Za-z-]{20,32}$/.test(no.trim())} onClick={() => run(() => markTaxIssued(businessId, l.id, no.trim()), { success: "승인번호를 넣었습니다. 발행 완료로 표시됩니다." })}>승인번호 넣기</Button>
          <Button type="button" variant="ghost" onClick={() => setFailing(true)}>발급 실패로 기록</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Input label="실패 사유" wrapperClassName={FW.memo} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          <Button type="button" variant="secondary" loading={pending} disabled={!reason.trim()} onClick={() => run(() => markTaxFailed(businessId, l.id, reason.trim()), { success: "실패로 기록했습니다." })}>실패 기록</Button>
          <Button type="button" variant="ghost" onClick={() => setFailing(false)}>돌아가기</Button>
        </div>
      )}
    </div>
  );
}

/** 홈택스에 올리는 방법: 번호 목록 3단계. 홈택스 메뉴 이름은 바뀔 수 있어 큰 흐름만 적는다. */
function HowToCard() {
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="3. 홈택스에 올리는 방법" description="엑셀을 내려받은 다음 홈택스 사이트에서 하는 일입니다." />
      <ol className="list-decimal space-y-1.5 pl-5 text-[length:var(--fs-body)] text-t">
        <li>홈택스(hometax.go.kr)에 공동인증서로 로그인합니다.</li>
        <li>전자(세금)계산서 발급 메뉴에서 &quot;일괄 발급(엑셀 업로드)&quot;을 열고, 위에서 내려받은 엑셀을 올립니다. 엑셀이 여러 개면 하나씩 올립니다.</li>
        <li>내용을 확인하고 발급을 누릅니다. 발급이 끝나면 건마다 국세청 승인번호가 나옵니다. 그 번호를 아래 4번에 넣으면 발행 완료가 됩니다.</li>
      </ol>
    </Card>
  );
}

/** 발행 도움이 꺼진 사업장에서 대표가 이 화면에서 바로 켠다(서버 액션이 staff.manage 를 다시 검사). */
export function EnableTaxButton({ businessId }: { businessId: string }) {
  const { run, pending, error } = useRunAction();
  return (
    <div className="flex flex-col items-center gap-2">
      <Button type="button" loading={pending} onClick={() => run(() => setBuildingFeature(businessId, "tax_invoice", true), { success: "세금계산서 발행 도움을 켰습니다." })}>발행 도움 켜기</Button>
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
