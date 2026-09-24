/**
 * D-Day 칩 — 납기 임박/초과/완료 시각화.
 * 기존 .dday-chip 스타일을 인라인으로 옮김.
 */
"use client";

import { IconCheck, IconClock, IconAlertTriangle } from "@tabler/icons-react";
import { ddayChip, type DDayKind } from "@/lib/utils/dday";
import type { Order } from "@/types/order";
import { cn } from "@/lib/utils/cn";

const STYLES: Record<DDayKind, string> = {
  over:  "bg-eb text-et",
  today: "bg-wb text-wt",
  soon:  "bg-ib text-it",
  ok:    "bg-okb text-okt",
  done:  "bg-sf3 text-t3",
  none:  "bg-sf3 text-t3",
};

export function DDayChip({ order }: { order: Pick<Order, "st" | "del"> }) {
  const { kind, label } = ddayChip(order);
  const Icon =
    kind === "over"  ? IconAlertTriangle :
    kind === "today" ? IconClock :
    kind === "done"  ? IconCheck :
    null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-bold tracking-tight",
        STYLES[kind]
      )}
    >
      {Icon && <Icon size={10} />}
      {label}
    </span>
  );
}
