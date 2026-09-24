"use client";

/**
 * 신규 UI 프리미티브용 테마 토글.
 * components/layout/ThemeToggle.tsx(기존 Topbar용)와 별개 — 인증 화면 등에서 쓴다.
 * 실제 상태는 lib/stores/themeStore.ts를 그대로 따른다(이 파일은 읽기만 한다).
 */
import { Moon, Sun } from "@/lib/icons";
import { useThemeStore } from "@/lib/stores/themeStore";
import { cn } from "@/lib/utils/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={cn(
        // PC 36px, 터치 44px(§4.2). h-9 는 31.5px 이라 px 로.
        "flex h-[36px] w-[36px] items-center justify-center rounded-full border border-[var(--bd)] bg-sf text-t2 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]",
        "transition-colors hover:bg-sf2 hover:text-t",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        className
      )}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
