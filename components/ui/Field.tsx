import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** label + hint + 필수표시를 감싸는 필드 레이아웃. Input/PasswordInput이 내부적으로 쓴다. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  hintId,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  hintId?: string;
  children: React.ReactNode;
  /** 기본 mb-4를 덮어쓴다 — 부모가 flex gap으로 간격을 주는 폼(예: 로그인 §5.4 16px)에서 사용. */
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-t2">
        {label}
        {required && (
          <span className="ml-0.5 text-et" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (필수)</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="mt-1.5 text-[12px] leading-snug text-t3">
          {hint}
        </p>
      )}
    </div>
  );
}
