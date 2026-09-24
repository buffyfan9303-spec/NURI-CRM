"use client";

import * as React from "react";
import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

export interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = 보라 pill CTA(§8.1). ghost = 보조 동작(재시도·로그아웃 등) 텍스트 버튼. */
  variant?: "primary" | "ghost";
  loading?: boolean;
}

/**
 * 인증 화면 버튼.
 *
 * primary 는 원본의 큰 보라 pill 이다 — 폼과 같은 폭, 높이 56px, 선명한 보라.
 * §10.1: "정상 CTA 를 비활성 Continue 처럼 흐리게 만들지 않는다" — 그래서 평상시에는
 * 언제나 --auth-cta 로 꽉 찬 색이고, 비활성 회색(--auth-disabled)은 **실제로 잠겼을 때만** 쓴다.
 * 흰 글자 대비 계산값: Light #7543e6 5.52:1 / Dark #8950fc 4.55:1.
 *
 * 업무 화면의 녹색 CTA 와 색 역할을 나눈 원칙은 그대로다 — 인증 세계는 보라다.
 */
export const AuthButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ variant = "primary", loading = false, disabled, className, children, ...rest }, ref) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)]",
          variant === "primary"
            ? [
                "h-[56px] w-full bg-auth-cta text-[16px] text-auth-cta-tx hover:bg-auth-cta-hover",
                "active:bg-auth-cta-hover",
                "disabled:cursor-not-allowed disabled:bg-auth-disabled disabled:text-auth-tx2",
              ]
            : [
                "h-[44px] border border-auth-field-bd px-4 text-[13.5px] text-auth-tx2",
                "hover:border-auth-input-bd hover:text-auth-tx",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ],
          className
        )}
        {...rest}
      >
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);
AuthButton.displayName = "AuthButton";
