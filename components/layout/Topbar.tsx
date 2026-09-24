/**
 * 페이지 상단바.
 * 기존 .topbar 의 디자인을 유지 — 54px 고정 높이, 다크모드 그림자.
 * 모바일에서는 좌측에 햄버거 버튼 노출 (사이드바 드로어 토글).
 *
 *   <Topbar title="대시보드">
 *     <span className="text-xs text-t3">2026.05.15</span>
 *     <ThemeToggle />
 *   </Topbar>
 */
"use client";

import { IconMenu2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/lib/stores/uiStore";
import type { ReactNode } from "react";

interface TopbarProps {
  title: ReactNode;
  /** 우측 영역 (검색·액션 버튼·테마 토글 등) */
  children?: ReactNode;
  className?: string;
}

export function Topbar({ title, children, className }: TopbarProps) {
  const openSidebar = useUIStore((s) => s.openSidebar);

  return (
    <div
      className={cn(
        "h-[54px] border-b border-bd flex items-center px-3 md:px-[22px] gap-2 md:gap-3 flex-shrink-0",
        "bg-sf shadow-topbar relative z-10",
        className
      )}
    >
      {/* 모바일 햄버거 — md 이상에서는 숨김 */}
      <button
        type="button"
        onClick={openSidebar}
        aria-label="메뉴 열기"
        className="md:hidden w-9 h-9 -ml-1 flex items-center justify-center text-t2 hover:text-t hover:bg-sf2 rounded-md"
      >
        <IconMenu2 size={20} />
      </button>

      <h1 className="text-[14px] md:text-[15px] font-extrabold flex-1 text-t tracking-[-.4px] truncate min-w-0 m-0">
        {title}
      </h1>
      {children}
    </div>
  );
}
