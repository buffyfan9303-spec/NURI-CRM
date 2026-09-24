"use client";

import { IconNeedle, IconCalendar, IconExternalLink } from "@tabler/icons-react";
import { useToastStore } from "@/lib/stores/toastStore";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { SEED_VENDOR_EXTRA } from "@/lib/data/seed";
import { cn } from "@/lib/utils/cn";
import type { Business } from "@/types/business";

export function VendorCard({ business }: { business: Business }) {
  const showToast = useToastStore((s) => s.show);
  const fabrics = useFabricStore((s) => s.fabrics);
  const ex = SEED_VENDOR_EXTRA[business.id] ?? {
    phone: "—", addr: "—", rep: "—", since: "—", ytd: "—",
  };
  const fabCnt = fabrics.filter((f) => f.businessId === business.id).length;

  return (
    <div
      onClick={() =>
        showToast(business.name, `담당자: ${ex.rep} · ${ex.phone}`, "info")
      }
      className="bg-sf border border-bd rounded-xl p-[18px] shadow-card transition-all hover:border-bd2 hover:shadow-card-hover cursor-pointer"
    >
      <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-bd">
        <div className="w-[42px] h-[42px] rounded-[10px] flex items-center justify-center text-white text-lg flex-shrink-0 shadow-card bg-gradient-to-br from-[#c8914a] to-[#a67838]">
          <IconNeedle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-t tracking-tight">{business.name}</div>
          <div className="text-[11px] text-t2 mt-0.5">{business.id} · {ex.rep}</div>
        </div>
        <span className={`badge ${business.approved ? "b-ok" : "b-err"}`}>
          {business.approved ? "거래중" : "중지"}
        </span>
      </div>

      <Row label="연락처" value={ex.phone} />
      <Row label="주소" value={ex.addr} small />
      <Row label="취급원단" value={`${fabCnt}종`} />
      <Row label="올해 거래액" value={ex.ytd} gold />

      <div className="mt-2.5 pt-2.5 border-t border-bd flex justify-between items-center text-[11px] text-t2">
        <span className="flex items-center gap-1">
          <IconCalendar size={11} /> 거래 시작 {ex.since}
        </span>
        <span className="flex items-center gap-1 text-it font-bold">
          <IconExternalLink size={11} /> 상세
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  small,
  gold,
}: {
  label: string;
  value: string;
  small?: boolean;
  gold?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline py-1 text-xs">
      <span className="text-t3 flex-shrink-0">{label}</span>
      <span
        className={cn(
          "text-t font-semibold",
          small && "text-[11px] max-w-[60%] text-right break-words",
          gold && "text-gold font-extrabold"
        )}
      >
        {value}
      </span>
    </div>
  );
}
