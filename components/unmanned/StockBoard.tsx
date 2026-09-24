"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Pencil } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { UsProduct, ReconciliationRow, UsStockTake, UsStockTakeLine, LossReport, ReorderSuggestion, UsLot } from "@/lib/domain/unmanned";
import { LossReportCard, ReorderCard, ExpirySummaryCard } from "./StockInsights";
import { adjustStock, startStockTake, setStockTakeCount, completeStockTake } from "@/lib/domain/unmanned-actions";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { CardHead, SelectField, Alert, CONTROL_SM, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";

export function StockBoard({
  businessId, canAdjust, products, reconciliation, openTake, openTakeLines, businessName, todayKey, loss, reorder, reorderText, expiring,
}: {
  businessId: string;
  canAdjust: boolean;
  products: UsProduct[];
  reconciliation: ReconciliationRow[];
  openTake: UsStockTake | null;
  openTakeLines: UsStockTakeLine[];
  businessName: string;
  todayKey: string;
  loss: LossReport | null;
  reorder: ReorderSuggestion[] | null;
  reorderText: string;
  expiring: (UsLot & { productName: string })[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [adjOpen, setAdjOpen] = React.useState(false);
  const [adjProduct, setAdjProduct] = React.useState("");
  const [adjQty, setAdjQty] = React.useState("");
  const [adjReason, setAdjReason] = React.useState("");
  const [adjDisposal, setAdjDisposal] = React.useState(false);
  const [adjError, setAdjError] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (adjOpen) { setAdjProduct(""); setAdjQty(""); setAdjReason(""); setAdjDisposal(false); setAdjError(null); }
  }, [adjOpen]);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  };

  const submitAdjust = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!adjProduct || !adjQty || !adjReason.trim()) { setAdjError("상품·수량·사유를 모두 입력하세요."); return; }
    setAdjError(null);
    setBusy(true);
    try {
      const r = await adjustStock(businessId, { productId: adjProduct, qtyDelta: Number(adjQty), reason: adjReason, disposal: adjDisposal });
      if (!r.ok) { setAdjError(r.message ?? "처리하지 못했습니다."); return; }
      setAdjOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  };

  // 실사 카운트 입력 — 표와 카드가 같은 입력·같은 저장 동작을 쓴다.
  const countInput = (l: UsStockTakeLine) => (
    <input
      type="number"
      aria-label={`${l.productName} 실사 카운트`}
      value={counts[l.id] ?? l.countedQty ?? ""}
      onChange={(e) => setCounts((c) => ({ ...c, [l.id]: e.target.value }))}
      onBlur={(e) => e.target.value !== "" && run(() => setStockTakeCount(businessId, l.id, Number(e.target.value)))}
      className={`${CONTROL_SM} w-[88px] text-right`}
    />
  );

  const countedLines = openTakeLines.filter((l) => l.countedQty != null).length;
  const diffLines = openTakeLines.filter((l) => l.diffQty !== 0).length;
  const unreconciled = reconciliation.filter((r) => r.unreconciledQty !== 0).length;

  return (
    <>
      <PageHeader
        title="재고·실사"
        description="키오스크 매출과 실재고의 차이를 실사로 잡고, 조정·폐기는 사유와 함께 원장에 남깁니다."
        meta={openTake ? <span className="rounded-full bg-wb px-2 py-0.5 text-[12px] font-medium text-wt">실사 진행 중</span> : undefined}
        actions={
          canAdjust ? (
            <>
              <Button variant="secondary" onClick={() => setAdjOpen(true)}>
                <Pencil size={15} aria-hidden />재고 조정
              </Button>
              {!openTake && (
                <Button loading={busy} onClick={() => run(() => startStockTake(businessId))}>
                  <ClipboardCheck size={15} aria-hidden />새 실사 시작
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}

        <Card className="p-4 sm:p-5">
          <CardHead
            title="재고 실사"
            description={
              openTake
                // ponytail: toLocaleString("ko-KR") → formatInTz(ICU 오전/오후 표기 차이로 인한 hydration 오류 방지).
                ? `시작 ${formatInTz(openTake.startedAt, DEFAULT_TZ, "yyyy. M. d. HH:mm")} · 입력 ${countedLines}/${openTakeLines.length} · 차이 ${diffLines}건`
                : "실사를 시작하면 전 상품의 전산 재고가 한 줄씩 나열됩니다. 카운트를 입력하면 자동 저장됩니다."
            }
          />
          {!openTake ? (
            <EmptyState
              title="진행 중인 실사가 없습니다."
              description={canAdjust ? "새 실사 시작 버튼으로 전체 실사를 시작하세요." : "재고 조정 권한(inventory.adjust)이 있는 사용자가 실사를 시작할 수 있습니다."}
              action={canAdjust && <Button size="sm" loading={busy} onClick={() => run(() => startStockTake(businessId))}><ClipboardCheck size={14} aria-hidden />새 실사 시작</Button>}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <TableOrCards
                rows={openTakeLines}
                keyOf={(l) => l.id}
                table={
                  <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                    <table className={`${TABLE} min-w-[560px]`}>
                      <thead>
                        <tr className={THEAD}>
                          <th className={TH}>상품</th>
                          <th className={`${TH} text-right`}>전산 재고</th>
                          <th className={`${TH} text-right`}>실사 카운트</th>
                          <th className={`${TH} text-right`}>차이</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openTakeLines.map((l) => (
                          <tr key={l.id} className={`${TR} h-[52px]`}>
                            <td className={TD}><CellName max={280}>{l.productName}</CellName></td>
                            <td className={`${TD} text-right tabular-nums text-t2`}>{l.expectedQty}</td>
                            <td className={`${TD} text-right`}>{countInput(l)}</td>
                            <td className={`${TD} text-right tabular-nums ${l.diffQty !== 0 ? "font-semibold text-et" : "text-t3"}`}>{l.diffQty > 0 ? `+${l.diffQty}` : l.diffQty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
                card={(l) => (
                  <MobileCard
                    title={l.productName}
                    badge={<span className={"text-[12.5px] tabular-nums " + (l.diffQty !== 0 ? "font-semibold text-et" : "text-t3")}>차이 {l.diffQty > 0 ? `+${l.diffQty}` : l.diffQty}</span>}
                    fields={[
                      ["전산 재고", l.expectedQty],
                      ["실사 카운트", countInput(l)],
                    ]}
                  />
                )}
              />
              {canAdjust && (
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={() => { if (window.confirm("실사를 완료 처리하면 차이만큼 재고 원장이 생성되고 되돌릴 수 없습니다. 계속할까요?")) run(() => completeStockTake(businessId, openTake.id)); }}
                  >
                    실사 완료 처리(차이 {diffLines}건 반영)
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <ReorderCard rows={reorder} reorderText={reorderText} />
            <LossReportCard report={loss} businessName={businessName} />
          </div>
          <div className="lg:col-span-4">
            <ExpirySummaryCard lots={expiring} businessName={businessName} todayKey={todayKey} />
          </div>
        </div>

        <Card className="p-4 sm:p-5">
          <CardHead
            title="재고 대사"
            description="매출 기록 수량과 출고 반영 수량, 실사 차이를 상품별로 맞춰 봅니다."
            action={unreconciled > 0 ? <span className="rounded-full bg-eb px-2 py-0.5 text-[12px] font-medium tabular-nums text-et">미대사 {unreconciled}종</span> : undefined}
          />
          {reconciliation.length === 0 ? <EmptyState title="대사할 데이터가 없습니다." description="상품과 매출 기록이 생기면 여기서 차이를 확인합니다." /> : (
            <TableOrCards
              rows={reconciliation}
              keyOf={(r) => r.productId}
              table={
                <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                  <table className={`${TABLE} min-w-[640px]`}>
                    <thead>
                      <tr className={THEAD}>
                        <th className={TH}>상품</th>
                        <th className={`${TH} text-right`}>매출기록 수량</th>
                        <th className={`${TH} text-right`}>출고 반영 수량</th>
                        <th className={`${TH} text-right`}>실사 차이 누계</th>
                        <th className={`${TH} text-right`}>현재고</th>
                        <th className={`${TH} text-right`}>미대사</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliation.map((r) => (
                        <tr key={r.productId} className={`${TR} h-[48px]`}>
                          <td className={TD}><CellName max={280}>{r.name}</CellName></td>
                          <td className={`${TD} text-right tabular-nums text-t2`}>{r.salesQty}</td>
                          <td className={`${TD} text-right tabular-nums text-t2`}>{r.saleOutQty}</td>
                          <td className={`${TD} text-right tabular-nums text-t2`}>{r.stockTakeDiff}</td>
                          <td className={`${TD} text-right tabular-nums text-t`}>{r.onHand}</td>
                          <td className={`${TD} text-right tabular-nums ${r.unreconciledQty !== 0 ? "font-semibold text-et" : "text-okt"}`}>{r.unreconciledQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
              card={(r) => (
                <MobileCard
                  title={r.name}
                  badge={<span className={"text-[12.5px] tabular-nums " + (r.unreconciledQty !== 0 ? "font-semibold text-et" : "text-okt")}>미대사 {r.unreconciledQty}</span>}
                  fields={[
                    ["매출기록 수량", r.salesQty],
                    ["출고 반영 수량", r.saleOutQty],
                    ["실사 차이 누계", r.stockTakeDiff],
                    ["현재고", r.onHand],
                  ]}
                />
              )}
            />
          )}
        </Card>
      </div>

      <Modal
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        title="재고 조정 / 폐기"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={() => submitAdjust()} loading={busy}>{busy ? "저장 중…" : "조정 저장"}</Button>
          </>
        }
      >
        <form onSubmit={submitAdjust}>
          {adjError && <Alert className="mb-3">{adjError}</Alert>}
          <SelectField label="상품" required value={adjProduct} onChange={(e) => setAdjProduct(e.target.value)}>
            <option value="">선택</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (현재 {p.onHand}{p.unit})</option>)}
          </SelectField>
          <Input label="증감 수량" required type="number" inputMode="numeric" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} hint="음수를 입력하면 감소합니다. 예: -3" />
          <Input label="사유" required value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="예: 파손 폐기, 입고 누락 정정" />
          <label className="flex min-h-[44px] items-center gap-2 text-[13px] text-t2">
            <input type="checkbox" checked={adjDisposal} onChange={(e) => setAdjDisposal(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--accent-strong)]" />
            폐기로 처리(원장에 폐기로 기록)
          </label>
        </form>
      </Modal>
    </>
  );
}
