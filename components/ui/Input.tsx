"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Field } from "./Field";
import { FormError } from "./FormError";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** 감싸는 Field div의 기본 mb-4를 덮어쓴다(부모가 flex gap으로 간격을 줄 때). */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, required, id, className, wrapperClassName, ...rest }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <Field label={label} htmlFor={inputId} required={required} hint={hint} hintId={hintId} className={wrapperClassName}>
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className={cn(
            // 40px(PC) / 44px(터치). h-11 은 이 앱에서 38.5px 이라 px 로 못 박는다.
            // 글자 16px(<sm) 은 iOS Safari 가 입력 포커스 때 화면을 자동 확대하는 걸 막는 최소값이다.
            "h-[40px] w-full rounded-[var(--r-md)] border bg-sf px-3.5 text-[16px] text-t outline-none sm:text-[13.5px] [@media(pointer:coarse)]:h-[44px]",
            "placeholder:text-t3 transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            error ? "border-et" : "border-[var(--bd2)] focus:border-[var(--accent)]",
            className
          )}
          {...rest}
        />
        <FormError id={errorId} message={error} />
      </Field>
    );
  }
);
Input.displayName = "Input";
