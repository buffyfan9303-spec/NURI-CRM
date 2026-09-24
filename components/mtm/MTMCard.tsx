/**
 * MTM 카드 1장 — 미리보기 6칸 치수 + 완성도 바.
 * 클릭 시 디테일 패널 열림.
 */
"use client";

import { IconIdBadge2 } from "@tabler/icons-react";
import { CustomerAvatar } from "@/components/customer/CustomerAvatar";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";
import { mtmCompleteness, mtmCompletenessColor } from "@/lib/utils/mtmCompleteness";
import { cn } from "@/lib/utils/cn";
import type { Customer } from "@/types/customer";

const PREVIEW_FIELDS: { k: keyof Customer; l: string; u?: string }[] = [
  { k: "height", l: "키", u: "cm" },
  { k: "weight", l: "몸무게", u: "kg" },
  { k: "chest", l: "가슴" },
  { k: "waist", l: "허리" },
  { k: "sleeve", l: "소매" },
  { k: "jacket", l: "상의길이" },
];

const COLOR_CLASS = {
  ok: "text-okt",
  warn: "text-wt",
  err: "text-et",
} as const;

const FILL_BG = {
  ok: "bg-okt",
  warn: "bg-wt",
  err: "bg-et",
} as const;

export function MTMCard({ customer }: { customer: Customer }) {
  const open = useCustomerDetailStore((s) => s.open);
  const pct = mtmCompleteness(customer);
  const colorKey = mtmCompletenessColor(pct);

  return (
    <div
      onClick={() => open(customer.name)}
      className="bg-sf border border-bd rounded-xl p-4 cursor-pointer transition-all hover:border-bd2 hover:shadow-card-hover"
    >
      <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-bd">
        <CustomerAvatar name={customer.name} size={38} />
        <div>
          <div className="text-sm font-bold text-t">{customer.name}</div>
          <div className="text-[11px] text-t2 mt-0.5">
            {customer.birth} · {customer.gender}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {PREVIEW_FIELDS.map((f) => {
          const v = customer[f.k];
          return (
            <div key={String(f.k)} className="py-1.5 px-2 bg-sf2 rounded-md">
              <div className="text-[9px] text-t3 font-bold uppercase tracking-[.3px]">{f.l}</div>
              <div className="text-[13px] font-bold text-t mt-px">
                {v ? `${v}${f.u || ""}` : "-"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-t3">
        <div className="flex-1 h-[3px] bg-sf3 rounded-sm overflow-hidden">
          <div
            className={cn("h-full transition-[width] duration-300", FILL_BG[colorKey])}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("font-bold min-w-[28px] text-right", COLOR_CLASS[colorKey])}>{pct}%</span>
      </div>

      <div className="mt-2.5 pt-2 border-t border-bd">
        <div className="w-full flex items-center justify-center gap-1.5 text-[11px] py-1.5 border border-bd2 rounded-md text-t2 hover:bg-sf2 transition-colors">
          <IconIdBadge2 size={12} />
          전체 치수카드
        </div>
      </div>
    </div>
  );
}
