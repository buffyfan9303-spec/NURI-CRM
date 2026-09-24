/**
 * 칸반 보드 — 6개 컬럼 + 가로 스크롤.
 * 시드 데이터 + STATUS_TO_COLUMN 매핑으로 자동 분류.
 */
"use client";

import { useMemo } from "react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { PROD_COLUMNS } from "@/lib/constants/prodColumns";
import { STATUS_TO_COLUMN } from "@/lib/constants/statusMaps";
import { KanbanColumn } from "./KanbanColumn";
import type { Customer } from "@/types/customer";
import type { KanbanColumn as ColKey, Order } from "@/types/order";

export function KanbanBoard() {
  const customers = useCustomerStore((s) => s.customers);

  const buckets = useMemo(() => {
    const b: Record<ColKey, { customer: Customer; order: Order }[]> = {
      주문접수: [], 원단발주: [], 재단중: [], 봉제중: [], 검수중: [], 배송예정: [],
    };
    for (const c of customers) {
      for (const o of c.orders) {
        const col = STATUS_TO_COLUMN[o.st];
        if (col) b[col].push({ customer: c, order: o });
      }
    }
    return b;
  }, [customers]);

  return (
    <div className="flex gap-3 px-3 md:px-5 py-3 md:py-[18px] h-full box-border overflow-x-auto overflow-y-hidden items-start scrollable snap-x snap-mandatory md:snap-none">
      {PROD_COLUMNS.map((col) => (
        <KanbanColumn
          key={col.key}
          colKey={col.key}
          color={col.color}
          cards={buckets[col.key]}
        />
      ))}
    </div>
  );
}
