"use client";

import {
  IconShirt,
  IconShirtFilled,
  IconRectangleVertical,
  IconWind,
  IconRuler,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useToastStore } from "@/lib/stores/toastStore";
import { cn } from "@/lib/utils/cn";
import type { Style, StyleCategory } from "@/types/style";

const ICONS: Record<StyleCategory, TablerIcon> = {
  수트: IconShirt,
  재킷: IconShirt,
  팬츠: IconRectangleVertical,
  코트: IconWind,
  조끼: IconShirtFilled,
};

const BG_GRADIENTS: Record<StyleCategory, string> = {
  수트: "bg-gradient-to-br from-[#e2edfc] to-[#c8d8f5]",
  재킷: "bg-gradient-to-br from-[#e4f3eb] to-[#b5e0c4]",
  팬츠: "bg-gradient-to-br from-[#fdf1dd] to-[#f5ddb0]",
  코트: "bg-gradient-to-br from-[#fce6e6] to-[#f0c0c0]",
  조끼: "bg-gradient-to-br from-[#ede8fc] to-[#d0c0f0]",
};

const CAT_BADGE: Record<StyleCategory, string> = {
  수트: "b-info",
  재킷: "b-ok",
  팬츠: "b-warn",
  코트: "b-err",
  조끼: "b-info",
};

export function StyleCard({ style }: { style: Style }) {
  const showToast = useToastStore((s) => s.show);
  const Icon = ICONS[style.cat];

  return (
    <div
      onClick={() =>
        showToast(
          style.name,
          `₩${style.base.toLocaleString()}~ · ${style.fabric_m}m · ${style.tags.join(", ")}`,
          "info"
        )
      }
      className="bg-sf border border-bd rounded-xl overflow-hidden cursor-pointer transition-all hover:border-bd2 hover:shadow-card-hover hover:-translate-y-0.5"
    >
      <div className={cn("h-[130px] flex items-center justify-center border-b border-bd relative", BG_GRADIENTS[style.cat])}>
        <Icon size={46} className="opacity-25 text-t" />
        <span className="absolute top-2.5 right-2.5 text-[9px] font-bold text-t3 bg-sf px-2 py-0.5 rounded border border-bd">
          {style.id}
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className={`badge ${CAT_BADGE[style.cat]}`} style={{ fontSize: 10 }}>
            {style.cat}
          </span>
          <span className="text-[11px] text-t3 flex items-center gap-1">
            <IconRuler size={11} /> {style.fabric_m}m · ₩{style.base.toLocaleString()}~
          </span>
        </div>
        <div className="text-sm font-bold text-t mb-1">{style.name}</div>
        <div className="text-[11px] text-t2 leading-relaxed mb-2 min-h-[32px]">
          {style.desc}
        </div>
        <div className="flex flex-wrap gap-1">
          {style.tags.map((t) => (
            <span
              key={t}
              className="text-[9px] py-0.5 px-2 rounded-sm bg-sf3 text-t3 font-semibold border border-bd"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
