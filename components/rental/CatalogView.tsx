"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Plus, CircleAlert, Lock, QrCode, History, Wrench, ChevronDown } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils/cn";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import {
  UNIT_STATUS_LABEL,
  UNIT_BLOCKED,
  type ProductWithChildren,
  type RentalProduct,
  type RentalSku,
  type RentalUnit,
  type UnitStatus,
} from "@/lib/domain/rental-types";
import { createProduct, createSku, createUnit, createProductPart, setUnitStatus, updateUnitAction, checkAvailabilityAction, inspectReturnedUnit } from "@/lib/domain/rental-actions";
import { StatusTab, Pager, usePager, Thumb, FilterRow, SearchBox, TextAction, CONTROL_SM, TABLE, THEAD, TH, TR_CLICK, TD } from "./listkit";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";

const STATUS_CLASS: Record<UnitStatus, string> = {
  available: "bg-okb text-okt",
  reserved: "bg-ib text-it",
  out: "bg-ib text-it",
  returning: "bg-wb text-wt",
  inspect: "bg-wb text-wt",
  care: "bg-wb text-wt",
  repair: "bg-wb text-wt",
  lost: "bg-eb text-et",
  retired: "bg-sf3 text-t3",
};
const STATUS_BADGE: Record<UnitStatus, BadgeKind> = {
  available: "success",
  reserved: "info",
  out: "info",
  returning: "warning",
  inspect: "warning",
  care: "warning",
  repair: "warning",
  lost: "error",
  retired: "error",
};

type StatusGroup = "all" | "available" | "busy" | "care" | "out_of_service";
const GROUP_STATUSES: Record<Exclude<StatusGroup, "all">, UnitStatus[]> = {
  available: ["available"],
  busy: ["reserved", "out", "returning"],
  care: ["inspect", "care", "repair"],
  out_of_service: ["lost", "retired"],
};
const GROUP_LABEL: Record<Exclude<StatusGroup, "all">, string> = {
  available: "대여가능",
  busy: "대여중",
  care: "세탁·수선·검수",
  out_of_service: "분실·폐기",
};

interface FlatUnit {
  unit: RentalUnit;
  sku: RentalSku;
  product: RentalProduct;
}

const PAGE_SIZE = 20;

