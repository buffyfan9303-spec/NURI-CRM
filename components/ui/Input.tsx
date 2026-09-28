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
            // 상태: hover 경계 진해짐 → focus 경계 강조색 + 3px 연한 링(--ring) → disabled 회색 면 → error 빨간 경계+링.
            // 초점은 outline 대신 링으로 — 사각 outline 이 둥근 입력 모서리와 어긋나던 것을 없앴다(Cal.com 방식).
            "placeholder:text-t3 transition-[border-color,box-shadow,background-color] duration-1 ease-out",
            "disabled:cursor-not-allowed disabled:bg-sf2 disabled:text-t3 read-only:bg-sf2",
            error
              ? "border-et focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--et)_28%,transparent)]"
              : "border-[var(--bd2)] hover:border-t2 focus:border-[var(--accent)] focus:shadow-ring",
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
