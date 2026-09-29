"use client";

/**
 * 외부 파일 가져오기 4단계: 1 파일 올리기 → 2 열 확인·수정 → 3 미리보기(오류·경고) → 4 확정. 아래에 가져오기 내역과 취소.
 * 파일 읽기·검사·저장은 /api/building/import 가, 확정·취소는 서버 액션이 한다. 오류가 남은 파일은 저장하지 않는다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, SelectField, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { cancelImport, commitImport } from "@/lib/domain/building-actions";
import type { ImportBatchRow, ImportBatchStatus, ImportStageResult, MeterKind } from "@/lib/domain/building-types";
import { useRunAction } from "./client-common";
import { METER_KIND_LABEL, fmtLocal, num, won } from "./format";
import { FIELD_LABEL, IMPORT_KIND_LABEL, IMPORT_KIND_NOTE, REQUIRED_FIELDS, assignColumn, colLetter, missingRequired, type AnalyzeResult, type ImportKind, type Mapping, type ValidateResult } from "./import-ui";
import { SOURCE_FIELDS } from "@/lib/import/types";

export interface ImportsProps {
  businessId: string; buildingId: string; period: string; tz: string; canBank: boolean; meterKinds: MeterKind[];
  chargeTypes: { id: string; name: string; direct: boolean }[]; batches: (ImportBatchRow & { chargeName: string | null })[];
}
const MAX_BYTES = 4 * 1024 * 1024;
const STEPS = ["파일 올리기", "열 확인", "미리보기", "확정"] as const;
const STATUS: Record<ImportBatchStatus, { label: string; kind: "info" | "success" | "warning" | "error" }> = {
  uploaded: { label: "올림", kind: "info" }, mapped: { label: "열 지정됨", kind: "info" }, validated: { label: "저장됨(확정 전)", kind: "warning" }, committed: { label: "확정됨", kind: "success" }, cancelled: { label: "취소됨", kind: "error" },
};

type Res<T> = { ok: true; data: T } | { ok: false; message: string; hint?: string | null };
async function post<T>(fd: FormData): Promise<Res<T>> {
  try {
    const r = await fetch("/api/building/import", { method: "POST", body: fd, cache: "no-store" });
    const j = (await r.json().catch(() => null)) as (T & { error?: string; hint?: string | null }) | null;
    if (!r.ok || !j) return { ok: false, message: j?.error ?? "요청을 처리하지 못했습니다.", hint: j?.hint };
    return { ok: true, data: j };
  } catch {
    return { ok: false, message: "요청을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요." };
  }
}

export function ImportsBoard(p: ImportsProps) {
  return (
    <div className="space-y-4">
      <Wizard {...p} />
      <History {...p} />
    </div>
  );
}

function Wizard(p: ImportsProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [kind, setKind] = React.useState<ImportKind>("meter");
  const [period, setPeriod] = React.useState(p.period);
  const [meterKind, setMeterKind] = React.useState<string>("");
  const [chargeTypeId, setChargeTypeId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [an, setAn] = React.useState<AnalyzeResult | null>(null);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [saveTemplate, setSaveTemplate] = React.useState(true);
  const [expected, setExpected] = React.useState("");
  const [val, setVal] = React.useState<ValidateResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ committed: number; skipped: number; batchId: string } | null>(null);
  const [staged, setStaged] = React.useState<ImportStageResult | null>(null);
  const { run, pending, error: commitError } = useRunAction();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const form = (stepName: string, over: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("businessId", p.businessId); fd.set("b", p.buildingId); fd.set("step", stepName); fd.set("sourceKind", kind);
    fd.set("file", file as File); fd.set("period", period); fd.set("meterKind", meterKind); fd.set("chargeTypeId", chargeTypeId);
    fd.set("mapping", JSON.stringify(mapping)); fd.set("expectedTotal", expected.replace(/[^\d]/g, "")); fd.set("saveTemplate", saveTemplate ? "1" : "0");
    if (an) { fd.set("sheet", String(an.sheetIndex)); fd.set("headerRow", String(an.headerRow)); }
    for (const [k, v] of Object.entries(over)) fd.set(k, v);
    return fd;
  };

  const setupError = (): string | null => {
    if (!file) return "파일을 선택하세요.";
    if (file.size > MAX_BYTES) return "파일이 4MB를 넘습니다. 시트를 나누거나 필요한 열만 남겨 다시 올리세요.";
    if (kind !== "bank" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return "청구월을 고르세요.";
    if (kind === "meter" && !meterKind) return "검침 종류를 고르세요.";
    if ((kind === "bill" || kind === "expense") && !chargeTypeId) return "비용을 넣을 항목을 고르세요.";
    return null;
  };

  const analyze = async (over: Record<string, string> = {}) => {
    const e = setupError(); if (e) { setError(e); return; }
    setBusy(true); setError(null);
    const r = await post<AnalyzeResult>(form("analyze", over));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setAn(r.data); setMapping(r.data.mapping); setVal(null); setStep(1);
  };
  const validate = async () => {
    const miss = missingRequired(kind, mapping);
    if (miss.length) { setError(`필수 열을 지정하세요: ${miss.map((f) => FIELD_LABEL[f] ?? f).join(", ")}`); return; }
    setBusy(true); setError(null);
    const r = await post<ValidateResult>(form("validate"));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setVal(r.data); setStep(2);
  };
  const stageAndCommit = async () => {
    setBusy(true); setError(null); setStaged(null);
    const s = await post<ImportStageResult>(form("stage"));
    setBusy(false);
    if (!s.ok) { setError(s.hint === "duplicate_import" ? `${s.message} 같은 파일을 다시 넣으려면 내역에서 이전 가져오기를 취소하세요.` : s.message); return; }
    setStaged(s.data);
    if (s.data.errors > 0) { setError(`서버 검사에서 오류 ${s.data.errors}행이 나와 확정하지 않았습니다. 내역에서 이 가져오기를 취소하고 파일을 고치세요.`); router.refresh(); return; }
    const c = await run(() => commitImport(p.businessId, s.data.batch_id), { success: "가져오기를 확정했습니다." });
    if (c.ok) setDone({ ...c.data, batchId: s.data.batch_id });
  };
  const reset = () => { setStep(0); setFile(null); setAn(null); setVal(null); setDone(null); setStaged(null); setError(null); setMapping({}); setExpected(""); if (fileRef.current) fileRef.current.value = ""; };

  const fields = SOURCE_FIELDS[kind];
  const previewCols = an ? Object.entries(mapping).sort((a, b) => a[1] - b[1]).map(([f]) => f) : [];

  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="파일 가져오기" description="검침, 청구서, 은행 입금, 비용 파일을 열 확인과 미리보기를 거쳐 넣습니다." />
      <ol className="mb-4 flex flex-wrap gap-1.5" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-full border px-3 py-1 text-[length:var(--fs-meta)] ${i === step ? "border-[var(--brand)] bg-sf2 font-semibold text-t" : i < step ? "border-[var(--bd)] text-t2" : "border-[var(--bd)] text-t3"}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      {commitError && <Alert kind="error" className="mb-3">{commitError}{staged ? ` 저장은 됐지만 확정하지 못했습니다. 내역에서 이 가져오기를 취소하거나 다시 확정하세요.` : ""}</Alert>}

      {step === 0 && (
        <div className="max-w-[720px]">
          <SelectField label="어떤 파일입니까" value={kind} onChange={(e) => { setKind(e.target.value as ImportKind); setChargeTypeId(""); }} hint={IMPORT_KIND_NOTE[kind]}>
            {(Object.keys(IMPORT_KIND_LABEL) as ImportKind[]).filter((k) => k !== "bank" || p.canBank).map((k) => <option key={k} value={k}>{IMPORT_KIND_LABEL[k]}</option>)}
          </SelectField>
          {!p.canBank && <p className="-mt-2 mb-4 text-[length:var(--fs-meta)] text-t3">은행 입금 가져오기는 수납 배정 권한이 있어야 보입니다.</p>}
          {kind !== "bank" && <Input label="청구월" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="tabular-nums" />}
          {kind === "meter" && (
            <SelectField label="검침 종류" required value={meterKind} onChange={(e) => setMeterKind(e.target.value)} hint={p.meterKinds.length < 5 ? "가스·난방·온수는 선택 기능을 켜야 고를 수 있습니다." : undefined}>
              <option value="">선택하세요</option>
              {p.meterKinds.map((k) => <option key={k} value={k}>{METER_KIND_LABEL[k]}</option>)}
            </SelectField>
          )}
          {(kind === "bill" || kind === "expense") && (
            <SelectField label="비용을 넣을 항목" required value={chargeTypeId} onChange={(e) => setChargeTypeId(e.target.value)} hint={p.chargeTypes.length === 0 ? "지출액 또는 직접 입력 항목이 없습니다. 관리비 항목에서 먼저 만드세요." : "고른 항목의 비용으로 들어갑니다."}>
              <option value="">선택하세요</option>
              {p.chargeTypes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.direct ? " (호실별 직접 입력)" : ""}</option>)}
            </SelectField>
          )}
          <div className="mb-4">
            <label htmlFor="imp-file" className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">파일(xlsx, xls, csv, 4MB 이하)</label>
            <input id="imp-file" ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} className="block min-h-[44px] w-full text-[length:var(--fs-body)] text-t" />
          </div>
          <Button type="button" loading={busy} onClick={() => analyze({ sheet: "0", headerRow: "" })}>파일 읽기</Button>
        </div>
      )}

      {step === 1 && an && (
        <div>
          <p className="mb-3 text-[length:var(--fs-body)] text-t">
            <span className="font-medium">{an.fileName}</span> <span className="tabular-nums text-t2">데이터 {num(an.dataRows)}행</span>{" "}
            {an.template ? <Badge kind="success">저장된 양식 적용</Badge> : an.detected ? <Badge kind="info">머리글 자동 인식</Badge> : <Badge kind="warning">머리글을 직접 확인하세요</Badge>}
          </p>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:max-w-[720px]">
            {an.sheets.length > 1 && (
              <SelectField label="시트" value={an.sheetIndex} onChange={(e) => analyze({ sheet: e.target.value, headerRow: "" })}>
                {an.sheets.map((s, i) => <option key={i} value={i}>{s.name} ({num(s.rows)}행)</option>)}
              </SelectField>
            )}
            <Input label="머리글이 있는 행 번호" type="number" min={1} defaultValue={an.headerRow} key={`${an.sheetIndex}-${an.headerRow}`} className="tabular-nums" hint="바꾸면 열을 다시 찾습니다." onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v !== an.headerRow) analyze({ sheet: String(an.sheetIndex), headerRow: String(v) }); }} />
          </div>
          <h3 className="mb-2 mt-1 text-[length:var(--fs-body)] font-semibold text-t">열 지정 <span className="font-normal text-t3">빨간 별표는 꼭 필요한 열입니다. 한 열은 한 항목에만 지정됩니다.</span></h3>
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <SelectField key={f} label={`${FIELD_LABEL[f] ?? f}${REQUIRED_FIELDS[kind].includes(f) ? " *" : ""}`} value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => assignColumn(m, f, e.target.value === "" ? null : Number(e.target.value)))}
                hint={mapping[f] !== undefined && an.fieldConfidence[f] !== undefined && an.fieldConfidence[f] < 0.8 ? "자동 추정이 확실하지 않습니다. 확인하세요." : undefined}>
                <option value="">사용 안 함</option>
                {an.headers.map((h, i) => <option key={i} value={i}>{colLetter(i)}열 {h || "(빈 머리글)"}</option>)}
              </SelectField>
            ))}
          </div>
          <div className="mb-4 max-h-[240px] overflow-auto">
            <table className={TABLE}>
              <tbody>{an.preview.map((r, ri) => <tr key={ri} className={TR}>{r.map((c, ci) => ri === 0 ? <th key={ci} className={`${TH} bg-sf2/60`}>{c}</th> : <td key={ci} className={`${TD} whitespace-nowrap`}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <label className="mb-4 flex min-h-[44px] items-center gap-2 text-[length:var(--fs-body)] text-t"><input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />이 열 지정을 양식으로 저장해 같은 머리글의 다음 파일에 자동 적용</label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>이전</Button>
            <Button type="button" loading={busy} onClick={validate}>미리보기 검사</Button>
          </div>
        </div>
      )}

      {step === 2 && val && an && (
        <div>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[length:var(--fs-body)] text-t">
            <span className="tabular-nums">가져올 행 {num(val.rows)}</span>
            {val.excluded > 0 && <span className="tabular-nums text-t2">합계 행 등 제외 {num(val.excluded)}</span>}
            <Badge kind={val.errorRows > 0 ? "error" : "success"}>{val.errorRows > 0 ? `오류 ${num(val.errorRows)}행` : "오류 없음"}</Badge>
            <Badge kind={val.warningRows > 0 ? "warning" : "info"}>{`경고 ${num(val.warningRows)}행`}</Badge>
          </p>
          {(kind === "bill" || kind === "expense" || kind === "bank") && (
            <div className="flex flex-wrap items-end gap-2">
              <Input label="원본 고지서·내역 합계(원, 선택)" inputMode="numeric" wrapperClassName="min-w-[260px]" value={expected} onChange={(e) => setExpected(e.target.value.replace(/[^\d]/g, ""))} className="tabular-nums" hint="넣으면 파일 금액 합계와 맞는지 대조합니다." />
              <Button type="button" variant="secondary" loading={busy} className="mb-4" onClick={validate}>다시 검사</Button>
            </div>
          )}
          {val.issues.length > 0 && (
            <div className="mb-4 max-h-[260px] overflow-auto" role="region" aria-label="오류와 경고 목록">
              <table className={TABLE}>
                <thead className={THEAD}><tr><th className={TH}>행</th><th className={TH}>구분</th><th className={TH}>열</th><th className={TH}>내용</th></tr></thead>
                <tbody>{val.issues.map((i, n) => <tr key={n} className={TR}><td className={`${TD} tabular-nums`}>{i.row ?? "전체"}</td><td className={TD}><Badge kind={i.level === "error" ? "error" : "warning"}>{i.level === "error" ? "오류" : "경고"}</Badge></td><td className={TD}>{i.field ? FIELD_LABEL[i.field] ?? i.field : "-"}</td><td className={TD}>{i.message}</td></tr>)}</tbody>
              </table>
              {val.issuesTruncated && <p className="mt-1 text-[length:var(--fs-meta)] text-t3">앞의 300건만 보여 줍니다.</p>}
            </div>
          )}
          <div className="mb-4 max-h-[300px] overflow-auto">
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>행</th><th className={TH}>상태</th>{previewCols.map((f) => <th key={f} className={TH}>{FIELD_LABEL[f] ?? f}</th>)}</tr></thead>
              <tbody>{val.preview.map((r) => <tr key={r.row} className={TR}><td className={`${TD} tabular-nums`}>{r.row}</td><td className={TD}><Badge kind={r.level === "error" ? "error" : r.level === "warning" ? "warning" : "success"}>{r.level === "error" ? "오류" : r.level === "warning" ? "경고" : "정상"}</Badge></td>{previewCols.map((f) => <td key={f} className={`${TD} whitespace-nowrap`}>{r.values[f] ?? ""}</td>)}</tr>)}</tbody>
            </table>
            {val.rows > val.preview.length && <p className="mt-1 text-[length:var(--fs-meta)] text-t3">앞의 {val.preview.length}행만 보여 줍니다.</p>}
          </div>
          {kind === "bank" && mapping.txnDatetime === undefined && <Alert kind="warning" className="mb-3">거래일시 열을 지정하지 않았습니다. 일시가 없는 입금 행은 확정할 때 모두 건너뜁니다. 이전 단계에서 거래일시 열을 지정하세요.</Alert>}
          {val.errorRows > 0 && <Alert kind="warning" className="mb-3">오류가 남은 파일은 저장하지 않습니다. 열 지정을 고치거나 파일을 고쳐 다시 올리세요.</Alert>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>이전</Button>
            <Button type="button" disabled={val.errorRows > 0 || val.rows === 0} onClick={() => setStep(3)}>다음</Button>
          </div>
        </div>
      )}

      {step === 3 && val && an && (
        <div className="max-w-[720px]">
          {done ? (
            <>
              <Alert kind="success" className="mb-3"><span className="tabular-nums">확정했습니다. 반영 {num(done.committed)}건, 건너뜀 {num(done.skipped)}건.</span>{kind === "bank" && done.skipped > 0 && <span className="mt-1 block">거래일시가 없거나 읽지 못한 입금은 가져온 시각으로 바꾸지 않고 건너뜁니다. 파일의 거래일시 열을 확인해 고친 파일로 다시 가져오세요.</span>}</Alert>
              <p className="mb-3 text-[length:var(--fs-meta)] text-t3">잘못 넣었다면 아래 내역에서 이 가져오기를 취소하면 되돌립니다. 승인된 청구월이나 이미 배정된 입금은 되돌릴 수 없습니다.</p>
              <Button type="button" onClick={reset}>새 가져오기</Button>
            </>
          ) : (
            <>
              <ul className="mb-4 list-disc space-y-1 pl-5 text-[length:var(--fs-body)] text-t">
                <li>{IMPORT_KIND_LABEL[kind]}</li>
                {kind !== "bank" && <li>청구월 {period}</li>}
                <li className="tabular-nums">{an.fileName}, {num(val.rows)}행{val.warningRows > 0 ? `, 경고 ${num(val.warningRows)}행 포함` : ""}</li>
                <li>{IMPORT_KIND_NOTE[kind]}</li>
              </ul>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" disabled={busy || pending} onClick={() => setStep(2)}>이전</Button>
                <Button type="button" loading={busy || pending} onClick={stageAndCommit}>저장하고 확정</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function History(p: ImportsProps) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="가져오기 내역" description="최근 100건입니다. 확정한 가져오기도 취소하면 그 파일이 만든 값을 되돌립니다." />
      {p.batches.length === 0 ? (
        <EmptyState title="가져오기 내역이 없습니다." description="위에서 첫 파일을 올려 보세요." />
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>시각</th><th className={TH}>종류</th><th className={TH}>파일</th><th className={TH}>청구월</th><th className={`${TH} text-right`}>행</th><th className={`${TH} text-right`}>오류</th><th className={`${TH} text-right`}>합계</th><th className={TH}>상태</th><th className={TH}><span className="sr-only">작업</span></th></tr></thead>
            <tbody>
              {p.batches.map((b) => (
                <React.Fragment key={b.id}>
                  <tr className={TR}>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtLocal(b.created_at, p.tz)}</td>
                    <td className={TD}>{b.source_kind === "units" ? "호실" : IMPORT_KIND_LABEL[b.source_kind].split("(")[0]}{b.chargeName ? ` · ${b.chargeName}` : ""}</td>
                    <td className={TD}>{b.file_name}</td><td className={`${TD} tabular-nums`}>{b.period ?? "-"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{num(b.row_count)}</td><td className={`${TD} text-right tabular-nums`}>{num(b.error_count)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{b.total_amount == null ? "—" : won(b.total_amount)}</td>
                    <td className={TD}><Badge kind={STATUS[b.status].kind}>{STATUS[b.status].label}</Badge></td>
                    <td className={`${TD} whitespace-nowrap text-right`}>{b.status !== "cancelled" && <Button type="button" size="sm" variant="ghost" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>취소</Button>}</td>
                  </tr>
                  {open === b.id && <tr className="border-b border-[var(--bd)] bg-sf2/40"><td colSpan={9} className="px-3 py-4"><CancelPanel businessId={p.businessId} b={b} onDone={() => setOpen(null)} /></td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CancelPanel({ businessId, b, onDone }: { businessId: string; b: ImportBatchRow; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [reason, setReason] = React.useState("");
  return (
    <div className="max-w-[560px]">
      <p className="mb-2 text-[length:var(--fs-body)] text-t">{b.status === "committed" ? "이 파일이 만든 검침·비용·입금·호실을 되돌립니다." : "아직 확정 전인 가져오기를 취소합니다."}</p>
      <Input label="취소 사유(선택)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="button" variant="danger" loading={pending} onClick={async () => { const r = await run(() => cancelImport(businessId, b.id, reason.trim() || undefined), { success: "가져오기를 취소했습니다." }); if (r.ok) onDone(); }}>가져오기 취소</Button>
        <Button type="button" variant="ghost" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}
