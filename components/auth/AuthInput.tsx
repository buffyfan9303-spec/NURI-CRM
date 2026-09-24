"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { AuthField, FloatLabel } from "./AuthField";

export interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** 선택. reference-03 의 입력에는 좌측 아이콘이 없다 — 필요한 화면(사업장 생성 등)만 넘긴다. */
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
}

/**
 * 인증 화면 입력(§8.1·§10.1).
 *
 * 원본 치수: 높이 50~56px, 반경 7~9px 의 **사각** 입력(pill 아님), 행 간격 12~16px.
 *
 * 경계선을 --auth-input-bd 로 두는 이유: Dark 에서 입력 면(#13171c)이 프레임과 같은 색이라
 * **경계가 유일한 식별 수단**이다. 원본의 거의 안 보이는 테두리를 그대로 복제하면 필수 조작
 * 경계 3:1 을 못 맞춘다(§9.1 이 허용한 "조금 선명하게 보정"). 계산값: Dark 3.65:1 / Light 3.41:1.
 */
export const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, hint, error, required, id, className, icon: Icon, placeholder: _placeholder, ...rest }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <AuthField floating label={label} htmlFor={inputId} required={required} hint={hint} hintId={hintId} error={error} errorId={errorId}>
        <div className="relative">
          {Icon && (
            <Icon size={18} className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-auth-tx2" />
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={!!error || undefined}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            // 넷플릭스형: 떠오르는 라벨 자리를 위해 위쪽 여백을 크게, placeholder 는 공백 하나(라벨 판정용).
            placeholder=" "
            className={cn(
              "peer h-[56px] w-full rounded-[4px] border bg-auth-field pb-[6px] pr-4 pt-[22px] text-[16px] text-auth-tx outline-none lg:text-[15px]",
              Icon ? "pl-[42px]" : "pl-[14px]",
              "transition-colors",
              // 잠겼으면 잠긴 것처럼 보여야 한다(QA R4: disabled 인데 평소와 똑같아 보였다).
              "disabled:cursor-not-allowed disabled:opacity-55",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)]",
              error ? "border-[var(--auth-accent)]" : "border-auth-input-bd focus:border-[var(--auth-accent)]",
              className
            )}
            {...rest}
          />
          <FloatLabel htmlFor={inputId} label={label} required={required} inset={Icon ? 42 : 14} />
        </div>
      </AuthField>
    );
  }
);
AuthInput.displayName = "AuthInput";
