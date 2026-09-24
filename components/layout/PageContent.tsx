/**
 * 페이지 본문 스크롤 컨테이너.
 * 기존 .page-content 와 동일 (flex-1, overflow-y:auto, min-h-0, padding 20px 22px).
 * noPadding=true 면 칸반 같은 풀-블리드 페이지용으로 패딩 제거.
 */
"use client";

import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";

interface PageContentProps {
  children: ReactNode;
  noPadding?: boolean;
  noScroll?: boolean;
  className?: string;
}

export function PageContent({
  children,
  noPadding,
  noScroll,
  className,
}: PageContentProps) {
  return (
    <div
      className={cn(
        "flex-1 min-h-0 bg-bg scrollable",
        noScroll ? "overflow-hidden" : "overflow-y-auto",
        !noPadding && "px-[22px] py-5",
        className
      )}
    >
      {children}
    </div>
  );
}
