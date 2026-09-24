"use client";

import {
  IconCash,
  IconCalendarStats,
  IconChartPie,
  IconReceipt,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { parsePriceString } from "@/lib/utils/price";
import { parseOrdDate } from "@/lib/utils/dday";
import { cn } from "@/lib/utils/cn";

const fmt = (n: number) => "₩" + n.toLocaleString();

interface MetricBoxProps {
  variant: "m1" | "m2" | "m3" | "m4";
  Icon: TablerIcon;
  label: string;
  value: string;
  note?: string;
  noteVariant?: "up" | "dn";
}

const ACCENT: Record<MetricBoxProps["variant"], string> = {
  m1: "border-l-[3px] border-l-acc",
  m2: "border-l-[3px] border-l-gold",
  m3: "border-l-[3px] border-l-[#22c55e]",
  m4: "border-l-[3px] border-l-[#e8734a]",
};

function MetricBox({ variant, Icon, label, value, note, noteVariant }: MetricBoxProps) {
  return (
    <div className={cn("bg-sf border border-bd rounded-xl py-4 px-5 relative overflow-hidden shadow-card", ACCENT[variant])}>
      <Icon size={36} className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-[.07] text-t pointer-events-none" />
      <div className="text-[10px] font-bold text-t2 uppercase tracking-[.6px] mb-2">{label}</div>
      <div className="text-2xl font-black tracking-[-1px] leading-tight">{value}</div>
      {note && (
        <div className={cn("text-[10px] mt-1.5", noteVariant === "up" && "text-okt", noteVariant === "dn" && "text-et", !noteVariant && "text-t3")}>
          {note}
        </div>
      )}
    </div>
  );
}

export function AccountingMetrics() {
  const flatten = useCustomerStore((s) => s.flattenOrders);
  const rows = flatten();

  const totalRev = rows.reduce((a, r) => a + parsePriceString(r.order.price), 0);
  const thisMonth = rows
    .filter((r) => {
      const d = parseOrdDate(r.order.ord);
      return d && d.getFullYear() === 2026 && d.getMonth() === 4;
    })
    .reduce((a, r) => a + parsePriceString(r.order.price), 0);
  const outstanding = rows
    .filter((r) => r.order.st !== "배송완료")
    .reduce((a, r) => a + parsePriceString(r.order.price), 0);
  const avg = rows.length ? Math.round(totalRev / rows.length) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3.5">
      <MetricBox variant="m1" Icon={IconCash}          label="총 매출"        value={fmt(totalRev)}    note="↑ 2026년 누적" noteVariant="up" />
      <MetricBox variant="m2" Icon={IconCalendarStats} label="이번달 매출"    value={fmt(thisMonth)}   note="2026.05 기준" />
      <MetricBox variant="m3" Icon={IconChartPie}      label="평균 주문가"    value={fmt(avg)}         note="건당 평균" />
      <MetricBox variant="m4" Icon={IconReceipt}       label="미수금 (진행중)" value={fmt(outstanding)} note="↓ 미정산 합계" noteVariant="dn" />
    </div>
  );
}
