"use client";

import * as React from "react";
import { Eye, EyeOff } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { AuthField, FloatLabel } from "./AuthField";

export interface AuthPasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * 인증 화면 비밀번호 입력. AuthInput 과 같은 치수(52px·반경 8px)에 우측 표시/숨기기만 얹는다.
 * 원본도 비밀번호 행 오른쪽에 눈 아이콘 하나만 둔다 — 좌측 자물쇠 아이콘은 없다.
 */
export const AuthPasswordInput = React.forwardRef<HTMLInputElement, AuthPasswordInputProps>(
  ({ label, hint, error, required, id, className, placeholder: _placeholder, ...rest }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const [visible, setVisible] = React.useState(false);

    return (
      <AuthField floating label={label} htmlFor={inputId} required={required} hint={hint} hintId={hintId} error={error} errorId={errorId}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            required={required}
            aria-invalid={!!error || undefined}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            placeholder=" "
            className={cn(
              "peer h-[56px] w-full rounded-[4px] border bg-auth-field pb-[6px] pl-[14px] pr-12 pt-[22px] text-[16px] text-auth-tx outline-none lg:text-[15px]",
              "transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-55",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)]",
              error ? "border-[var(--auth-accent)]" : "border-auth-input-bd focus:border-[var(--auth-accent)]",
              className
            )}
            {...rest}
          />
          <FloatLabel htmlFor={inputId} label={label} required={required} />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"}
            aria-pressed={visible}
            /* ⚠ h-9/w-9 는 이 앱에서 31.5px 이다(html{font-size:14px} → rem ×0.875). px 로 못 박는다. */
            className="absolute right-[4px] top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-[6px] text-auth-tx2 hover:bg-[var(--auth-field-bd)] hover:text-auth-tx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--auth-accent)]"
          >
            {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        </div>
      </AuthField>
    );
  }
);
AuthPasswordInput.displayName = "AuthPasswordInput";
