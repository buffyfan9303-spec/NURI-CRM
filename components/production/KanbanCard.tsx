/**
 * 칸반 카드 1장.
 * D-Day 3일 이내면 좌측 빨간 보더 강조 (D+N, D-DAY).
 */
"use client";

import { IconClock, IconAlertTriangle } from "@tabler/icons-react";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";
import { ddayFromToday } from "@/lib/utils/dday";
import { cn } from "@/lib/utils/cn";
import type { Customer } from "@/types/customer";
import type { Order } from "@/types/order";

interface Props {
  customer: Customer;
  order: Order;
}

export function KanbanCard({ customer, order }: Props) {
  const open = useCustomerDetailStore((s) => s.open);
  const diff = ddayFromToday(order.del);
  const urgent = diff !== null && diff <= 0;
  const soon = diff !== null && diff > 0 && diff <= 3;

  return (
    <div
      onClick={() => open(customer.name)}
      className={cn(
        "bg-sf border border-bd rounded-lg py-2.5 px-3 mb-1.5 cursor-pointer last:mb-0 transition-all",
        "border-l-[3px] hover:border-bd2 hover:shadow-card",
        urgent ? "!border-l-[#e85c4a]" : "border-l-transparent"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-bold text-t">{customer.name}</span>
        <span className="text-[10px] text-t3 font-semibold">{order.no}</span>
      </div>
      <div className="text-xs text-t2 mb-2 leading-snug">{order.item}</div>
      <div className="flex flex-col gap-0.5">
        <Meta label="공장" value={order.fac || "—"} />
        <Meta label="납기" value={order.del} />
        {diff !== null && diff < 0 && (
          <DDayLine type="over" days={Math.abs(diff)} />
        )}
        {diff === 0 && <DDayLine type="today" />}
        {soon && <DDayLine type="soon" days={diff} />}
        <div className="text-xs font-bold text-acc mt-1">
          ₩{order.price || "0"}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[11px] text-t2">
      <span className="text-t3 mr-1 font-bold">{label}</span>
      {value}
    </div>
  );
}

function DDayLine({
  type,
  days,
}: {
  type: "over" | "today" | "soon";
  days?: number;
}) {
  if (type === "over") {
    return (
      <div className="text-[10px] text-et font-bold mt-1 flex items-center gap-1">
        <IconAlertTriangle size={11} />
        D+{days} 초과
      </div>
    );
  }
  if (type === "today") {
    return (
      <div className="text-[10px] text-et font-bold mt-1 flex items-center gap-1">
        <IconClock size={11} />
        D-DAY
      </div>
    );
  }
  return (
    <div className="text-[10px] text-wt font-bold mt-1 flex items-center gap-1">
      <IconClock size={10} />
      D-{days}
    </div>
  );
}
