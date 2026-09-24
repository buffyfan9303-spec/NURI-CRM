"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck, TriangleAlert, Pencil } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { UsProduct } from "@/lib/domain/unmanned";
import { createProduct, receiveInbound, setSupplierNote } from "@/lib/domain/unmanned-actions";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { StatusTab, FilterRow, SearchBox, TextAction, SelectField, Alert, CONTROL, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";

const BARCODE_TYPES = ["NONE", "EAN13", "CODE128"] as const;

function eanChecksum(v: string): boolean {
  if (!/^\d{13}$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(v[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (s % 10)) % 10 === Number(v[12]);
}

const EMPTY_FORM = { sku: "", name: "", barcode: "", barcodeType: "NONE" as (typeof BARCODE_TYPES)[number], salePrice: "0", costPrice: "0", lowStock: "5", expiryTracked: false };

export function ProductsBoard({
  businessId,
  canWrite,
  canReadCost,
  products,
  lowOnly = false,
}: {
  businessId: string;
  canWrite: boolean;
  canReadCost: boolean;
  products: UsProduct[];
  /** 홈 "부족재고" 지표에서 넘어온 경우 — 서버가 이미 걸러 보낸 목록이라 탭만 그 상태로 표시한다. */
  lowOnly?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [inboundFor, setInboundFor] = React.useState<string | null>(null);
  const [inboundQty, setInboundQty] = React.useState("1");
  const [inboundExpiry, setInboundExpiry] = React.useState("");
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"all" | "low">(lowOnly ? "low" : "all");
  const [noteFor, setNoteFor] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");

  const openNote = (p: UsProduct) => { setNoteFor(p.id); setNoteDraft(p.supplierNote ?? ""); };
  const saveNote = async (productId: string) => {
    setBusy(true); setError(null);
    try {
      const r = await setSupplierNote(businessId, productId, noteDraft);
      if (!r.ok) { setError(r.message); return; }
      setNoteFor(null);
      router.refresh();
    } finally { setBusy(false); }
  };

  // CLICK-PATH-212 와 같은 규칙: 모달을 다시 열면 이전 입력이 남지 않게 초기화.
  React.useEffect(() => {
    if (newOpen) { setForm(EMPTY_FORM); setError(null); }
  }, [newOpen]);

  const barcodeError = form.barcodeType === "EAN13" && form.barcode && !eanChecksum(form.barcode)
    ? "EAN-13 체크섬이 올바르지 않습니다."
    : form.barcodeType !== "NONE" && !form.barcode
    ? "이 형식은 바코드 값이 필요합니다."
    : null;

  const submitProduct = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || barcodeError) return;
    if (!form.sku.trim() || !form.name.trim()) { setError("SKU와 상품명은 필수입니다."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await createProduct(businessId, {
        sku: form.sku, name: form.name, barcode: form.barcode || undefined, barcodeType: form.barcodeType,
        salePrice: Number(form.salePrice) || 0, costPrice: Number(form.costPrice) || 0,
        lowStockThreshold: Number(form.lowStock) || 0, expiryTracked: form.expiryTracked,
      });
      if (!result.ok) { setError(result.message); return; }
      setForm(EMPTY_FORM);
      setNewOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  };

  // CLICK-PATH-215: 상품 A의 입고 폼을 닫고 B를 열 때 이전 수량/유통기한이 남지 않게 초기화.
  const openInbound = (productId: string) => {
    if (inboundFor === productId) { setInboundFor(null); return; }
    setInboundFor(productId);
    setInboundQty("1");
    setInboundExpiry("");
  };

  const submitInbound = async (productId: string) => {
    setBusy(true); setError(null);
    try {
      const result = await receiveInbound(businessId, { productId, qty: Number(inboundQty) || 0, expiryDate: inboundExpiry || undefined });
      if (!result.ok) { setError(result.message); return; }
      setInboundFor(null); setInboundQty("1"); setInboundExpiry("");
      router.refresh();
    } finally { setBusy(false); }
  };

  const needle = q.trim().toLowerCase();
  const lowCount = products.filter((p) => p.lowStock).length;
  const filtered = products.filter(
    (p) => (tab === "all" || p.lowStock) && (!needle || `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase().includes(needle))
  );
  const filtersActive = !!needle || tab !== "all";

  // 표와 카드가 같은 값·같은 권한 조건·같은 입고 폼을 쓰도록 한 곳에서 계산한다.
  const rowView = (p: UsProduct) => ({
    expiryBadge: p.expiryTracked ? <span className="inline-block rounded-[5px] bg-sf2 px-1.5 py-px text-[11px] text-t3">유통기한 추적</span> : null,
    barcode: p.barcode ? <><span className="font-mono tabular-nums">{p.barcode}</span>{p.barcodeType !== "NONE" && <span className="ml-1 text-t3">({p.barcodeType})</span>}</> : <span className="text-t3">-</span>,
    salePrice: `${p.salePrice.toLocaleString()}원`,
    costPrice: p.costPrice == null ? "-" : `${p.costPrice.toLocaleString()}원`,
    stock: (
      <span className={p.lowStock ? "inline-flex items-center gap-1 font-semibold tabular-nums text-et" : "tabular-nums text-t"}>
        {p.lowStock && <TriangleAlert size={12} aria-hidden />}
        {p.onHand}{p.unit}
        {p.lowStock && <span className="text-[10.5px] font-medium">저재고</span>}
      </span>
    ),
    supplier: canWrite ? (
      noteFor === p.id ? (
        <form onSubmit={(e) => { e.preventDefault(); saveNote(p.id); }} className="flex items-center gap-1.5">
          <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="도매처·발주 메모" aria-label="도매처 메모" className={`${CONTROL} h-[32px] w-[180px] px-2 text-[12.5px] [@media(pointer:coarse)]:h-[44px]`} autoFocus />
          <Button type="submit" size="sm" loading={busy}>저장</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setNoteFor(null)}>취소</Button>
        </form>
      ) : (
        <button type="button" onClick={() => openNote(p)} className="group inline-flex h-[32px] max-w-[220px] items-center gap-1 rounded-[var(--r-sm)] px-1.5 text-left text-[12.5px] text-t2 hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]" title={p.supplierNote ?? "도매처 메모 추가"}>
          <span className="truncate">{p.supplierNote ?? <span className="text-t3">메모 추가</span>}</span>
          <Pencil size={12} className="shrink-0 text-t3" aria-hidden />
        </button>
      )
    ) : (
      <span className="block max-w-[220px] truncate text-t2" title={p.supplierNote ?? undefined}>{p.supplierNote ?? <span className="text-t3">-</span>}</span>
    ),
    inboundOpen: inboundFor === p.id,
    inboundButton: (
      <Button variant={inboundFor === p.id ? "primary" : "secondary"} size="sm" className="min-w-[64px] justify-center" onClick={() => openInbound(p.id)} aria-expanded={inboundFor === p.id}>
        <Truck size={13} aria-hidden />입고
      </Button>
    ),
    inboundForm: (
      <form onSubmit={(e) => { e.preventDefault(); submitInbound(p.id); }} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11.5px] font-medium text-t2">
          수량
          <input type="number" min={1} value={inboundQty} onChange={(e) => setInboundQty(e.target.value)} className={`${CONTROL} w-[96px]`} />
        </label>
        {p.expiryTracked && (
          <label className="flex flex-col gap-1 text-[11.5px] font-medium text-t2">
            유통기한(필수)
            <input type="date" required value={inboundExpiry} onChange={(e) => setInboundExpiry(e.target.value)} className={`${CONTROL} w-[160px]`} />
          </label>
        )}
        <Button type="submit" size="sm" variant="primary" loading={busy} className="h-[40px] [@media(pointer:coarse)]:h-[44px]">입고 확정</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setInboundFor(null)} className="h-[40px] [@media(pointer:coarse)]:h-[44px]">취소</Button>
      </form>
    ),
  });

  return (
    <>
      <PageHeader
        title="상품·바코드"
        description="상품 마스터와 바코드, 판매가·저재고 기준을 관리합니다. 입고는 상품 행에서 바로 기록합니다."
        meta={<span className="rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">{products.length}종</span>}
        actions={
          <Button
            onClick={() => setNewOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : "상품 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요."}
          >
            <Plus size={15} aria-hidden />
            상품 등록
          </Button>
        }
      >
        {products.length > 0 && (
          <FilterRow>
            <StatusTab active={tab === "all"} onClick={() => setTab("all")} count={products.length}>전체</StatusTab>
            <StatusTab active={tab === "low"} onClick={() => setTab("low")} count={lowCount}>저재고</StatusTab>
            <span className="mx-1 hidden h-4 w-px bg-[var(--bd)] sm:block" aria-hidden />
            <SearchBox value={q} onChange={setQ} placeholder="상품명/SKU/바코드 검색" className="min-w-[200px]" />
            {filtersActive && !lowOnly && <TextAction onClick={() => { setQ(""); setTab("all"); }}>필터 초기화</TextAction>}
          </FilterRow>
        )}
      </PageHeader>

      {error && <Alert className="mb-4">{error}</Alert>}

      {products.length === 0 ? (
        <Card>
          <EmptyState
            title={lowOnly ? "부족 재고 상품이 없습니다." : "등록된 상품이 없습니다."}
            description={lowOnly ? "저재고 임계값 아래로 내려간 상품이 여기 표시됩니다." : "상품 등록 버튼으로 첫 상품과 바코드를 추가하세요."}
            action={canWrite && !lowOnly && <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} aria-hidden />상품 등록</Button>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState title="검색·필터 결과가 없습니다." description="검색어나 저재고 필터를 조정해 보세요." action={<TextAction onClick={() => { setQ(""); setTab("all"); }}>필터 초기화</TextAction>} />
        </Card>
      ) : (
        <TableOrCards
          rows={filtered}
          keyOf={(p) => p.id}
          table={
            <Card className="overflow-x-auto">
              <table className={`${TABLE} min-w-[960px]`}>
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>SKU</th>
                    <th className={TH}>상품명</th>
                    <th className={TH}>바코드</th>
                    <th className={`${TH} text-right`}>판매가</th>
                    {canReadCost && <th className={`${TH} text-right`}>원가</th>}
                    <th className={`${TH} text-right`}>재고</th>
                    <th className={TH}>도매처 메모</th>
                    {canWrite && <th className={TH}>입고</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const v = rowView(p);
                    return (
                      <React.Fragment key={p.id}>
                        <tr className={`${TR} h-[52px]`}>
                          <td className={`${TD} font-mono text-[12px] text-t2`}>{p.sku}</td>
                          <td className={TD}>
                            <CellName max={240}>{p.name}</CellName>
                            {v.expiryBadge && <div className="mt-0.5">{v.expiryBadge}</div>}
                          </td>
                          <td className={`${TD} text-t2`}>{v.barcode}</td>
                          <td className={`${TD} text-right tabular-nums text-t`}>{v.salePrice}</td>
                          {canReadCost && <td className={`${TD} text-right tabular-nums text-t2`}>{v.costPrice}</td>}
                          <td className={`${TD} text-right`}>{v.stock}</td>
                          <td className={TD}>{v.supplier}</td>
                          {canWrite && <td className={TD}>{v.inboundButton}</td>}
                        </tr>
                        {v.inboundOpen && (
                          <tr className="border-b border-[var(--bd)] bg-sf2/40 last:border-b-0">
                            <td colSpan={8} className="px-4 py-3">{v.inboundForm}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          }
          card={(p) => {
            const v = rowView(p);
            return (
              <MobileCard
                title={p.name}
                sub={<><span className="font-mono">{p.sku}</span>{v.expiryBadge}</>}
                badge={v.stock}
                fields={[
                  ["바코드", v.barcode],
                  ["판매가", v.salePrice],
                  ...(canReadCost ? ([["원가", v.costPrice]] as [string, React.ReactNode][]) : []),
                  ["도매처 메모", v.supplier],
                ]}
                actions={canWrite ? v.inboundButton : undefined}
              >
                {v.inboundOpen && v.inboundForm}
              </MobileCard>
            );
          }}
        />
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="상품 등록"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={() => submitProduct()} loading={busy} disabled={!!barcodeError}>{busy ? "저장 중…" : "등록"}</Button>
          </>
        }
      >
        <form onSubmit={submitProduct}>
          {error && <Alert className="mb-3">{error}</Alert>}
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <Input label="SKU" required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="US-109" />
            <Input label="상품명" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <SelectField label="바코드 형식" value={form.barcodeType} onChange={(e) => setForm((f) => ({ ...f, barcodeType: e.target.value as typeof f.barcodeType }))}>
              {BARCODE_TYPES.map((t) => <option key={t} value={t}>{t === "NONE" ? "없음" : t}</option>)}
            </SelectField>
            <Input label="바코드" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} error={barcodeError ?? undefined} inputMode="numeric" />
            <Input label="판매가(원)" type="number" inputMode="numeric" value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} />
            {canReadCost && <Input label="원가(원)" type="number" inputMode="numeric" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />}
            <Input label="저재고 임계값" type="number" inputMode="numeric" value={form.lowStock} onChange={(e) => setForm((f) => ({ ...f, lowStock: e.target.value }))} hint="재고가 이 값 이하로 내려가면 홈과 목록에 저재고로 표시됩니다." />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-[13px] text-t2">
            <input type="checkbox" checked={form.expiryTracked} onChange={(e) => setForm((f) => ({ ...f, expiryTracked: e.target.checked }))} className="h-[18px] w-[18px] accent-[var(--accent-strong)]" />
            유통기한 추적(입고 시 유통기한 필수)
          </label>
        </form>
      </Modal>
    </>
  );
}
