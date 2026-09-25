"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Search } from "@/lib/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatKRW, parseKRW, sumItemFees } from "@/lib/domain/money";
import { UNIT_BLOCKED, UNIT_STATUS_LABEL, type ProductWithChildren, type CustomerRow } from "@/lib/domain/rental-types";
import { createReservationDraft, checkAvailabilityAction } from "@/lib/domain/rental-actions";
import { getCustomerMoneySummaryAction } from "@/lib/domain/rental-money-queries";
import type { CustomerMoneySummary } from "@/lib/domain/rental-money-types";
import { CardHead, Alert, CONTROL } from "./listkit";

interface Row {
  key: string;
  productId: string;
  skuId: string;
  unitId: string; // "" = 개체 미배정(수량만)
  qty: string;
  fee: string;
  discount: string;
  availability?: string;
}

function newRow(): Row {
  return { key: crypto.randomUUID(), productId: "", skuId: "", unitId: "", qty: "1", fee: "", discount: "0" };
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReservationForm({
  businessId,
  products,
  customers,
  initialCustomerId,
  initialCustomerName,
  initialCustomerPhone,
}: {
  businessId: string;
  products: ProductWithChildren[];
  customers: CustomerRow[];
  /** 고객 상세 "새 예약"에서 넘어왔을 때 미리 채워둔다(결함 D7 §3). 0027: id 도 같이 넘겨 customer_ref 로 연결. */
  initialCustomerId?: string;
  initialCustomerName?: string;
  initialCustomerPhone?: string;
}) {
  const router = useRouter();
  const idempotencyKey = React.useRef(crypto.randomUUID()).current;

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 24 * 3600000);
  const defaultEnd = new Date(now.getTime() + 72 * 3600000);

  const [customerId, setCustomerId] = React.useState<string | null>(initialCustomerId ?? null);
  const [customerName, setCustomerName] = React.useState(initialCustomerName ?? "");
  const [customerPhone, setCustomerPhone] = React.useState(initialCustomerPhone ?? "");
  const [customerQ, setCustomerQ] = React.useState("");
  const [money, setMoney] = React.useState<CustomerMoneySummary | null>(null);

  // 고객을 고르면 미수·보관 보증금 요약을 받아 경고한다(권한 없으면 여부만 온다). 구 DB 면 실패 → 조용히 무표시.
  React.useEffect(() => {
    if (!customerId) { setMoney(null); return; }
    let live = true;
    getCustomerMoneySummaryAction(businessId, customerId).then((r) => { if (live) setMoney(r.ok ? r.data : null); });
    return () => { live = false; };
  }, [businessId, customerId]);

  const customerMatches = React.useMemo(() => {
    const q = customerQ.trim();
    if (!q) return [];
    return customers.filter((c) => c.name.includes(q) || (c.phone ?? "").replace(/-/g, "").includes(q.replace(/-/g, ""))).slice(0, 8);
  }, [customers, customerQ]);
  const pickCustomer = (c: CustomerRow) => {
    setCustomerId(c.id); setCustomerName(c.name); if (c.phone) setCustomerPhone(c.phone); setCustomerQ("");
  };
  const clearCustomer = () => { setCustomerId(null); setMoney(null); };
  const [start, setStart] = React.useState(toLocalInput(defaultStart));
  const [end, setEnd] = React.useState(toLocalInput(defaultEnd));
  const [fittingAt, setFittingAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([newRow()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const productById = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const quote = sumItemFees(
    rows.map((r) => {
      const product = productById.get(r.productId);
      return { fee: r.fee ? parseKRW(r.fee) : product?.baseFee ?? 0, discount: parseKRW(r.discount || "0") };
    })
  );
  const depositTotal = rows.reduce((sum, r) => {
    const product = productById.get(r.productId);
    if (!product) return sum;
    const qty = r.unitId ? 1 : Number(r.qty) || 1;
    return sum + product.depositAmount * qty;
  }, 0);

  const checkRowAvailability = async (row: Row) => {
    if (!row.skuId || row.unitId) return; // 개체 직접 지정은 확정 시 서버가 상태/겹침을 검사한다
    if (!start || !end) return;
    const requestedSkuId = row.skuId;
    const r = await checkAvailabilityAction(businessId, row.skuId, new Date(start).toISOString(), new Date(end).toISOString());
    // CLICK-PATH-223: 응답이 오는 사이 사용자가 SKU를 바꿨으면 늦게 온 응답을 버린다(요청 시점 SKU와 현재 SKU가 같을 때만 반영).
    setRows((rs) => rs.map((cur) => (cur.key === row.key && cur.skuId === requestedSkuId ? { ...cur, availability: r.ok ? `가용 ${r.data.remaining}개(참고용)` : r.message } : cur)));
  };

  const submit = async () => {
    setError(null);
    if (!start || !end) { setError("대여/반납 일시를 입력하세요."); return; }
    if (new Date(end) <= new Date(start)) { setError("반납 일시는 대여 일시보다 뒤여야 합니다."); return; }
    const items = rows.filter((r) => r.productId);
    if (items.length === 0) { setError("최소 1개의 상품 항목이 필요합니다."); return; }
    for (const r of items) {
      if (!r.skuId && !r.unitId) { setError("각 항목에는 SKU 또는 개체를 지정해야 합니다."); return; }
    }

    setBusy(true);
    const result = await createReservationDraft(businessId, {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      fittingAt: fittingAt ? new Date(fittingAt).toISOString() : undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerId: customerId ?? undefined,
      notes: notes || undefined,
      idempotencyKey,
      items: items.map((r) => ({
        productId: r.productId,
        skuId: r.skuId || undefined,
        unitId: r.unitId || undefined,
        qty: r.unitId ? 1 : Number(r.qty) || 1,
        fee: r.fee ? parseKRW(r.fee) : undefined,
        discount: parseKRW(r.discount || "0"),
      })),
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    router.push(`/w/${businessId}/reservations/${result.data.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      {/* PC: 왼쪽 고객·기간·품목·배정 / 오른쪽 가용성·금액·보증금 요약(§5.7). 태블릿 이하는 한 열. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-5">
        <CardHead title="고객" description="기존 고객을 검색해 고르면 예약이 그 고객에 연결됩니다. 고르지 않으면 이름/전화 스냅샷만 저장됩니다." />
        {customerId ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-[13px]">
            <span className="font-medium text-[var(--accent-ink)]">선택된 고객: {customerName}</span>
            {money && (money.masked
              ? (money.hasOutstanding ? <Badge kind="warning">미수 있음</Badge> : <Badge kind="success">미수 없음</Badge>)
              : (money.hasOutstanding
                ? <Badge kind="warning">미수 {formatKRW(money.outstandingTotal)} · {money.reservationsWithOutstanding}건</Badge>
                : <Badge kind="success">미수 없음</Badge>))}
            {money?.hasDeposit && <Badge kind="info">보증금 보관 중{!money.masked && money.depositHeldTotal != null ? ` ${formatKRW(money.depositHeldTotal)}` : ""}</Badge>}
            <button type="button" onClick={clearCustomer} className="ml-auto inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] text-t2 hover:bg-sf [@media(pointer:coarse)]:h-[44px]" aria-label="고객 선택 해제">
              <X size={13} aria-hidden />해제
            </button>
          </div>
        ) : (
          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-[12px] text-t3 [@media(pointer:coarse)]:top-[14px]" aria-hidden />
            <input value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder="기존 고객 검색(이름·전화)" aria-label="기존 고객 검색" className={CONTROL + " pl-9"} />
            {customerMatches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--r-md)] border border-[var(--bd)] bg-sf shadow-modal" role="listbox">
                {customerMatches.map((c) => (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={false} onClick={() => pickCustomer(c)} className="flex min-h-[40px] w-full items-center justify-between gap-2 px-3 text-left text-[13px] hover:bg-sf2 [@media(pointer:coarse)]:min-h-[44px]">
                      <span className="truncate font-medium text-t">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-t3">{c.phone ?? (c.hasPhone ? "전화 비공개" : "")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {customerQ.trim() && customerMatches.length === 0 && <p className="mt-1 text-[11.5px] text-t3">일치하는 고객이 없습니다. 아래에 이름/전화를 직접 입력하면 새 고객으로 취급됩니다.</p>}
          </div>
        )}
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Input label="고객 이름" value={customerName} onChange={(e) => { setCustomerName(e.target.value); if (customerId) clearCustomer(); }} wrapperClassName="mb-3 sm:mb-0" />
          <Input label="전화번호" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" wrapperClassName="mb-0" />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHead title="기간" description="반납 일시는 대여 일시보다 뒤여야 합니다." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-t2">
            <span>대여 일시 <span className="text-et" aria-hidden>*</span></span>
            <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={CONTROL} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-t2">
            <span>반납 일시 <span className="text-et" aria-hidden>*</span></span>
            <input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={CONTROL} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-t2">
            피팅 예약(선택)
            <input type="datetime-local" value={fittingAt} onChange={(e) => setFittingAt(e.target.value)} className={CONTROL} />
          </label>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHead
          title="항목"
          description="상품 → SKU → 개체 순서로 고릅니다. 개체를 지정하지 않으면 수량만 잡고 확정 시 배정합니다."
          action={
            <Button size="sm" variant="secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
              <Plus size={13} aria-hidden />
              항목 추가
            </Button>
          }
        />
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const product = productById.get(row.productId);
            const sku = product?.skus.find((s) => s.id === row.skuId);
            return (
              <div key={row.key} className="rounded-[var(--r-md)] border border-[var(--bd)] p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_84px_40px]">
                  <select
                    value={row.productId}
                    aria-label="상품"
                    onChange={(e) => updateRow(row.key, { productId: e.target.value, skuId: "", unitId: "" })}
                    className={CONTROL}
                  >
                    <option value="">상품 선택</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                    ))}
                  </select>
                  <select
                    value={row.skuId}
                    aria-label="SKU"
                    disabled={!product}
                    onChange={(e) => { updateRow(row.key, { skuId: e.target.value, unitId: "", availability: undefined }); }}
                    className={CONTROL}
                  >
                    <option value="">SKU 선택</option>
                    {product?.skus.map((s) => (
                      <option key={s.id} value={s.id}>{s.color}/{s.size}</option>
                    ))}
                  </select>
                  <select
                    value={row.unitId}
                    aria-label="개체"
                    disabled={!sku}
                    onChange={(e) => updateRow(row.key, { unitId: e.target.value })}
                    className={CONTROL}
                  >
                    <option value="">개체 미지정(수량만)</option>
                    {sku?.units.map((u) => (
                      <option key={u.id} value={u.id} disabled={UNIT_BLOCKED.includes(u.status)}>
                        {u.unitCode} ({UNIT_STATUS_LABEL[u.status]}{UNIT_BLOCKED.includes(u.status) ? " · 대여불가" : ""})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={row.qty}
                    disabled={!!row.unitId}
                    onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                    placeholder="수량"
                    aria-label="수량"
                    className={CONTROL}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    className="flex h-[40px] items-center justify-center rounded-[var(--r-md)] border border-[var(--bd2)] text-et hover:bg-eb [@media(pointer:coarse)]:h-[44px]"
                    aria-label="항목 삭제"
                    disabled={rows.length <= 1}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <input
                    value={row.fee}
                    onChange={(e) => updateRow(row.key, { fee: e.target.value })}
                    placeholder={`대여료(기본 ${product ? formatKRW(product.baseFee) : "-"})`}
                    aria-label="대여료"
                    inputMode="numeric"
                    className={CONTROL}
                  />
                  <input
                    value={row.discount}
                    onChange={(e) => updateRow(row.key, { discount: e.target.value })}
                    placeholder="할인(원)"
                    aria-label="할인"
                    inputMode="numeric"
                    className={CONTROL}
                  />
                  {row.skuId && !row.unitId && (
                    <Button type="button" size="sm" variant="secondary" onClick={() => checkRowAvailability(row)} className="h-[40px] [@media(pointer:coarse)]:h-[44px]">
                      가용성 참고 조회
                    </Button>
                  )}
                  {row.availability && <span className="flex items-center text-[12px] text-t2">{row.availability}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHead title="메모" />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메모(선택)"
          aria-label="메모"
          className="w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 py-2.5 text-[16px] text-t outline-none focus:border-[var(--accent)] sm:text-[13.5px]"
          rows={3}
        />
      </Card>
      </div>

      {/* 오른쪽: 가용성·금액·보증금 요약 */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card className="p-4 sm:p-5">
          <CardHead title="견적(참고용)" description="최종 금액은 확정 시 서버가 계산합니다." />
          <dl className="mt-3 flex flex-col gap-2 text-[13px]">
            <div className="flex items-center justify-between"><dt className="text-t2">대여료 합계</dt><dd className="tabular-nums text-t">{formatKRW(quote.rentalFee)}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-t2">할인 합계</dt><dd className="tabular-nums text-t">{formatKRW(quote.discount)}</dd></div>
            <div className="flex items-center justify-between border-t border-[var(--bd)] pt-2"><dt className="font-semibold text-t">청구 예정</dt><dd className="font-semibold tabular-nums text-t">{formatKRW(quote.rentalFee - quote.discount)}</dd></div>
            <div className="flex items-center justify-between rounded-[var(--r-md)] bg-sf2 px-2.5 py-2"><dt className="text-t2">보증금 예상 합계</dt><dd className="tabular-nums text-t">{formatKRW(depositTotal)}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-t3">보증금은 대여매출과 별도로 관리되며 위 청구 예정 합계에 포함되지 않습니다.</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHead title="기간 가용성" />
          {rows.some((r) => r.availability) ? (
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {rows.filter((r) => r.availability).map((r) => {
                const product = productById.get(r.productId);
                const sku = product?.skus.find((s) => s.id === r.skuId);
                return (
                  <li key={r.key} className="rounded-[var(--r-sm)] bg-sf2 px-2 py-1.5 text-t2">
                    <span className="font-medium text-t">{product?.name}{sku ? ` · ${sku.color}/${sku.size}` : ""}</span> — {r.availability}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] text-t3">항목에서 개체를 직접 지정하지 않은 경우 &ldquo;가용성 참고 조회&rdquo; 버튼으로 확인할 수 있습니다. 최종 판정은 항상 확정 시 서버가 다시 합니다.</p>
          )}
        </Card>

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-[var(--bd)] bg-bg px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:static lg:mx-0 lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 [&>button]:flex-1 lg:[&>button]:flex-none">
          <Button variant="secondary" onClick={() => router.back()} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>{busy ? "저장 중…" : "임시저장(draft)"}</Button>
        </div>
      </div>
      </div>
    </div>
  );
}
