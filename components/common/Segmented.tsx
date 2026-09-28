"use client";

/**
 * 세그먼트 컨트롤 — "보기 전환"(목록↔담당자별, 월/주/일, 출결 상태)처럼 서로 배타적인 값 중 하나를 고를 때.
 * 필터 탭(건수 포함)은 계속 listkit.StatusTab 을 쓴다.
 *
 * 레퍼런스: Cal.com 의 예약 보기 토글(면 위 pill 이 미끄러짐)·Linear 뷰 스위처. 활성 조각은
 * motion `layoutId` 로 이전 위치에서 새 위치로 180ms(`--dur-2`) 미끄러지고, reduced-motion 이면 즉시 바뀐다.
 * 조각 높이는 PC 32px, 터치 화면 44px. `tone` 을 넘기면 조각마다 활성 색을 달리할 수 있다(출결 상태 색).
 */
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** 활성일 때 조각 색. 기본은 sf 면 + 글자 t. */
  tone?: "default" | "success" | "warning" | "error" | "accent";
}

const TONE_TEXT: Record<NonNullable<SegmentedOption<string>["tone"]>, string> = {
  default: "text-t",
  success: "text-okt",
  warning: "text-wt",
  error: "text-et",
  accent: "text-[var(--accent-contrast)]",
};
const TONE_BG: Record<NonNullable<SegmentedOption<string>["tone"]>, string> = {
  default: "bg-sf shadow-card",
  success: "bg-okb",
  warning: "bg-wb",
  error: "bg-eb",
  accent: "bg-[var(--accent-strong)]",
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  disabled,
  role = "group",
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  /** sm: 28px(표 안), md: 32px(기본), lg: 40px(휴대폰 전폭 탭). 터치 화면은 전부 44px. */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** 출결처럼 "값을 고른다"는 뜻이 강하면 radiogroup(조각은 radio). */
  role?: "group" | "radiogroup";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const id = React.useId();
  const h = size === "sm" ? "h-[28px]" : size === "lg" ? "h-[40px]" : "h-[32px]";
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn("inline-flex max-w-full items-stretch gap-0.5 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-0.5", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        const tone = o.tone ?? "default";
        return (
          <button
            key={o.value}
            type="button"
            role={role === "radiogroup" ? "radio" : undefined}
            aria-checked={role === "radiogroup" ? on : undefined}
            aria-pressed={role === "group" ? on : undefined}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] px-3 text-[12.5px] font-medium transition-colors duration-1 ease-out disabled:cursor-not-allowed disabled:opacity-60 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:min-w-[44px]",
              h,
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
              on ? TONE_TEXT[tone] : "text-t2 hover:text-t"
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40, mass: 0.6 }}
                className={cn("absolute inset-0 rounded-[var(--r-sm)]", TONE_BG[tone])}
                aria-hidden
              />
            )}
            <span className="relative z-[1] inline-flex items-center gap-1">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
