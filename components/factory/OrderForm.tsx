"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { defaultFactoryOptions, defaultFactoryQty, type OptionValue } from "@/lib/domain/factory-options";
import { createFactoryOrder, consumeMaterial } from "@/lib/domain/factory-actions";
import { EMPTY_MATERIAL_SELECTION, writeMaterialSelection, type MaterialSelection } from "@/lib/domain/factory-materials";
import type { CustomerRow } from "@/lib/domain/rental-types";
import type { MaterialOption, FactoryOrderType } from "@/lib/domain/factory";
import { GarmentWorkspace } from "@/components/garment/GarmentWorkspace";

const TYPE_OPTIONS: { value: FactoryOrderType; label: string }[] = [
  { value: "suit", label: "정장" },
  { value: "shirt", label: "셔츠" },
  { value: "shoe", label: "구두" },
];

const selectClass =
  "h-11 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]";

export function OrderForm({
  businessId,
  customers,
  fabrics,
  linings,
  buttons,
  vatRate,
  canAdjustInventory,
}: {
  businessId: string;
  customers: CustomerRow[];
  fabrics: MaterialOption[];
  linings: MaterialOption[];
  buttons: MaterialOption[];
  vatRate: number;
  canAdjustInventory: boolean;
}) {
  const router = useRouter();

  const [type, setType] = React.useState<FactoryOrderType>("suit");
  const [customerId, setCustomerId] = React.useState("");
  const [supplyText, setSupplyText] = React.useState("");
  const [orderDate, setOrderDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [fittingDate, setFittingDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [memo, setMemo] = React.useState("");

  const [options, setOptions] = React.useState<Record<string, OptionValue>>(defaultFactoryOptions());
  const [qty, setQty] = React.useState<Record<string, number>>(defaultFactoryQty());
  const [simpleQty, setSimpleQty] = React.useState(1);
  const [materials, setMaterials] = React.useState<MaterialSelection>(EMPTY_MATERIAL_SELECTION);

  // 재고 차감(consumeMaterial)은 선택 저장과 분리된 별도 동작이다(요청 §3/§6) — 아래 수량은
  // canAdjustInventory 권한이 있을 때만 쓰이고, 없어도 materials 선택 자체는 항상 저장된다.
  const [fabricQty, setFabricQty] = React.useState(1);
  const [liningQty, setLiningQty] = React.useState(1);
  const [buttonQty, setButtonQty] = React.useState(10);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [materialWarnings, setMaterialWarnings] = React.useState<string[]>([]);
  // 결함 CLICK-PATH-103: 경고를 setMaterialWarnings 직후 바로 router.push 해서 화면이
  // 즉시 바뀌어 경고가 한 번도 보이지 않았다. 경고가 있으면 이동을 멈추고, 여기 담아둔
  // 주문 id로 "주문 상세로 이동" 버튼을 눌렀을 때만 이동한다.
  const [createdOrderId, setCreatedOrderId] = React.useState<string | null>(null);

  const supply = parseKRW(supplyText);
  const vatPreview = Math.round(supply * vatRate);
  const totalPreview = supply + vatPreview;

  const onOptionsChange = (key: string, value: unknown) =>
    setOptions((o) => ({ ...o, [key]: value as OptionValue }));
  const onQtyChange = (key: string, value: number) => setQty((q) => ({ ...q, [key]: value }));

  const submit = async () => {
    setError(null);
    setMaterialWarnings([]);
    if (!customerId) { setError("고객을 선택하세요."); return; }
    if (supply <= 0) { setError("공급가를 입력하세요."); return; }

    setBusy(true);
    // 선택 자재(원단/안감/단추)는 options jsonb의 예약 키(_materials)에 얹어서 저장한다 — 재고
    // 조정 권한(inventory.adjust) 유무와 무관하게 "무엇을 골랐는지"는 항상 남는다(요청 §3/§6).
    const optionsWithMaterials = type === "suit" ? writeMaterialSelection(options, materials) : {};
    const result = await createFactoryOrder(businessId, {
      customerId,
      type,
      supply,
      options: optionsWithMaterials,
      qty: type === "suit" ? qty : { ...defaultFactoryQty(), s: simpleQty },
      orderDate,
      fittingDate: fittingDate || undefined,
      dueDate: dueDate || undefined,
      memo: memo || undefined,
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    // 기준본 §C: 정장 주문에 쓰인 원단 -1 / 안감 -1 / 단추 -10 (재고 조정 권한 있을 때만 시도).
    // 이 출고는 위 "선택 저장"과 완전히 분리된 별도 단계다 — 권한이 없으면 저장은 되고 출고만 스킵된다.
    if (type === "suit" && canAdjustInventory) {
      const warnings: string[] = [];
      const consumptions: [string, string, number][] = [
        [materials.fabricId ?? "", "원단", fabricQty],
        [materials.liningId ?? "", "안감", liningQty],
        [materials.buttonId ?? "", "단추", buttonQty],
      ];
      for (const [materialId, label, mQty] of consumptions) {
        if (!materialId) continue;
        const r = await consumeMaterial(businessId, result.data.id, materialId, mQty, "ea", "정장 주문 등록");
        if (!r.ok) warnings.push(`${label} 재고 차감 실패: ${r.message}`);
      }
      if (warnings.length) {
        // 경고가 있으면 여기서 멈춘다 — 주문 자체는 이미 저장됐으니 이동은 사용자가
        // 경고를 읽은 뒤 버튼으로 직접 한다.
        setBusy(false);
        setMaterialWarnings(warnings);
        setCreatedOrderId(result.data.id);
        return;
      }
    }

    router.push(`/w/${businessId}/orders/${result.data.id}`);
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="고객" htmlFor="customerId" required>
            <select id="customerId" className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">-- 고객 선택 --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field label="종류" htmlFor="type" required>
            <select id="type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as FactoryOrderType)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-x-4 sm:grid-cols-3">
        <Input label="주문일" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        <Input label="가봉일" type="date" value={fittingDate} onChange={(e) => setFittingDate(e.target.value)} />
        <Input label="납기" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      {dueDate && (
        <p className="mb-4 -mt-2 text-[12px] text-t3">가봉일·납기가 저장되면 사업장 캘린더에 자동 반영됩니다.</p>
      )}

      <div className="mb-5 grid grid-cols-1 gap-x-4 sm:grid-cols-3">
        <Input
          label="공급가(원)"
          value={supplyText}
          onChange={(e) => setSupplyText(e.target.value)}
          placeholder="예) 1200000"
          hint="부가세는 사업장 설정 세율로 서버가 계산합니다."
        />
        <Field label="부가세(미리보기)" htmlFor="vat-preview">
          <input id="vat-preview" readOnly value={formatKRW(vatPreview)} className={`${selectClass} bg-sf2 text-t2`} />
        </Field>
        <Field label="합계(미리보기)" htmlFor="total-preview">
          <input id="total-preview" readOnly value={formatKRW(totalPreview)} className={`${selectClass} bg-sf2 font-bold text-t`} />
        </Field>
      </div>

      {type === "suit" ? (
        <>
          <GarmentWorkspace
            options={options}
            qty={qty}
            materials={materials}
            onOptionsChange={onOptionsChange}
            onQtyChange={onQtyChange}
            onMaterialsChange={setMaterials}
            fabrics={fabrics}
            linings={linings}
            buttons={buttons}
          />

          <div className="mt-5 border-t border-[var(--bd)] pt-4">
            <h3 className="mb-3 text-[13px] font-semibold text-t">재고 출고(선택)</h3>
            <p className="mb-2 text-[12px] text-t3">
              위에서 고른 원단·안감·단추 선택은 항상 주문에 저장됩니다. 아래 출고 수량은
              재고 조정(inventory.adjust) 권한이 있을 때만, 저장과 별도로 실제 재고를 차감합니다.
            </p>
            {canAdjustInventory ? (
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
                <ConsumeQtyField label="원단" selectedLabel={materials.fabricLabel} qty={fabricQty} onQtyChange={setFabricQty} />
                <ConsumeQtyField label="안감" selectedLabel={materials.liningLabel} qty={liningQty} onQtyChange={setLiningQty} />
                <ConsumeQtyField label="단추" selectedLabel={materials.buttonLabel} qty={buttonQty} onQtyChange={setButtonQty} />
              </div>
            ) : (
              <p className="text-[12px] text-t3">재고 조정 권한이 없어 선택해도 재고는 차감되지 않습니다(선택 자체는 정상 저장됩니다).</p>
            )}
          </div>
        </>
      ) : (
        <div className="mb-2">
          <Field label="수량" htmlFor="simpleQty" hint="옵션 항목은 정장만 지원합니다. 셔츠·구두는 수량·일정·금액만 관리합니다.">
            <input
              id="simpleQty"
              type="number"
              min={1}
              className={selectClass}
              value={simpleQty}
              onChange={(e) => setSimpleQty(Math.max(1, Number(e.target.value || 1)))}
            />
          </Field>
        </div>
      )}

      <div className="mt-4">
        <Field label="메모" htmlFor="memo">
          <textarea
            id="memo"
            rows={2}
            className="w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 py-2 text-sm text-t outline-none focus:border-[var(--accent)]"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </Field>
      </div>

      <FormError message={error ?? undefined} />
      {materialWarnings.length > 0 && createdOrderId && (
        <div className="mt-2 flex flex-col gap-2 rounded-[var(--r-md)] bg-wb px-3 py-2.5 text-[12.5px] text-wt">
          <div className="flex items-center gap-1.5 font-medium"><CircleAlert size={14} /> 주문은 저장되었지만 일부 재고 차감이 실패했습니다.</div>
          {materialWarnings.map((w) => <div key={w}>{w}</div>)}
          <div className="mt-1">
            <Button size="sm" variant="secondary" onClick={() => router.push(`/w/${businessId}/orders/${createdOrderId}`)}>
              주문 상세로 이동
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>취소</Button>
        <Button onClick={submit} loading={busy}>
          <Check size={14} />
          등록
        </Button>
      </div>
    </Card>
  );
}

/** 원단/안감/단추 출고 수량 입력 — 선택 자체는 GarmentWorkspace가 담당하고, 여기는 "얼마나 뺄지"만 다룬다. */
function ConsumeQtyField({
  label, selectedLabel, qty, onQtyChange,
}: {
  label: string;
  selectedLabel: string | null;
  qty: number;
  onQtyChange: (n: number) => void;
}) {
  return (
    <div className="mb-3.5">
      <Field label={label} htmlFor={`consume-${label}`} hint={selectedLabel ?? "미선택 — 위에서 먼저 고르세요"}>
        <input
          id={`consume-${label}`}
          type="number"
          min={0}
          className={`${selectClass} w-24`}
          value={qty}
          onChange={(e) => onQtyChange(Number(e.target.value || 0))}
          aria-label={`${label} 출고 수량`}
        />
      </Field>
    </div>
  );
}
