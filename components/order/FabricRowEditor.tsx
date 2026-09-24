/**
 * 주문 폼의 원단 멀티-로우 편집기.
 * 기존 .fab-rows-wrap / addFabricRow / onFabRowBizChange 를 React state 로 변환.
 *
 * value/onChange 패턴으로 부모(OrderForm)가 가격 자동 산출을 수행.
 */
"use client";

import { IconPlus } from "@tabler/icons-react";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { useBusinessStore } from "@/lib/stores/businessStore";
import { FInput, FSelect } from "@/components/common/Form";
import type { OrderFabric } from "@/types/order";
import { DEFAULT_FABRIC_M } from "@/lib/constants/basePrice";

interface Props {
  rows: OrderFabric[];
  onChange: (rows: OrderFabric[]) => void;
}

export function FabricRowEditor({ rows, onChange }: Props) {
  const fabrics = useFabricStore((s) => s.fabrics);
  const businesses = useBusinessStore((s) => s.businesses);

  /* 보유 원단이 있는 업체만 옵션으로 노출 */
  const fabricBizIds = Array.from(new Set(fabrics.map((f) => f.businessId)));

  const updateRow = (i: number, patch: Partial<OrderFabric>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const addRow = () => {
    onChange([
      ...rows,
      { fabricBizId: "", fabricId: "", m: DEFAULT_FABRIC_M },
    ]);
  };

  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const statusBadge: Record<string, string> = { 부족: "⚠ ", 매진: "✕ " };

  return (
    <>
      <div className="flex flex-col gap-2 mb-1.5">
        {rows.map((row, i) => {
          const bizFabrics = row.fabricBizId
            ? fabrics.filter((f) => f.businessId === row.fabricBizId)
            : [];
          return (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_68px_auto] gap-2 items-end p-2.5 sm:p-0 bg-sf2 sm:bg-transparent border border-bd sm:border-0 rounded-lg sm:rounded-none"
            >
              <div>
                <div className="text-[9px] font-bold text-t2 uppercase tracking-[.4px] mb-1 whitespace-nowrap">
                  원단업체
                </div>
                <FSelect
                  value={row.fabricBizId}
                  onChange={(e) =>
                    updateRow(i, { fabricBizId: e.target.value, fabricId: "" })
                  }
                >
                  <option value="">-- 원단업체 --</option>
                  {fabricBizIds.map((bid) => {
                    const b = businesses.find((x) => x.id === bid);
                    return (
                      <option key={bid} value={bid}>
                        {b?.name ?? bid}
                      </option>
                    );
                  })}
                </FSelect>
              </div>
              <div>
                <div className="text-[9px] font-bold text-t2 uppercase tracking-[.4px] mb-1 whitespace-nowrap">
                  원단명
                </div>
                <FSelect
                  value={row.fabricId}
                  disabled={!row.fabricBizId}
                  onChange={(e) => updateRow(i, { fabricId: e.target.value })}
                >
                  <option value="">
                    {row.fabricBizId ? "-- 원단 선택 --" : "업체 먼저 선택"}
                  </option>
                  {bizFabrics.map((f) => (
                    <option key={f.id} value={f.id}>
                      {(statusBadge[f.status] || "") + f.name}
                    </option>
                  ))}
                </FSelect>
              </div>
              <div>
                <div className="text-[9px] font-bold text-t2 uppercase tracking-[.4px] mb-1 whitespace-nowrap">
                  M 수
                </div>
                <FInput
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={row.m}
                  onChange={(e) =>
                    updateRow(i, { m: parseFloat(e.target.value) || 0 })
                  }
                  className="text-center"
                />
              </div>
              <button
                type="button"
                title="삭제"
                onClick={() => removeRow(i)}
                className="h-[35px] w-[35px] flex-shrink-0 border border-bd2 rounded-[7px] bg-transparent text-t3 cursor-pointer text-[17px] flex items-center justify-center transition-colors hover:bg-eb hover:text-et hover:border-eb"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="w-full py-2 px-3 border border-bd2 border-dashed rounded-[7px] bg-transparent text-t2 cursor-pointer text-xs flex items-center gap-1.5 transition-colors hover:bg-sf2 hover:border-acc hover:text-t"
      >
        <IconPlus size={14} />
        원단 추가
      </button>
    </>
  );
}
