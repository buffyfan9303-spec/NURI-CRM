"use client";

/**
 * 정렬 가능한 표 머리글 한 칸. TanStack Table의 `Column`을 받아 aria-sort + 클릭 토글을 붙인다.
 * 기존 `<th className={TH}>` 자리에 그대로 넣는다 — 표 마크업·톤은 호출부가 그대로 유지한다.
 */
import type { SortColumn } from "@/lib/table/useSortedRows";
import { ChevronUp, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

export function SortableTh({
  column,
  label,
  className,
  align = "left",
}: {
  column: SortColumn;
  label: string;
  className?: string;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => column.toggleSorting(sorted === "asc")}
        className={cn(
          "inline-flex items-center gap-0.5 whitespace-nowrap font-medium",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        <span className="inline-flex w-[12px] shrink-0 flex-col items-center justify-center text-t3" aria-hidden>
          {sorted ? (
            sorted === "asc" ? <ChevronUp size={10} weight="bold" /> : <ChevronDown size={10} weight="bold" />
          ) : (
            <ChevronDown size={10} className="opacity-30" />
          )}
        </span>
      </button>
    </th>
  );
}
