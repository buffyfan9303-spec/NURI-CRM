/**
 * 통계 카드 (대시보드·관리자·배송·거래처 공통).
 * 기존 .stat-card 디자인 1:1 이식:
 *   - 좌측 3px 색 띠 (c1~c4)
 *   - 우측 배경 큰 아이콘 (opacity 0.06)
 *   - href 가 있으면 hover lift + 그림자
 */
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { Icon as TablerIcon } from "@tabler/icons-react";

export type StatVariant = "c1" | "c2" | "c3" | "c4";

const ACCENT_BG: Record<StatVariant, string> = {
  c1: "before:bg-[#0c1f35]",
  c2: "before:bg-[#c8914a]",
  c3: "before:bg-[#22c55e]",
  c4: "before:bg-[#e8734a]",
};

interface StatCardProps {
  variant: StatVariant;
  Icon?: TablerIcon;
  label: string;
  value: string | number;
  note?: string;
  noteVariant?: "up" | "dn";
  href?: string;
  title?: string;
}

export function StatCard({
  variant,
  Icon,
  label,
  value,
  note,
  noteVariant,
  href,
  title,
}: StatCardProps) {
  const card = (
    <div
      className={cn(
        "bg-sf border border-bd rounded-[10px] py-4 px-[18px] relative overflow-hidden",
        "shadow-card transition-all duration-200",
        "before:content-[''] before:absolute before:top-0 before:left-0 before:w-[3px] before:h-full",
        ACCENT_BG[variant],
        href &&
          "cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5"
      )}
    >
      {Icon && (
        <Icon
          size={38}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-[.06] text-t pointer-events-none"
        />
      )}
      <div className="text-[10px] font-bold uppercase tracking-[.7px] text-t2 mb-1.5">
        {label}
      </div>
      <div className="text-[30px] font-black tracking-[-1px] text-t leading-none mb-1.5">
        {value}
      </div>
      {note && (
        <div
          className={cn(
            "text-[11px]",
            noteVariant === "up" && "text-okt",
            noteVariant === "dn" && "text-et",
            !noteVariant && "text-t3"
          )}
        >
          {note}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} title={title} className="block">
        {card}
      </Link>
    );
  }
  return card;
}
