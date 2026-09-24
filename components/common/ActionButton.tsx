/**
 * Topbar 우측 액션 버튼 (등록·추가용).
 * 기존 .action-btn 디자인.
 */
"use client";

import { cn } from "@/lib/utils/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function ActionButton({ children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "py-2 px-[18px] bg-acc text-white rounded-lg text-xs font-bold cursor-pointer",
        "flex items-center gap-1.5 whitespace-nowrap select-none transition-opacity shadow-card",
        "hover:opacity-90 active:scale-[.98]",
        className
      )}
    >
      {children}
    </button>
  );
}
