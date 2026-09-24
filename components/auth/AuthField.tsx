import * as React from "react";
import { CircleAlert } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

/**
 * 인증 화면 전용 필드 래퍼(§10.1). ui/Field와 같은 계약(라벨 항상 표시·오류 텍스트+아이콘)이지만
 * 색은 auth-tx/auth-tx2 토큰을 쓴다 — ui/Field는 밝은 카드용이라 웜톤 배경 위에서 대비가 안 맞는다.
 */
export function AuthField({
  label,
  htmlFor,
  required,
  hint,
  hintId,
  error,
  errorId,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3.5", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-auth-tx2">
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--auth-accent)]" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (필수)</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="mt-1.5 text-[11.5px] leading-snug text-auth-tx2">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[var(--auth-error)]">
          <CircleAlert size={13} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
