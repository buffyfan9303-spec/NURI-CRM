"use client";

/**
 * 자재/교재·교구 — 공장·학원 공용 컴포넌트(crm.materials/material_moves, 0007).
 * labelKind으로 라벨만 바꾼다("자재" vs "교재·교구"). 데이터·동작은 동일하다.
 * 4열 표(코드 / 이름 / 재고 / 단가) — 등록·입출고는 모달.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, PackagePlus, Package } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CellName } from "@/components/ui/ResponsiveTable";
import { SelectField, SearchBox, StatusTab, FilterRow, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { Material } from "@/lib/domain/materials";
import { createMaterial, recordMaterialMove } from "@/lib/domain/materials-actions";

/** 공장만 원단/안감/단추 종류를 고른다(0007 CHECK: fabric|lining|button|기타) — 학원은 항상 "기타". */
const FACTORY_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "fabric", label: "원단" },
  { value: "lining", label: "안감" },
  { value: "button", label: "단추" },
  { value: "기타", label: "기타" },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(FACTORY_KIND_OPTIONS.map((k) => [k.value, k.label]));

export function MaterialsBoard({ businessId, canWrite, canAdjust, canReadCost, materials, labelKind, industry }: {
  businessId: string; canWrite: boolean; canAdjust: boolean; canReadCost: boolean; materials: Material[]; labelKind: string;
  /** "factory"일 때만 종류 선택지를 보여준다. 학원 등 다른 호출자는 생략하면 기존처럼 "기타"로 저장된다. */
  industry?: "factory" | "academy";
}) {
  const router = useRouter();
  const [newOpen, setNewOpen] = React.useState(false);
  const [moveFor, setMoveFor] = React.useState<Material | null>(null);
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"all" | "low">("all");

  const lowCount = materials.filter((m) => m.stock <= m.minStock).length;
  const needle = q.trim().toLowerCase();
  const rows = materials.filter((m) => (tab === "all" || m.stock <= m.minStock) && (!needle || m.name.toLowerCase().includes(needle) || m.code.toLowerCase().includes(needle)));

  return (
    <>
      <PageHeader
        title={`${labelKind} 재고`}
        description={industry === "factory" ? "원단·안감·단추 등 자재의 현재고. 최소재고 이하는 배지로 표시됩니다." : "교재·교구의 현재고. 최소재고 이하는 배지로 표시됩니다."}
        meta={lowCount > 0 ? <Badge kind="warning">부족 {lowCount}</Badge> : undefined}
        actions={
          <>
            {(canWrite || canAdjust) && materials.length > 0 && (
              <Button variant="secondary" onClick={() => setMoveFor(materials[0])}><PackagePlus size={14} aria-hidden />입출고 · 조정</Button>
            )}
            {canWrite && <Button onClick={() => setNewOpen(true)}><Plus size={15} aria-hidden />{labelKind} 등록</Button>}
          </>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <FilterRow>
            <StatusTab active={tab === "all"} onClick={() => setTab("all")} count={materials.length}>전체</StatusTab>
            <StatusTab active={tab === "low"} onClick={() => setTab("low")} count={lowCount}>부족</StatusTab>
          </FilterRow>
          <SearchBox value={q} onChange={setQ} placeholder="이름·코드 검색" />
        </div>
      </PageHeader>

      <Card className="p-4 sm:p-5">
        <CardHead title={tab === "low" ? "최소재고 이하" : `${labelKind} 목록`} description={`${rows.length}개`} />
        {materials.length === 0 ? (
          <EmptyState title={`등록된 ${labelKind}가 없습니다.`} description="등록한 뒤 입고를 기록하면 현재고가 계산됩니다." action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setNewOpen(true)}>{labelKind} 등록</Button> : undefined} />
        ) : rows.length === 0 ? (
          <EmptyState title={tab === "low" ? "부족한 항목이 없습니다." : "검색 결과가 없습니다."} />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className={`${TABLE} min-w-[560px]`}>
              <thead>
                <tr className={THEAD}>
                  <th className={TH}>코드</th>
                  <th className={TH}>이름</th>
                  <th className={`${TH} text-right`}>재고</th>
                  {canReadCost && <th className={`${TH} text-right`}>단가</th>}
                  {(canWrite || canAdjust) && <th className={`${TH} text-right`}>동작</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const low = m.stock <= m.minStock;
                  return (
                    <tr key={m.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                      <td className={`${TD} whitespace-nowrap font-mono text-[12px] text-t2`}>{m.code}</td>
                      <td className={TD}>
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-sf2 text-t3" aria-hidden><Package size={15} /></span>
                          <span className="min-w-0">
                            <CellName max={240}>{m.name}</CellName>
                            {industry === "factory" && m.kind && <span className="block text-[11.5px] text-t3">{KIND_LABEL[m.kind] ?? m.kind}</span>}
                          </span>
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right`}>
                        {low ? <Badge kind="warning">{m.stock}{m.unit} · 부족</Badge> : <span className="tabular-nums text-t">{m.stock}<span className="ml-0.5 text-[11.5px] text-t3">{m.unit}</span></span>}
                        <span className="block text-[11px] text-t3">최소 {m.minStock}{m.unit}</span>
                      </td>
                      {canReadCost && <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t2`}>{m.unitCost != null ? `${m.unitCost.toLocaleString("ko-KR")}원` : "—"}</td>}
                      {(canWrite || canAdjust) && (
                        <td className={`${TD} text-right`}>
                          <Button variant="ghost" size="sm" onClick={() => setMoveFor(m)}><PackagePlus size={13} aria-hidden />입출고</Button>
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

      <NewMaterialModal businessId={businessId} open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); router.refresh(); }} labelKind={labelKind} industry={industry} />
      <MoveModal businessId={businessId} material={moveFor} materials={materials} canAdjust={canAdjust} labelKind={labelKind} onClose={() => setMoveFor(null)} onDone={() => { setMoveFor(null); router.refresh(); }} />
    </>
  );
}

function NewMaterialModal({ businessId, open, onClose, onCreated, labelKind, industry }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void; labelKind: string; industry?: "factory" | "academy" }) {
  const EMPTY = { kind: "기타", code: "", name: "", unit: "ea", minStock: "0" };
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setForm(EMPTY); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError("코드와 이름을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await createMaterial(businessId, { kind: form.kind, code: form.code.trim(), name: form.name.trim(), unit: form.unit || "ea", minStock: Number(form.minStock) || 0 });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${labelKind} 등록`} footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        {industry === "factory" && (
          <SelectField label="종류" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
            {FACTORY_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </SelectField>
        )}
        <div className="grid grid-cols-[1fr_2fr] gap-x-3">
          <Input label="코드" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} autoFocus placeholder="예: BK-01" />
          <Input label={`${labelKind}명`} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-x-3">
          <Input label="단위" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="ea" wrapperClassName="mb-0" />
          <Input label="최소재고" type="number" min={0} value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} wrapperClassName="mb-0" />
        </div>
      </form>
    </Modal>
  );
}

