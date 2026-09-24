"use client";

import { cn } from "@/lib/utils/cn";
import type { DeliveryFilter } from "@/lib/stores/uiStore";

interface Chip {
  key: DeliveryFilter;
  label: string;
  count: number;
}

interface Props {
  current: DeliveryFilter;
  chips: Chip[];
  onSelect: (k: DeliveryFilter) => void;
}

export function DeliveryFilterChips({ current, chips, onSelect }: Props) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onSelect(c.key)}
          className={cn(
            "py-1.5 px-3 border border-bd2 rounded-full text-[11px] font-bold cursor-pointer select-none transition-colors",
            current === c.key
              ? "bg-acc border-acc text-white"
              : "bg-sf text-t2 hover:bg-sf2 hover:text-t"
          )}
        >
          {c.label}
          <span className="ml-1 text-[10px] opacity-70">({c.count})</span>
        </button>
      ))}
    </div>
  );
}
