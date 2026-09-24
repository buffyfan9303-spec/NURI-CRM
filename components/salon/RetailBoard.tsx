"use client";

/**
 * 상품·소모품 재고 — 4열 표(상품 / 재고 / 가격 / 판매). 등록은 모달. 판매는 행에서 수량 입력 후 확인.
 * 레퍼런스: Square 재고 화면(검색 → 리스트, 부족 재고는 배지로 즉시 구분).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Package } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CellName } from "@/components/ui/ResponsiveTable";
import { CardHead, Alert, SearchBox, TABLE, THEAD, TH, TR, TD, CONTROL_SM } from "@/components/rental/listkit";
import type { RetailItem } from "@/lib/domain/salon";
import { createRetailItem, sellRetailItem, addRetailStock } from "@/lib/domain/salon-actions";
import { formatKRW } from "@/lib/domain/money";

export function RetailBoard({ businessId, canWrite, canAdjust, items }: { businessId: string; canWrite: boolean; canAdjust: boolean; items: RetailItem[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sellQty, setSellQty] = React.useState<Record<string, string>>({});
  const [inboundFor, setInboundFor] = React.useState<RetailItem | null>(null);

  const filtered = q.trim() ? items.filter((it) => it.name.toLowerCase().includes(q.trim().toLowerCase())) : items;
  const lowCount = items.filter((it) => it.stockQty <= it.lowStockThreshold).length;

  const sell = async (it: RetailItem) => {
    const qty = Number(sellQty[it.id] ?? "1") || 1;
    if (!window.confirm(`${it.name} ${qty}개를 판매 처리합니다(재고 차감 + 매출 기록). 계속할까요?`)) return;
    setBusy(it.id); setError(null);
    try {
      const r = await sellRetailItem(businessId, { retailItemId: it.id, qty });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      setSellQty((s) => ({ ...s, [it.id]: "1" }));
      router.refresh();
    } catch {
      // QA2-S02: 서버 액션이 throw하면 예외가 조용히 빠져나가 화면이 무반응처럼 보였다.
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader
        title="상품·소모품"
        description="판매 상품과 시술 소모품의 재고. 기준 수량 이하는 홈 '재고 주의'에 올라옵니다."
        meta={lowCount > 0 ? <Badge kind="warning">부족 {lowCount}</Badge> : undefined}
        actions={canWrite ? <Button onClick={() => setOpen(true)}><Plus size={15} aria-hidden />소모품 등록</Button> : undefined}
      >
        <SearchBox value={q} onChange={setQ} placeholder="상품명 검색" />
      </PageHeader>

      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="p-4 sm:p-5">
        <CardHead title="재고 목록" description={`${filtered.length}개`} />
        {items.length === 0 ? (
          <EmptyState title="등록된 소모품이 없습니다." description="판매 상품과 소모품을 등록하면 재고와 판매 기록이 여기에 쌓입니다." action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>소모품 등록</Button> : undefined} />
        ) : filtered.length === 0 ? (
          <EmptyState title="검색 결과가 없습니다." description={`"${q}" 에 해당하는 상품이 없습니다.`} />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className={`${TABLE} min-w-[520px]`}>
              <thead>
                <tr className={THEAD}>
                  <th className={TH}>상품</th>
                  <th className={`${TH} text-right`}>재고</th>
                  <th className={`${TH} text-right`}>가격</th>
                  {canAdjust && <th className={`${TH} text-right`}>판매</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const low = it.stockQty <= it.lowStockThreshold;
                  return (
                    <tr key={it.id} className={`${TR} h-[52px]`}>
                      <td className={TD}>
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-sf2 text-t3" aria-hidden><Package size={15} /></span>
                          <CellName max={260}>{it.name}</CellName>
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        {low ? <Badge kind="warning">재고 {it.stockQty}</Badge> : <span className="tabular-nums text-t">{it.stockQty}</span>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{formatKRW(it.price)}</td>
                      {canAdjust && (
                        <td className={`${TD} text-right`}>
                          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => setInboundFor(it)}>입고</Button>
                            <input
                              type="number"
                              min={1}
                              value={sellQty[it.id] ?? "1"}
                              onChange={(e) => setSellQty((s) => ({ ...s, [it.id]: e.target.value }))}
                              aria-label={`${it.name} 판매 수량`}
                              className={`${CONTROL_SM} w-[64px] text-right tabular-nums`}
                            />
                            <Button variant="secondary" size="sm" loading={busy === it.id} onClick={() => sell(it)}>판매</Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewItemModal businessId={businessId} open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); router.refresh(); }} />

      <InboundModal
        businessId={businessId}
        item={inboundFor}
        onClose={() => setInboundFor(null)}
        onDone={() => { setInboundFor(null); router.refresh(); }}
      />
    </>
  );
}

function NewItemModal({ businessId, open, onClose, onCreated }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setName(""); setPrice(""); setError(null); } }, [open]);

  const submit = async () => {
    if (!name.trim()) { setError("상품명을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await createRetailItem(businessId, { name: name.trim(), price: Number(price) || 0 });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onCreated();
    } catch {
      // QA2-S02: 서버 액션이 throw하면 예외가 조용히 빠져나가 모달이 무반응처럼 보였다.
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="소모품 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>등록</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Input label="상품명" required value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="예: 헤어 에센스 100ml" />
        <Input label="판매 가격(원)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" hint="재고 수량과 부족 기준은 등록 후 입고·조정으로 관리합니다." wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}

/** QA2-S03: 등록만으로는 재고 0이라 팔 수 없던 것을 여기서 입고 수량을 더해 채운다. */
function InboundModal({ businessId, item, onClose, onDone }: { businessId: string; item: RetailItem | null; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = React.useState("1");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (item) { setQty("1"); setError(null); } }, [item]);

  const submit = async () => {
    if (!item) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) { setError("입고 수량은 1 이상의 정수여야 합니다."); return; }
    setBusy(true); setError(null);
    try {
      const r = await addRetailStock(businessId, item.id, n);
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onDone();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="소모품 입고"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>입고</Button>
        </>
      }
    >
      {item && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
          {error && <Alert className="mb-4">{error}</Alert>}
          <p className="mb-3 text-[12.5px] text-t2">{item.name} · 현재 재고 {item.stockQty}개</p>
          <Input label="입고 수량" type="number" min={1} required inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus wrapperClassName="mb-0" />
        </form>
      )}
    </Modal>
  );
}