function MoveModal({ businessId, material, materials, canAdjust, labelKind, onClose, onDone }: { businessId: string; material: Material | null; materials: Material[]; canAdjust: boolean; labelKind: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = React.useState<{ materialId: string; kind: "in" | "out" | "adjust"; qty: string; reason: string }>({ materialId: "", kind: "in", qty: "1", reason: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (material) { setForm({ materialId: material.id, kind: "in", qty: "1", reason: "" }); setError(null); } }, [material]);
  const target = materials.find((m) => m.id === form.materialId);

  const submit = async () => {
    if (!form.materialId) { setError(`${labelKind}를 선택하세요.`); return; }
    if (form.kind === "adjust" && !form.reason.trim()) { setError("조정 사유를 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await recordMaterialMove(businessId, { materialId: form.materialId, kind: form.kind, qty: Number(form.qty) || 0, reason: form.reason });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onDone();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!material} onClose={onClose} title="입출고 · 조정" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>저장</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <SelectField label={labelKind} required value={form.materialId} onChange={(e) => setForm((f) => ({ ...f, materialId: e.target.value }))} hint={target ? `현재고 ${target.stock}${target.unit} · 최소 ${target.minStock}${target.unit}` : undefined}>
          <option value="">선택</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.stock}{m.unit})</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-x-3">
          <SelectField label="구분" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as typeof f.kind }))}>
            <option value="in">입고</option>
            <option value="out">출고</option>
            {canAdjust && <option value="adjust">조정(실사)</option>}
          </SelectField>
          <Input label={form.kind === "adjust" ? "실제 수량" : "수량"} type="number" min={0} value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
        </div>
        {form.kind === "adjust" && <Input label="조정 사유" required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="예: 분기 실사 차이" wrapperClassName="mb-0" />}
      </form>
    </Modal>
  );
}
