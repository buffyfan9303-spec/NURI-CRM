"use client";

/**
 * 매출 기록. 직접 입력과 CSV 가져오기를 서로 다른 모달로 명확히 분리하고,
 * 가져오기 데이터에는 항상 출처 배지를 고정 노출한다(명세 §1-4-4, 수용기준 6).
 * "실시간 연동"을 암시하는 문구는 어디에도 쓰지 않는다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, Lock } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { UsProduct, UsSalesRecord } from "@/lib/domain/unmanned";
import { recordManualSale, importSalesCsv, confirmReconciliation } from "@/lib/domain/unmanned-actions";
import { CardHead, SelectField, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";

interface CsvRow { sku: string; qty: number; amount: number; soldAt: string }

export function SalesBoard({ businessId, canWrite, canReadRevenue, products, records }: {
  businessId: string; canWrite: boolean; canReadRevenue: boolean; products: UsProduct[]; records: UsSalesRecord[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // 직접 입력
  const [saleOpen, setSaleOpen] = React.useState(false);
  const [saleProduct, setSaleProduct] = React.useState("");
  const [saleQty, setSaleQty] = React.useState("1");
  const [saleAmount, setSaleAmount] = React.useState("0");
  const [saleDate, setSaleDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [saleError, setSaleError] = React.useState<string | null>(null);

  // CSV 가져오기
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  const [preview, setPreview] = React.useState<CsvRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [csvError, setCsvError] = React.useState<string | null>(null);

  const [reconcileNotice, setReconcileNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (saleOpen) { setSaleProduct(""); setSaleQty("1"); setSaleAmount("0"); setSaleDate(new Date().toISOString().slice(0, 10)); setSaleError(null); }
  }, [saleOpen]);
  React.useEffect(() => {
    if (csvOpen) { setFileName(""); setPreview([]); setParseError(null); setCsvError(null); }
  }, [csvOpen]);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, onError: (m: string) => void = setError) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { onError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  };

  // CLICK-PATH-209: 재고 차감 실패 건은 서버가 미확정으로 남기고 skipped 로 보고한다 — 조용히 넘기지 않는다.
  const runReconcile = async (file: string) => {
    setBusy(true); setError(null); setReconcileNotice(null);
    try {
      const r = await confirmReconciliation(businessId, file);
      if (!r.ok) { setError(r.message); return; }
      const { affected, skipped } = r.data;
      if (skipped.length > 0) {
        setReconcileNotice(`${affected}건 확정, ${skipped.length}건은 재고 부족 등으로 보류되어 미확정 상태로 남았습니다.`);
      } else {
        setReconcileNotice(`${affected}건 확정했습니다.`);
      }
      router.refresh();
    } finally { setBusy(false); }
  };

  const submitManualSale = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!saleProduct) { setSaleError("상품을 선택하세요."); return; }
    setSaleError(null);
    const ok = await run(() => recordManualSale(businessId, { productId: saleProduct, qty: Number(saleQty), amount: Number(saleAmount), soldAt: saleDate }), setSaleError);
    if (ok) setSaleOpen(false);
  };

  const onFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      parseCsv(text);
    };
    reader.readAsText(file);
  };

  // ponytail: 열 매핑 UI 없이 고정 컬럼(sku,qty,amount,sold_at)만 지원. 필요해지면 매핑 단계 추가.
  function parseCsv(text: string) {
    setParseError(null);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setPreview([]); return; }
    const rows: CsvRow[] = [];
    let start = 0;
    const first = lines[0].split(",");
    if (Number.isNaN(Number(first[1]))) start = 1; // 헤더로 추정되면 건너뜀
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < 4) continue;
      const qty = Number(cols[1]);
      const amount = Number(cols[2]);
      if (!cols[0] || Number.isNaN(qty) || Number.isNaN(amount) || !cols[3]) continue;
      rows.push({ sku: cols[0], qty, amount, soldAt: cols[3] });
    }
    if (rows.length === 0) setParseError("형식(sku,qty,amount,sold_at)에 맞는 행을 찾지 못했습니다.");
    setPreview(rows);
  }

  const confirmImport = async () => {
    if (preview.length === 0 || !fileName) return;
    const ok = await run(() => importSalesCsv(businessId, fileName, preview), setCsvError);
    if (ok) { setPreview([]); setFileName(""); setCsvOpen(false); }
  };

  const pendingByFile = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) if (r.source === "csv_import" && !r.reconciled && r.fileName) m.set(r.fileName, (m.get(r.fileName) ?? 0) + 1);
    return m;
  }, [records]);

  const productName = React.useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const recent = records.slice(0, 30);
  const recentTotal = canReadRevenue ? recent.reduce((s, r) => s + r.amount, 0) : 0;

  return (
    <>
      <PageHeader
        title="매출 기록"
        description="직접 입력한 판매와 CSV로 가져온 키오스크 판매를 출처별로 구분해 기록합니다. 가져온 기록은 대사 확정 후에만 재고가 줄어듭니다."
        meta={pendingByFile.size > 0 ? <span className="rounded-full bg-wb px-2 py-0.5 text-[12px] font-medium text-wt">대사 대기 {Array.from(pendingByFile.values()).reduce((a, b) => a + b, 0)}건</span> : undefined}
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setCsvOpen(true)}>
                <Upload size={15} aria-hidden />CSV 가져오기
              </Button>
              <Button onClick={() => setSaleOpen(true)}>
                <Plus size={15} aria-hidden />판매 기록
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {reconcileNotice && <Alert kind="success">{reconcileNotice}</Alert>}

        {pendingByFile.size > 0 && canWrite && (
          <Card className="p-4 sm:p-5">
            <CardHead title="가져오기 대사 대기" description="파일 단위로 확정하면 매칭된 기록만큼 재고가 차감됩니다. 재고가 부족한 건은 보류됩니다." />
            <ul className="flex flex-col gap-2">
              {Array.from(pendingByFile.entries()).map(([file, count]) => (
                <li key={file} className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--bd)] px-3.5 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-t" title={file}>{file}</span>
                    <span className="text-[12px] text-t3">매칭된 미확정 {count}건</span>
                  </span>
                  <Button variant="primary" size="sm" loading={busy} onClick={() => runReconcile(file)} className="shrink-0">대사 확정(재고 차감)</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-4 sm:p-5">
          <CardHead
            title="최근 매출 기록"
            description={canReadRevenue ? `최근 ${recent.length}건 · 합계 ${recentTotal.toLocaleString()}원` : "최근 30건"}
          />
          {!canReadRevenue ? (
            <p className="flex items-center gap-1.5 py-6 text-center text-[12.5px] text-t3">
              <Lock size={13} aria-hidden /> 매출 합계 조회에는 revenue.read 권한이 필요합니다. 기록 등록은 가능합니다.
            </p>
          ) : records.length === 0 ? (
            <EmptyState
              title="매출 기록이 없습니다."
              description="판매 기록 버튼으로 직접 입력하거나 키오스크 CSV를 가져오세요."
              action={canWrite && <Button size="sm" onClick={() => setSaleOpen(true)}><Plus size={14} aria-hidden />판매 기록</Button>}
            />
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className={`${TABLE} min-w-[560px]`}>
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>판매일</th>
                    <th className={TH}>상품</th>
                    <th className={`${TH} text-right`}>수량</th>
                    <th className={`${TH} text-right`}>금액</th>
                    <th className={TH}>출처</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className={`${TR} h-[48px]`}>
                      <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{r.soldAt}</td>
                      <td className={TD}>
                        <span className="block max-w-[260px] truncate text-t" title={r.productId ? productName.get(r.productId) : r.rawSku ?? undefined}>
                          {(r.productId && productName.get(r.productId)) || r.rawSku || <span className="text-t3">미매칭</span>}
                        </span>
                        {r.rawSku && r.productId && <span className="font-mono text-[11px] text-t3">{r.rawSku}</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-t2`}>{r.qty}</td>
                      <td className={`${TD} text-right tabular-nums font-medium text-t`}>{r.amount.toLocaleString()}원</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-1.5">
                          <Badge kind={r.source === "manual" ? "success" : "warning"}>{r.source === "manual" ? "직접 입력" : "CSV 가져오기"}</Badge>
                          {r.source === "csv_import" && !r.reconciled && <span className="text-[11.5px] text-t3">대사 대기</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        title="판매 기록(직접 입력)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaleOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={() => submitManualSale()} loading={busy}>{busy ? "저장 중…" : "판매 기록"}</Button>
          </>
        }
      >
        <form onSubmit={submitManualSale}>
          <p className="mb-3 flex items-center gap-2 text-[12.5px] text-t2"><Badge kind="info">직접 입력</Badge>지금 판매한 내용을 바로 기록합니다 — 즉시 재고에서 차감됩니다.</p>
          {saleError && <Alert className="mb-3">{saleError}</Alert>}
          <SelectField label="상품" required value={saleProduct} onChange={(e) => setSaleProduct(e.target.value)}>
            <option value="">선택</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (재고 {p.onHand}{p.unit})</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-x-3">
            <Input label="수량" type="number" min={1} inputMode="numeric" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
            <Input label="금액(원)" type="number" inputMode="numeric" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} />
          </div>
          <Input label="판매일" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} wrapperClassName="mb-0" />
        </form>
      </Modal>

      <Modal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title="CSV 가져오기"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCsvOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={confirmImport} loading={busy} disabled={preview.length === 0}>
              <Upload size={14} aria-hidden />{busy ? "가져오는 중…" : "이 내용대로 가져오기"}
            </Button>
          </>
        }
      >
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-t2">
          <Badge kind="warning">수동 가져오기(CSV) — 실시간 연동 아님</Badge>
        </p>
        <p className="mb-3 text-[12.5px] leading-relaxed text-t2">
          열 순서: <span className="font-mono text-t">sku, qty, amount, sold_at</span>(YYYY-MM-DD). 업로드만으로는 재고가 변하지 않습니다 — 목록의 &ldquo;대사 확정&rdquo;을 눌러야 반영됩니다.
        </p>
        {csvError && <Alert className="mb-3">{csvError}</Alert>}
        <label className="mb-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--r-md)] border border-dashed border-[var(--bd2)] px-4 py-3 text-[13px] text-t2 hover:bg-sf2">
          <Upload size={16} className="shrink-0 text-t3" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{fileName || "CSV 파일 선택"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {parseError && <Alert className="mb-3">{parseError}</Alert>}
        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--bd)]">
            <table className={`${TABLE} min-w-[400px] text-[12.5px]`}>
              <thead><tr className={THEAD}><th className={TH}>SKU</th><th className={`${TH} text-right`}>수량</th><th className={`${TH} text-right`}>금액</th><th className={TH}>판매일</th></tr></thead>
              <tbody>{preview.slice(0, 20).map((r, i) => (
                <tr key={i} className={`${TR} h-[40px]`}><td className={`${TD} font-mono`}>{r.sku}</td><td className={`${TD} text-right tabular-nums`}>{r.qty}</td><td className={`${TD} text-right tabular-nums`}>{r.amount.toLocaleString()}</td><td className={`${TD} tabular-nums`}>{r.soldAt}</td></tr>
              ))}</tbody>
            </table>
            <p className="border-t border-[var(--bd)] px-3 py-2 text-[11.5px] text-t3">미리보기 {Math.min(20, preview.length)}/{preview.length}행 · 파일: {fileName}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
