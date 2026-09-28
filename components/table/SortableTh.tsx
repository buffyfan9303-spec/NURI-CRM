"use client";

/**
 * 정렬 가능한 표 머리글 한 칸. TanStack Table의 `Column`을 받아 aria-sort + 클릭 토글을 붙인다.
 * 기존 `<th className={TH}>` 자리에 그대로 넣는다 — 표 마크업·톤은 호출부가 그대로 유지한다.
 *
 * 2단계 a(2026-09-28, Linear/Airtable 표 머리글 기준):
 * - 버튼이 17px 줄상자였다 → 셀 안쪽 여백까지 히트 영역으로 쓴다(PC 28px, 터치 44px). 셀 시각 위치는 -mx 로 되돌린다.
 * - 정렬 상태를 색으로만 말하지 않는다: 미정렬은 위·아래 겹친 캐럿(흐림), 정렬 중은 라벨 진하게 + 방향 캐럿 하나(강조색).
 * - hover 는 `sf2` 면 120ms, 초점은 공용 outline.
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
        title={sorted === "asc" ? "오름차순 — 누르면 내림차순" : sorted === "desc" ? "내림차순 — 누르면 오름차순" : "정렬"}
        className={cn(
          "group -mx-1.5 inline-flex min-h-[28px] items-center gap-0.5 whitespace-nowrap rounded-[var(--r-xs)] px-1.5 font-medium",
          "transition-[background-color,color] duration-1 ease-out hover:bg-sf2 hover:text-t",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]",
          "[@media(pointer:coarse)]:min-h-[44px]",
          sorted ? "text-t" : "text-inherit",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        <span
          className={cn(
            "relative inline-flex h-[14px] w-[12px] shrink-0 items-center justify-center",
            sorted ? "text-[var(--accent-ink)]" : "text-t3 opacity-50 group-hover:opacity-90"
          )}
          aria-hidden
        >
          {sorted === "asc" ? (
            <ChevronUp size={12} weight="bold" />
          ) : sorted === "desc" ? (
            <ChevronDown size={12} weight="bold" />
          ) : (
            <>
              <ChevronUp size={10} weight="bold" className="absolute -top-px" />
              <ChevronDown size={10} weight="bold" className="absolute -bottom-px" />
            </>
          )}
        </span>
      </button>
    </th>
  );
}
