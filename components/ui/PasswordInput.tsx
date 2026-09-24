"use client";

import * as React from "react";
import { Eye, EyeOff } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { Field } from "./Field";
import { FormError } from "./FormError";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
  error?: string;
  /** 감싸는 Field div의 기본 mb-4를 덮어쓴다(부모가 flex gap으로 간격을 줄 때). */
  wrapperClassName?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, hint, error, required, id, className, wrapperClassName, ...rest }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const [visible, setVisible] = React.useState(false);

    return (
      <Field label={label} htmlFor={inputId} required={required} hint={hint} hintId={hintId} className={wrapperClassName}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            required={required}
            aria-invalid={!!error || undefined}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            className={cn(
              "h-[40px] w-full rounded-[var(--r-md)] border bg-sf pl-3.5 pr-[44px] text-[16px] text-t outline-none sm:text-[13.5px] [@media(pointer:coarse)]:h-[44px]",
              "placeholder:text-t3 transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              error ? "border-et" : "border-[var(--bd2)] focus:border-[var(--accent)]",
              className
            )}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"}
            aria-pressed={visible}
            className="absolute right-[2px] top-1/2 flex h-[36px] w-[36px] -translate-y-1/2 items-center justify-center rounded-[var(--r-sm)] text-t3 hover:bg-sf2 hover:text-t2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] [@media(pointer:coarse)]:h-[40px] [@media(pointer:coarse)]:w-[40px]"
          >
            {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        </div>
        <FormError id={errorId} message={error} />
      </Field>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
