/**
 * 칸반 컬럼 1개.
 * 헤더 색은 PROD_COLUMNS 정의에 따라 가변. 빈 상태 fallback 포함.
 */
"use client";

import {
  IconFilePlus,
  IconPackageImport,
  IconCut,
  IconNeedle,
  IconEyeCheck,
  IconTruck,
  IconInbox,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { KanbanCard } from "./KanbanCard";
import type { Customer } from "@/types/customer";
import type { KanbanColumn as Col, Order } from "@/types/order";

const ICONS: Record<Col, TablerIcon> = {
  주문접수: IconFilePlus,
  원단발주: IconPackageImport,
  재단중: IconCut,
  봉제중: IconNeedle,
  검수중: IconEyeCheck,
  배송예정: IconTruck,
};

interface Props {
  colKey: Col;
  color: string;
  cards: { customer: Customer; order: Order }[];
}

export function KanbanColumn({ colKey, color, cards }: Props) {
  const Icon = ICONS[colKey];
  return (
    <div className="flex-shrink-0 w-[216px] flex flex-col h-full snap-start md:snap-align-none">
      <div
        className="px-3.5 pt-2.5 pb-[9px] bg-sf border border-bd rounded-t-lg border-b-0 flex items-center gap-2 flex-shrink-0"
        style={{ borderTopWidth: 3, borderTopColor: color }}
      >
        <Icon size={14} style={{ color }} className="opacity-90" />
        <span className="text-[11px] font-bold uppercase tracking-[.5px] text-t flex-1">
          {colKey}
        </span>
        <span className="text-[10px] font-bold bg-sf3 text-t2 py-0.5 px-2 rounded-[10px]">
          {cards.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto bg-sf2 border border-bd border-t-0 rounded-b-lg p-2 scrollable">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 px-3 text-t3 text-[11px]">
            <IconInbox size={26} className="opacity-30" />
            주문 없음
          </div>
        ) : (
          cards.map(({ customer, order }) => (
            <KanbanCard key={order.no} customer={customer} order={order} />
          ))
        )}
      </div>
    </div>
  );
}
