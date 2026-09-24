/**
 * 다크모드 토글 버튼 (Topbar 우측 표준).
 * 기존 .topbar-icon-btn 스타일을 그대로 옮김.
 */
"use client";

import { useThemeStore } from "@/lib/stores/themeStore";
import { IconSun, IconMoon } from "@tabler/icons-react";

export function ThemeToggle() {
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const Icon = isDark ? IconSun : IconMoon;

  return (
    <button
      type="button"
      onClick={toggle}
      title="다크모드 전환"
      className="w-[34px] h-[34px] border border-bd rounded-[7px] bg-transparent text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-sf2 hover:text-t"
    >
      <Icon size={16} />
    </button>
  );
}