export function CatalogView({
  businessId,
  products,
  unitCosts,
  unitRentalCounts,
  canReadCost,
  canWrite,
}: {
  businessId: string;
  products: ProductWithChildren[];
  unitCosts: Record<string, number | null>;
  unitRentalCounts: Record<string, number>;
  canReadCost: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [newProductOpen, setNewProductOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [group, setGroup] = React.useState<StatusGroup>("all");
  const [manageOpen, setManageOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<FlatUnit | null>(null);
  const refresh = () => router.refresh();

  const flat: FlatUnit[] = React.useMemo(() => {
    const out: FlatUnit[] = [];
    for (const p of products) {
      for (const s of p.skus) {
        for (const u of s.units) out.push({ unit: u, sku: s, product: p });
      }
    }
    return out;
  }, [products]);

  const counts = React.useMemo(() => {
    const m = new Map<StatusGroup, number>();
    m.set("all", flat.length);
    for (const g of Object.keys(GROUP_STATUSES) as (keyof typeof GROUP_STATUSES)[]) {
      m.set(g, flat.filter((f) => GROUP_STATUSES[g].includes(f.unit.status)).length);
    }
    return m;
  }, [flat]);

  const needle = q.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    let rows = flat;
    if (group !== "all") rows = rows.filter((f) => GROUP_STATUSES[group].includes(f.unit.status));
    if (needle) {
      rows = rows.filter((f) =>
        [f.product.name, f.product.code, f.sku.color, f.sku.size, f.unit.unitCode, f.unit.location ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    return rows;
  }, [flat, group, needle]);

  const { page, setPage, totalPages, pageRows } = usePager(filtered, PAGE_SIZE);
  React.useEffect(() => setPage(1), [group, needle, setPage]);

  const filtersActive = !!needle || group !== "all";

  // 표와 카드가 같은 값·같은 동작을 쓰도록 한 곳에서 계산한다.
  const rowView = ({ unit: u, sku: s, product: p }: FlatUnit) => {
    const cost = unitCosts[u.id];
    return {
      sku: `${s.color} / ${s.size}`,
      badge: <Badge kind={STATUS_BADGE[u.status]}>{UNIT_STATUS_LABEL[u.status]}</Badge>,
      location: u.location ?? "-",
      rentals: `${unitRentalCounts[u.id] ?? 0}회`,
      cost: cost == null ? <span className="text-t3">미입력</span> : formatKRW(cost),
      historyLink: (
        <Link href={`/w/${businessId}/reservations?productId=${p.id}`} className="inline-flex h-[32px] items-center rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]">
          예약 이력
        </Link>
      ),
    };
  };

  return (
    <>
      <PageHeader
        title="상품·개체"
        description="상품(스타일) → SKU(색상×사이즈) → 개체(실물 1점) 순서로 관리합니다. 개체를 누르면 편집·QR·가용성을 확인합니다."
        meta={<span className="rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">개체 {flat.length}</span>}
        actions={
          <Button
            onClick={() => setNewProductOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : "상품 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요."}
          >
            <Plus size={15} aria-hidden />
            상품 등록
          </Button>
        }
      >
        {flat.length > 0 && (
          <FilterRow>
            <StatusTab active={group === "all"} onClick={() => setGroup("all")} count={counts.get("all")}>전체</StatusTab>
            {(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => (
              <StatusTab key={g} active={group === g} onClick={() => setGroup(g)} count={counts.get(g)}>
                {GROUP_LABEL[g]}
              </StatusTab>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-[var(--bd)] sm:block" aria-hidden />
            <SearchBox value={q} onChange={setQ} placeholder="상품명/코드/색상/사이즈/개체코드/위치 검색" className="min-w-[200px] sm:w-[320px]" />
            {filtersActive && <TextAction onClick={() => { setQ(""); setGroup("all"); }}>필터 초기화</TextAction>}
          </FilterRow>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4">
      {flat.length === 0 ? (
        <Card>
          <EmptyState
            title="등록된 상품·개체가 없습니다."
            description="상품 등록 버튼으로 첫 상품과 SKU·개체를 추가하세요."
            action={canWrite && <Button size="sm" onClick={() => setNewProductOpen(true)}><Plus size={14} aria-hidden />상품 등록</Button>}
          />
        </Card>
      ) : (
        <>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                title="검색 결과가 없습니다."
                description="검색어나 상태 필터를 조정해 보세요."
                action={<TextAction onClick={() => { setQ(""); setGroup("all"); }}>필터 초기화</TextAction>}
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              <TableOrCards
                rows={pageRows}
                keyOf={(f) => f.unit.id}
                table={
                  <Card className="relative overflow-x-auto">
                    <table className={`${TABLE} min-w-[980px]`}>
                      <thead>
                        <tr className={THEAD}>
                          <th className="w-14 px-3 py-2.5"><span className="sr-only">사진</span></th>
                          <th className={TH}>상품/SKU</th>
                          <th className={TH}>개체코드</th>
                          <th className={TH}>상태</th>
                          <th className={TH}>위치</th>
                          <th className={`${TH} text-right`}>대여횟수</th>
                          {canReadCost && <th className={`${TH} text-right`}>취득비용</th>}
                          <th className={TH}>동작</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((f) => {
                          const { unit: u, product: p } = f;
                          const v = rowView(f);
                          return (
                            <tr key={u.id} className={`${TR_CLICK} h-[60px]`} onClick={() => setSelected(f)}>
                              <td className="px-3 py-2"><Thumb src={u.photoUrl} code={u.unitCode} size={40} /></td>
                              <td className={TD}>
                                <CellName max={240}>{p.name}</CellName>
                                <div className="text-[11.5px] text-t3"><span className="font-mono">{p.code}</span> · {v.sku}</div>
                              </td>
                              <td className={`${TD} font-mono text-t`}>{u.unitCode}</td>
                              <td className={TD}>{v.badge}</td>
                              <td className={`${TD} text-t2`}>{v.location}</td>
                              <td className={`${TD} text-right tabular-nums text-t2`}>{v.rentals}</td>
                              {canReadCost && <td className={`${TD} text-right tabular-nums text-t2`}>{v.cost}</td>}
                              <td className={TD} onClick={(e) => e.stopPropagation()}>{v.historyLink}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                }
                card={(f) => {
                  const { unit: u, product: p } = f;
                  const v = rowView(f);
                  return (
                    <MobileCard
                      title={p.name}
                      sub={<><span className="font-mono">{p.code}</span><span>· {v.sku}</span><span>· 개체 <span className="font-mono text-t2">{u.unitCode}</span></span></>}
                      badge={v.badge}
                      onClick={() => setSelected(f)}
                      fields={[
                        ["위치", v.location],
                        ["대여횟수", v.rentals],
                        ...(canReadCost ? ([["취득비용", v.cost]] as [string, React.ReactNode][]) : []),
                      ]}
                      actions={v.historyLink}
                    />
                  );
                }}
              />
              <Pager page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
            </div>
          )}
        </>
      )}

      <details className="group rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf shadow-card" open={manageOpen} onToggle={(e) => setManageOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[var(--fs-card)] font-semibold text-t hover:bg-sf2 [&::-webkit-details-marker]:hidden">
          <span>
            상품·SKU·구성품 관리
            <span className="ml-2 rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">상품 {products.length}종</span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-t3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-4 border-t border-[var(--bd)] p-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              businessId={businessId}
              product={p}
              unitCosts={unitCosts}
              unitRentalCounts={unitRentalCounts}
              canReadCost={canReadCost}
              canWrite={canWrite}
              onChanged={refresh}
            />
          ))}
        </div>
      </details>
      </div>

      <NewProductModal businessId={businessId} open={newProductOpen} onClose={() => setNewProductOpen(false)} onCreated={() => { setNewProductOpen(false); refresh(); }} />

      {selected && (
        <UnitDetailModal
          businessId={businessId}
          flat={selected}
          canWrite={canWrite}
          canReadCost={canReadCost}
          cost={unitCosts[selected.unit.id]}
          rentalCount={unitRentalCounts[selected.unit.id] ?? 0}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); refresh(); }}
        />
      )}
    </>
  );
}

function UnitDetailModal({
  businessId,
  flat,
  canWrite,
  canReadCost,
  cost,
  rentalCount,
  onClose,
  onChanged,
}: {
  businessId: string;
  flat: FlatUnit;
  canWrite: boolean;
  canReadCost: boolean;
  cost: number | null | undefined;
  rentalCount: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { unit: u, sku: s, product: p } = flat;
  const [tab, setTab] = React.useState<"info" | "qr" | "availability">("info");
  const [location, setLocation] = React.useState(u.location ?? "");
  const [notes, setNotes] = React.useState(u.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [avFrom, setAvFrom] = React.useState("");
  const [avTo, setAvTo] = React.useState("");
  const [avResult, setAvResult] = React.useState<string | null>(null);
  const [avBusy, setAvBusy] = React.useState(false);

  const saveEdit = async () => {
    setBusy(true); setError(null);
    const r = await updateUnitAction(businessId, u.id, { location: location.trim(), notes: notes.trim() });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onChanged();
  };

  // CLICK-PATH-237: 반납 접수(returning) 개체를 검수해 대여가능으로 되돌리는 유일한 UI 경로.
  const finishInspection = async () => {
    setBusy(true); setError(null);
    const r = await inspectReturnedUnit(businessId, u.id);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onChanged();
  };

  const checkAvailability = async () => {
    if (!avFrom || !avTo) { setAvResult("기간을 모두 입력하세요."); return; }
    setAvBusy(true); setAvResult(null);
    const r = await checkAvailabilityAction(businessId, s.id, new Date(avFrom).toISOString(), new Date(avTo).toISOString());
    setAvBusy(false);
    if (!r.ok) { setAvResult(r.message); return; }
    setAvResult(`같은 SKU(${s.color}/${s.size}) 기준 해당 기간 가용 ${r.data.remaining}개`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${p.name} · ${s.color}/${s.size} · ${u.unitCode}`}
      footer={
        tab === "info" && canWrite ? (
          <>
            <Button variant="secondary" onClick={onClose}>닫기</Button>
            <Button onClick={saveEdit} loading={busy}>저장</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>닫기</Button>
        )
      }
    >
      <div className="mb-3 flex gap-1.5" role="tablist">
        {([
          ["info", "개체 편집"],
          ["qr", "QR 라벨"],
          ["availability", "기간 가용성"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={cn("inline-flex h-[32px] items-center rounded-[var(--r-sm)] border px-3 text-[12.5px] font-medium [@media(pointer:coarse)]:h-[44px]", tab === v ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] text-t2 hover:bg-sf2")}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-[var(--r-md)] bg-eb px-3 py-2 text-[12.5px] text-et">
          <CircleAlert size={15} className="mt-[1px] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === "info" && (
        <div className="flex flex-col gap-1">
          <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-t2">
            <span>상태 <strong className="text-t">{UNIT_STATUS_LABEL[u.status]}</strong></span>
            <span>대여횟수 <strong className="text-t">{rentalCount}회</strong></span>
            {canReadCost && <span>취득비용 <strong className="text-t">{cost == null ? "미입력" : formatKRW(cost)}</strong></span>}
          </div>
          <Input label="보관 위치" value={location} onChange={(e) => setLocation(e.target.value)} disabled={!canWrite} placeholder="A랙-3" />
          <Input label="메모" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canWrite} />
          {u.status === "returning" && canWrite && (
            <div className="mt-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-2.5">
              <p className="mb-1.5 text-[12px] text-t2">반납 접수 후 검수 대기 중입니다. 이상이 없으면 대여가능으로 되돌리세요.</p>
              <Button size="sm" variant="secondary" onClick={finishInspection} loading={busy}>검수 완료(대여가능으로)</Button>
            </div>
          )}
          <p className="mt-2 text-[11.5px] text-t3">상태 변경은 상품·SKU 관리 섹션에서, 세탁·수선 등록은 아래 링크에서 처리합니다.</p>
          <Link href={`/w/${businessId}/care?unit=${u.id}`} className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-[var(--accent-ink)] underline underline-offset-2">
            <Wrench size={13} /> 세탁·수선 등록
          </Link>
          <Link href={`/w/${businessId}/reservations?productId=${p.id}`} className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-[var(--accent-ink)] underline underline-offset-2">
            <History size={13} /> 이 상품의 예약 이력
          </Link>
        </div>
      )}

      {tab === "qr" && (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="rounded-[var(--r-lg)] border border-[var(--bd)] bg-white p-3">
            <QRCodeSVG value={u.qrPayload ?? u.id} size={140} level="M" includeMargin={false} />
          </div>
          <p className="text-center text-[12px] text-t2">
            <QrCode size={13} className="mr-1 inline" />
            {u.unitCode} · {p.code}
          </p>
          <p className="max-w-[320px] text-center text-[11.5px] text-t3">인쇄하면 흰 여백과 검은 코드가 유지됩니다. 스캔 화면에서 이 코드로 개체를 조회할 수 있습니다.</p>
        </div>
      )}

      {tab === "availability" && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-t2">개체 단위가 아니라 같은 SKU({s.color}/{s.size}) 기준 가용 수량을 확인합니다(최종 판정은 예약 확정 시 서버가 다시 합니다).</p>
          <div className="flex gap-2">
            <Input label="시작" type="date" value={avFrom} onChange={(e) => setAvFrom(e.target.value)} />
            <Input label="종료" type="date" value={avTo} onChange={(e) => setAvTo(e.target.value)} />
          </div>
          <Button size="sm" variant="secondary" onClick={checkAvailability} loading={avBusy} className="self-start">확인</Button>
          {avResult && <p className="text-[12.5px] font-medium text-t">{avResult}</p>}
        </div>
      )}
    </Modal>
  );
}

function ProductCard({
  businessId,
  product,
  unitCosts,
  unitRentalCounts,
  canReadCost,
  canWrite,
  onChanged,
}: {
  businessId: string;
  product: ProductWithChildren;
  unitCosts: Record<string, number | null>;
  unitRentalCounts: Record<string, number>;
  canReadCost: boolean;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [skuModal, setSkuModal] = React.useState(false);
  const [partModal, setPartModal] = React.useState(false);
  const [unitModalSku, setUnitModalSku] = React.useState<string | null>(null);

  // 표와 카드가 같은 값·같은 권한 조건·같은 상태 변경 메뉴를 쓰도록 한 곳에서 계산한다.
  const unitView = (u: RentalUnit) => {
    const cost = unitCosts[u.id];
    const blocked = UNIT_BLOCKED.includes(u.status);
    return {
      status: (
        <>
          <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-bold", STATUS_CLASS[u.status])}>{UNIT_STATUS_LABEL[u.status]}</span>
          {blocked && <span className="ml-1.5 text-[10.5px] text-t3">대여 불가</span>}
        </>
      ),
      location: u.location ?? "-",
      rentals: `${unitRentalCounts[u.id] ?? 0}회`,
      cost: !canReadCost ? (
        <span className="inline-flex items-center gap-1 text-t3"><Lock size={11} /> 비공개</span>
      ) : cost == null ? (
        <span className="text-t3">비용 미입력</span>
      ) : (
        formatKRW(cost)
      ),
      measurements: Object.keys(u.measurements).length ? Object.entries(u.measurements).map(([k, v]) => `${k}:${v}`).join(", ") : "-",
      action: <UnitStatusMenu businessId={businessId} unitId={u.id} status={u.status} onChanged={onChanged} />,
    };
  };

  return (
    <section className="rounded-[var(--r-md)] border border-[var(--bd)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11.5px] text-t3">{product.code}</span>
            <h3 className="text-[14px] font-semibold text-t">{product.name}</h3>
            <span className="rounded-[6px] bg-sf2 px-1.5 py-0.5 text-[10.5px] text-t2">{product.category}</span>
            {!product.active && <span className="rounded-[6px] bg-sf3 px-1.5 py-0.5 text-[10.5px] text-t3">비활성</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-t2">
            <span>기본 대여료 {formatKRW(product.baseFee)}</span>
            <span>기본 보증금 {formatKRW(product.depositAmount)}</span>
            <span>정비 버퍼 {product.careBufferHours}시간</span>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setPartModal(true)}>
              구성품 추가
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSkuModal(true)}>
              SKU 추가
            </Button>
          </div>
        )}
      </div>

      {product.parts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[...product.parts].sort((a, b) => a.sort - b.sort).map((part) => (
            <span
              key={part.id}
              className={cn(
                "rounded-[6px] px-2 py-0.5 text-[11px]",
                part.required ? "bg-sf2 text-t2" : "border border-dashed border-[var(--bd2)] text-t3"
              )}
            >
              {part.partName}
              {!part.required && " (선택)"}
            </span>
          ))}
        </div>
      )}

      {product.skus.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-t3">등록된 SKU가 없습니다.</p>
      ) : (
        <TableOrCards
          rows={product.skus.flatMap<{ sku: RentalSku; unit: RentalUnit | null }>((sku) => (sku.units.length === 0 ? [{ sku, unit: null }] : sku.units.map((unit) => ({ sku, unit }))))}
          keyOf={({ sku, unit }) => unit?.id ?? sku.id}
          table={
            <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--bd)]">
              <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
                <thead>
                  <tr className={THEAD}>
                    <th className="px-2.5 py-2 font-medium">색상/사이즈</th>
                    <th className="px-2.5 py-2 font-medium">개체코드</th>
                    <th className="px-2.5 py-2 font-medium">상태</th>
                    <th className="px-2.5 py-2 font-medium">위치</th>
                    <th className="px-2.5 py-2 font-medium">대여횟수</th>
                    <th className="px-2.5 py-2 font-medium">취득비용</th>
                    <th className="px-2.5 py-2 font-medium">실측</th>
                    {canWrite && <th className="px-2.5 py-2 font-medium">동작</th>}
                  </tr>
                </thead>
                <tbody>
                  {product.skus.map((sku) =>
                    sku.units.length === 0 ? (
                      <tr key={sku.id} className="border-b border-[var(--bd)] last:border-b-0">
                        <td className="px-2.5 py-2 font-medium text-t">{sku.color} / {sku.size}</td>
                        <td colSpan={canWrite ? 6 : 5} className="px-2.5 py-2 text-t3">
                          등록된 개체가 없습니다.
                          {canWrite && (
                            <Button size="sm" variant="ghost" className="ml-1 text-[var(--accent-ink)]" onClick={() => setUnitModalSku(sku.id)}>
                              개체 추가
                            </Button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      sku.units.map((u, i) => {
                        const v = unitView(u);
                        return (
                          <tr key={u.id} className="border-b border-[var(--bd)] last:border-b-0">
                            {i === 0 && (
                              <td rowSpan={sku.units.length} className="border-r border-[var(--bd)] px-2.5 py-2 align-top font-medium text-t">
                                {sku.color} / {sku.size}
                              </td>
                            )}
                            <td className="px-2.5 py-2 font-mono text-t">{u.unitCode}</td>
                            <td className="px-2.5 py-2">{v.status}</td>
                            <td className="px-2.5 py-2 text-t2">{v.location}</td>
                            <td className="px-2.5 py-2 text-t2">{v.rentals}</td>
                            <td className="px-2.5 py-2 text-t2">{v.cost}</td>
                            <td className="px-2.5 py-2 text-t3">{v.measurements}</td>
                            {canWrite && <td className="px-2.5 py-2">{v.action}</td>}
                          </tr>
                        );
                      })
                    )
                  )}
                </tbody>
              </table>
            </div>
          }
          card={({ sku, unit: u }) =>
            u === null ? (
              <MobileCard
                title={`${sku.color} / ${sku.size}`}
                sub={<span>등록된 개체가 없습니다.</span>}
                actions={canWrite ? <Button size="sm" variant="secondary" onClick={() => setUnitModalSku(sku.id)}>개체 추가</Button> : undefined}
              />
            ) : (
              <UnitCard sku={sku} unit={u} view={unitView(u)} canWrite={canWrite} />
            )
          }
        />
      )}
      {canWrite && product.skus.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {product.skus.map((s) => (
            <Button key={s.id} size="sm" variant="secondary" onClick={() => setUnitModalSku(s.id)}>
              <Plus size={13} aria-hidden />{s.color}/{s.size}에 개체 추가
            </Button>
          ))}
        </div>
      )}

      <NewSkuModal businessId={businessId} productId={product.id} open={skuModal} onClose={() => setSkuModal(false)} onCreated={() => { setSkuModal(false); onChanged(); }} />
      <NewPartModal businessId={businessId} productId={product.id} nextSort={product.parts.length + 1} open={partModal} onClose={() => setPartModal(false)} onCreated={() => { setPartModal(false); onChanged(); }} />
      <NewUnitModal businessId={businessId} skuId={unitModalSku} open={!!unitModalSku} onClose={() => setUnitModalSku(null)} onCreated={() => { setUnitModalSku(null); onChanged(); }} />
    </section>
  );
}

function UnitCard({ sku, unit: u, view: v, canWrite }: { sku: RentalSku; unit: RentalUnit; view: { status: React.ReactNode; location: string; rentals: string; cost: React.ReactNode; measurements: string; action: React.ReactNode }; canWrite: boolean }) {
  return (
    <MobileCard
      title={`${sku.color} / ${sku.size} · ${u.unitCode}`}
      badge={v.status}
      fields={[
        ["위치", v.location],
        ["대여횟수", v.rentals],
        ["취득비용", v.cost],
        ["실측", v.measurements],
      ]}
      actions={canWrite ? v.action : undefined}
    />
  );
}

function UnitStatusMenu({
  businessId,
  unitId,
  status,
  onChanged,
}: {
  businessId: string;
  unitId: string;
  status: UnitStatus;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // 세탁/수선은 "세탁·수선" 메뉴(정비 작업)로만 전이시킨다. 여기서는 수동 예외 처리만 허용.
  const options: { value: "available" | "inspect" | "lost" | "retired"; label: string }[] = [
    { value: "available", label: "대여가능으로" },
    { value: "inspect", label: "검수 대기로" },
    { value: "lost", label: "분실 처리" },
    { value: "retired", label: "폐기 처리" },
  ];
  if (status === "care" || status === "repair" || status === "out" || status === "reserved") {
    return <span className="text-[11px] text-t3">세탁·수선/예약 화면에서 처리</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <select
        disabled={busy}
        value=""
        onChange={async (e) => {
          const v = e.target.value as (typeof options)[number]["value"];
          if (!v) return;
          e.target.value = "";
          // CLICK-PATH-214: lost/retired는 상태머신상 종단이라 되돌릴 UI가 없다 — 실행 전에 확인한다.
          if ((v === "lost" || v === "retired") && !window.confirm(`이 개체를 '${options.find((o) => o.value === v)?.label}'합니다. 이후 화면에서 되돌릴 수 없습니다. 계속할까요?`)) return;
          setBusy(true);
          setError(null);
          const r = await setUnitStatus(businessId, unitId, v);
          setBusy(false);
          if (!r.ok) setError(r.message);
          else onChanged();
        }}
        aria-label="상태 변경"
        className={`${CONTROL_SM} w-auto`}
      >
        <option value="">상태 변경…</option>
        {options.filter((o) => o.value !== status).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-[10.5px] text-et">{error}</span>}
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 flex items-start gap-2 rounded-[var(--r-md)] bg-eb px-3 py-2 text-[12.5px] text-et">
      <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

function NewProductModal({ businessId, open, onClose, onCreated }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("suit");
  const [baseFee, setBaseFee] = React.useState("100000");
  const [deposit, setDeposit] = React.useState("50000");
  const [buffer, setBuffer] = React.useState("24");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // CLICK-PATH-212: 취소 후 다시 열면 이전 입력이 남지 않게 open 전환 시 전체 초기화.
  React.useEffect(() => {
    if (open) {
      setCode(""); setName(""); setCategory("suit"); setBaseFee("100000"); setDeposit("50000"); setBuffer("24"); setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      setError("코드와 이름은 필수입니다.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await createProduct(businessId, {
      code: code.trim(),
      name: name.trim(),
      category,
      baseFee: parseKRW(baseFee),
      depositAmount: parseKRW(deposit),
      careBufferHours: Number(buffer) || 0,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setCode(""); setName("");
    onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="상품 등록" footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      <ErrorBanner message={error} />
      <Input label="코드" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="R-T04" />
      <Input label="이름" required value={name} onChange={(e) => setName(e.target.value)} placeholder="턱시도 D" />
      <Input label="카테고리" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="suit/dress/hanbok/accessory" />
      <Input label="기본 대여료(원)" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} />
      <Input label="기본 보증금(원)" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
      <Input label="정비 버퍼(시간)" value={buffer} onChange={(e) => setBuffer(e.target.value)} hint="반납 후 세탁·준비로 재출고를 막는 시간" />
    </Modal>
  );
}

function NewSkuModal({ businessId, productId, open, onClose, onCreated }: { businessId: string; productId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [color, setColor] = React.useState("");
  const [size, setSize] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setColor(""); setSize(""); setError(null); } }, [open]);

  const submit = async () => {
    if (!color.trim() || !size.trim()) { setError("색상과 사이즈는 필수입니다."); return; }
    setBusy(true);
    setError(null);
    const r = await createSku(businessId, productId, { color: color.trim(), size: size.trim() });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setColor(""); setSize("");
    onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="SKU 추가" footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      <ErrorBanner message={error} />
      <Input label="색상" required value={color} onChange={(e) => setColor(e.target.value)} placeholder="black" />
      <Input label="사이즈" required value={size} onChange={(e) => setSize(e.target.value)} placeholder="95" />
    </Modal>
  );
}

function NewPartModal({ businessId, productId, nextSort, open, onClose, onCreated }: { businessId: string; productId: string; nextSort: number; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [partName, setPartName] = React.useState("");
  const [required, setRequired] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setPartName(""); setRequired(true); setError(null); } }, [open]);

  const submit = async () => {
    if (!partName.trim()) { setError("구성품 이름을 입력하세요."); return; }
    setBusy(true);
    setError(null);
    const r = await createProductPart(businessId, productId, { partName: partName.trim(), required, sort: nextSort });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setPartName("");
    onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="구성품 추가" footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      <ErrorBanner message={error} />
      <Input label="구성품 이름" required value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="재킷" />
      <label className="flex items-center gap-2 text-[13px] text-t2">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        필수 구성품(누락 시 부분출고/부분반납 판정에 사용)
      </label>
    </Modal>
  );
}

function NewUnitModal({ businessId, skuId, open, onClose, onCreated }: { businessId: string; skuId: string | null; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [unitCode, setUnitCode] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setUnitCode(""); setLocation(""); setCost(""); setError(null); } }, [open]);

  const submit = async () => {
    if (!skuId) return;
    if (!unitCode.trim()) { setError("개체코드를 입력하세요."); return; }
    setBusy(true);
    setError(null);
    const r = await createUnit(businessId, skuId, {
      unitCode: unitCode.trim(),
      location: location.trim() || undefined,
      purchaseCost: cost.trim() ? parseKRW(cost) : undefined,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setUnitCode(""); setLocation(""); setCost("");
    onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="개체 추가" footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      <ErrorBanner message={error} />
      <Input label="개체코드" required value={unitCode} onChange={(e) => setUnitCode(e.target.value)} placeholder="U1" />
      <Input label="보관 위치" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A랙-3" />
      <Input label="취득비용(원, 선택)" value={cost} onChange={(e) => setCost(e.target.value)} hint="입력하지 않으면 수익성 화면에 '비용 미입력'으로 표시됩니다" />
    </Modal>
  );
}
