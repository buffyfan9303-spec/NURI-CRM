"use client";

/**
 * 은행 엑셀로 한꺼번에 넣기: 파일 → 입금 행만 골라 호실 자동 찾기(미리보기) → 사람이 고침 → 확정 한 번.
 * 호실 찾기는 제안일 뿐이다. 확정하면 입금마다 recordPayment 와 같은 서버 절차(오래된 미납부터 채움·중복 거래키 거부)가 다시 판정한다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/toast";
import { Alert, CardHead, TABLE, THEAD, TH, TR, TD, CONTROL_SM } from "@/components/rental/listkit";
import { recordPaymentsBulk } from "@/lib/domain/building-actions";
import { MATCH_BY_LABEL, type BankMatchResult, type BankMatchRow } from "./bank-import-types";
import { fmtLocal, won } from "./format";

const CHUNK = 40;
interface Summary { auto: number; picked: number; none: number; dup: number; failed: number; failMessages: string[]; allocated: number; credit: number }

export function BankBulkImport({ businessId, buildingId, units, tz }: { businessId: string; buildingId: string; units: { id: string; label: string }[]; tz: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState<"read" | "save" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<BankMatchResult | null>(null);
  const [pick, setPick] = React.useState<Record<string, string>>({});
  const [filter, setFilter] = React.useState<"all" | "review" | "none">("all");
  const [progress, setProgress] = React.useState(0);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const label = React.useMemo(() => new Map(units.map((u) => [u.id, u.label])), [units]);

  const reset = () => { setData(null); setPick({}); setSummary(null); setError(null); setFile(null); setProgress(0); setFilter("all"); if (fileRef.current) fileRef.current.value = ""; };

  async function read() {
    if (!file) { setError("엑셀 또는 CSV 파일을 먼저 고르세요."); return; }
    setBusy("read"); setError(null); setSummary(null);
    const fd = new FormData();
    fd.set("businessId", businessId); fd.set("b", buildingId); fd.set("step", "match"); fd.set("sourceKind", "bank"); fd.set("file", file);
    try {
      const r = await fetch("/api/building/import", { method: "POST", body: fd, cache: "no-store" });
      const j = (await r.json().catch(() => null)) as (BankMatchResult & { error?: string }) | null;
      if (!r.ok || !j || !Array.isArray(j.rows)) { setError(j?.error ?? "파일을 처리하지 못했습니다."); return; }
      setData(j);
      setPick(Object.fromEntries(j.rows.map((x) => [x.key, x.status === "auto" ? x.unitIds[0] : ""])));
    } catch { setError("요청을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요."); } finally { setBusy(null); }
  }

  const live = data?.rows.filter((x) => !x.existing) ?? [];
  const chosen = (x: BankMatchRow) => pick[x.key] ?? "";
  const nAuto = live.filter((x) => x.status === "auto" && chosen(x) === x.unitIds[0]).length;
  const nPicked = live.filter((x) => chosen(x) && !(x.status === "auto" && chosen(x) === x.unitIds[0])).length;
  const nUnset = live.filter((x) => !chosen(x)).length;
  const nReview = live.filter((x) => x.status === "review" && !chosen(x)).length;
  const nExisting = (data?.rows.length ?? 0) - live.length;
  const shown = (data?.rows ?? []).filter((x) => (filter === "review" ? x.status === "review" : filter === "none" ? !chosen(x) && !x.existing : true));

  async function confirm() {
    if (!data || live.length === 0) return;
    setBusy("save"); setError(null); setProgress(0);
    const s: Summary = { auto: nAuto, picked: nPicked, none: nUnset, dup: nExisting, failed: 0, failMessages: [], allocated: 0, credit: 0 };
    try {
      for (let i = 0; i < live.length; i += CHUNK) {
        const part = live.slice(i, i + CHUNK);
        const r = await recordPaymentsBulk(businessId, buildingId, part.map((x) => ({ amount: x.amount, paid_at: x.paidAt, payer_name: x.payer, memo: x.memo, external_key: x.key, unit_id: chosen(x) || null })));
        if (!r.ok) { s.failed += live.length - i; s.failMessages.push(r.message); break; }
        for (const o of r.data.results) {
          if (o.status === "duplicate") { s.dup++; if (o.unit_id) s.picked--; }
          else if (o.status === "failed") { s.failed++; if (s.failMessages.length < 3) s.failMessages.push(o.message ?? "등록하지 못했습니다."); }
          else { s.allocated += o.allocated; s.credit += o.credit; }
        }
        setProgress(Math.min(live.length, i + CHUNK));
      }
    } catch { s.failed += live.length; s.failMessages.push("요청을 보내지 못했습니다. 이미 넣은 입금은 수납 내역에서 확인하세요."); }
    setSummary(s); setData(null); setPick({}); setBusy(null);
    if (s.failed === 0) toast.success("은행 입금을 넣었습니다.");
    router.refresh();
  }

  if (!open) {
    return (
      <div>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-expanded={false}>은행 엑셀로 한꺼번에 넣기</Button>
      </div>
    );
  }
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="은행 엑셀로 한꺼번에 넣기"
        description="은행에서 내려받은 입출금 내역 파일을 올리면 입금만 골라 호실을 자동으로 찾습니다. 입금자·메모에 '201동 1403호', '1403', 계약자 이름이 있으면 그 호실로 넣습니다."
        action={<Button type="button" size="sm" variant="ghost" onClick={() => { reset(); setOpen(false); }}>닫기</Button>}
      />
      {summary && (
        <Alert kind={summary.failed > 0 ? "warning" : "success"} className="mb-3">
          <span className="block font-medium">입금을 넣었습니다.</span>
          <span className="block tabular-nums">호실에 넣음 {summary.auto + summary.picked}건(자동 {summary.auto}건, 직접 고름 {Math.max(0, summary.picked)}건) · 호실 안 정해짐 {summary.none}건 · 이미 있어 건너뜀 {summary.dup}건{summary.failed > 0 ? ` · 실패 ${summary.failed}건` : ""}</span>
          {(summary.allocated > 0 || summary.credit > 0) && <span className="block tabular-nums">청구에 채운 돈 {won(summary.allocated)}{summary.credit > 0 ? ` · 미리 낸 돈 ${won(summary.credit)}` : ""}</span>}
          {summary.failMessages.map((m, i) => <span key={i} className="block">{m}</span>)}
          {summary.none > 0 && <span className="block">호실 안 정해진 입금은 아래 입금 내역에서 &quot;호실 지정&quot;으로 나중에 넣을 수 있습니다.</span>}
        </Alert>
      )}
      {!data && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <label htmlFor="bank-file" className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">은행 내역 파일(xlsx, xls, csv, 4MB 이하)</label>
            <input id="bank-file" ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} className="block min-h-[44px] max-w-full text-[length:var(--fs-body)] text-t" />
          </div>
          <Button type="button" loading={busy === "read"} disabled={!file} onClick={read}>파일 읽기</Button>
        </div>
      )}
      {error && <Alert kind="error" className="mt-3">{error}</Alert>}
      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-body)] text-t">
            <span className="font-medium">{data.fileName}</span>
            <Badge kind="success">{`자동 ${live.filter((x) => x.status === "auto").length}건`}</Badge>
            <Badge kind="warning">{`확인 필요 ${live.filter((x) => x.status === "review").length}건`}</Badge>
            <Badge kind="info">{`호실 못 찾음 ${live.filter((x) => x.status === "none").length}건`}</Badge>
            {nExisting > 0 && <Badge kind="info">{`이미 등록됨 ${nExisting}건`}</Badge>}
          </div>
          <p className="text-[length:var(--fs-meta)] text-t3">
            출금 {data.stats.withdraw}건은 넣지 않습니다{data.stats.duplicateInFile > 0 ? ` · 파일 안 같은 거래 ${data.stats.duplicateInFile}건은 한 번만 셉니다` : ""}{data.stats.noDate > 0 ? ` · 거래일시를 못 읽은 ${data.stats.noDate}건은 뺐습니다` : ""}.
            호실은 아래에서 바꿀 수 있고, 비워 두면 &quot;호실 안 정해짐&quot;으로 저장됩니다.
          </p>
          <div className="flex gap-1" role="group" aria-label="보기">
            {([["all", `전체 ${data.rows.length}`], ["review", `확인 필요 ${live.filter((x) => x.status === "review").length}`], ["none", `호실 안 정해짐 ${nUnset}`]] as const).map(([k, l]) => (
              <Button key={k} type="button" size="sm" variant={filter === k ? "primary" : "secondary"} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</Button>
            ))}
          </div>
          {data.rows.length === 0 ? (
            <Alert kind="warning">넣을 입금이 없습니다. 출금만 있거나 입금액·거래일시 열을 읽지 못한 파일일 수 있습니다.</Alert>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className={TABLE}>
                <thead className={`${THEAD} sticky top-0 z-[1]`}>
                  <tr><th className={TH}>거래일시</th><th className={TH}>입금자 · 메모</th><th className={`${TH} text-right`}>금액</th><th className={TH}>호실</th><th className={TH}>상태</th></tr>
                </thead>
                <tbody>
                  {shown.map((x) => {
                    const cand = new Set(x.unitIds);
                    return (
                      <tr key={x.key} className={TR}>
                        <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtLocal(x.paidAt, tz)}</td>
                        <td className={TD}><span className="block max-w-[24rem] truncate" title={`${x.payer} ${x.memo}`}>{x.payer || "—"}{x.memo ? <span className="text-t3"> · {x.memo}</span> : null}</span></td>
                        <td className={`${TD} text-right tabular-nums`}>{won(x.amount)}</td>
                        <td className={TD}>
                          {x.existing ? <span className="text-t3">—</span> : (
                            <select aria-label={`${x.payer || "입금"} ${won(x.amount)} 호실`} className={`${CONTROL_SM} w-auto min-w-[8rem] max-w-[14rem]`} value={chosen(x)} onChange={(e) => setPick((p) => ({ ...p, [x.key]: e.target.value }))}>
                              <option value="">호실 안 정해짐</option>
                              {x.unitIds.length > 0 && <optgroup label="찾은 호실">{x.unitIds.map((id) => <option key={id} value={id}>{label.get(id) ?? "호실"}</option>)}</optgroup>}
                              <optgroup label="전체 호실">{units.filter((u) => !cand.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</optgroup>
                            </select>
                          )}
                        </td>
                        <td className={TD}>
                          {x.existing ? <Badge kind="info">이미 등록됨</Badge>
                            : x.status === "auto" ? <Badge kind="success">{`자동 · ${x.by ? MATCH_BY_LABEL[x.by] : ""}`}</Badge>
                            : x.status === "review" ? <Badge kind="warning">확인 필요</Badge>
                            : <Badge kind="info">호실 못 찾음</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {nReview > 0 && <Alert kind="warning">확인 필요 {nReview}건은 호실이 여럿으로 보입니다. 골라 주지 않으면 &quot;호실 안 정해짐&quot;으로 저장됩니다.</Alert>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" loading={busy === "save"} disabled={live.length === 0} onClick={confirm}>{`입금 ${live.length}건 넣기`}</Button>
            <Button type="button" variant="ghost" disabled={busy === "save"} onClick={reset}>다른 파일 고르기</Button>
            {busy === "save" && <span className="text-[length:var(--fs-meta)] text-t3 tabular-nums">{progress}/{live.length}건 처리 중</span>}
          </div>
          <p className="text-[length:var(--fs-meta)] text-t3">호실에 넣은 입금은 그 호실의 오래된 미납부터 자동으로 채우고, 남는 돈은 미리 낸 돈으로 쌓입니다. 같은 파일을 다시 올려도 이미 등록된 거래는 건너뜁니다.</p>
        </div>
      )}
    </Card>
  );
}
