"use client";

import * as React from "react";
import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** true면 스피너를 보여주고 클릭을 막는다(중복 제출 방지). */
  loading?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-[var(--accent-strong)] text-[var(--accent-contrast)] hover:brightness-110 border border-transparent",
  secondary: "bg-sf text-t border border-[var(--bd2)] hover:bg-sf2",
  ghost: "bg-transparent text-t2 border border-transparent hover:bg-sf2 hover:text-t",
  // 글자는 흰색이 아니라 --eb(오류 배경 토큰)다. 다크의 --et 는 연분홍(#ffacb8)이라 흰 글자가 1.77:1 로
  // 안 보였다. --eb 는 라이트 #fdecec(6.5:1) · 다크 #44232b(7.8:1) 로 두 테마 모두 AA 를 넘는다.
  danger: "bg-et text-eb border border-transparent hover:brightness-110",
};

// ⚠ html{font-size:14px} 라 h-9 같은 rem 유틸은 ×0.875 로 줄어든다(h-9 = 31.5px). 전부 px 로 적는다.
//   sm 은 PC 표/카드 안의 보조 동작용 32px, 터치 화면(pointer:coarse)에서는 44px 로 자동 승격한다.
//   md/lg 는 어디서나 44px 이상.
const SIZE_CLASS: Record<Size, string> = {
  sm: "h-[32px] px-3 text-[13px] gap-1.5 [@media(pointer:coarse)]:min-h-[44px]",
  md: "min-h-[44px] px-4 text-[13.5px] gap-2",
  lg: "min-h-[48px] px-5 text-[15px] gap-2",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", loading = false, disabled, className, children, ...rest },
    ref
  ) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          // whitespace-nowrap + shrink-0: 좁은 flex 행에서 라벨이 "수/정" 처럼 세로로 쪼개지거나
          // 버튼이 눌려 찌그러지는 결함을 공용으로 막는다. 긴 라벨은 호출부가 줄이거나 아이콘만 남긴다.
          "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-[var(--r-md)] font-medium",
          "transition-[filter,background-color,opacity] duration-150",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          VARIANT_CLASS[variant],
          SIZE_CLASS[size],
          className
        )}
        {...rest}
      >
        {loading && (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
