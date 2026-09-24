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
  floating = false,
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
  /** true 면 라벨을 그리지 않는다 — 입력 안의 떠오르는 라벨(FloatLabel)이 대신한다. */
  floating?: boolean;
}) {
  return (
    <div className={cn("mb-3.5", className)}>
      {!floating && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-auth-tx2">
          {label}
          {required && (
            <span className="ml-0.5 text-[var(--auth-accent)]" aria-hidden>
              *
            </span>
          )}
          {required && <span className="sr-only"> (필수)</span>}
        </label>
      )}
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

/**
 * 넷플릭스형 떠오르는 라벨. 반드시 입력(`peer`, placeholder=" ") **뒤에** 둔다 —
 * 비어 있으면 입력 가운데, 값이 있거나 초점·자동완성이면 위로 작게 올라간다.
 */
export function FloatLabel({
  htmlFor,
  label,
  required,
  inset = 14,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  /** 왼쪽 여백(px). 좌측 아이콘이 있으면 42. */
  inset?: number;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ left: inset }}
      className={cn(
        "pointer-events-none absolute top-[8px] translate-y-0 text-[11.5px] font-medium leading-none text-auth-tx2 transition-all duration-150",
        "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[15px] peer-placeholder-shown:font-normal",
        "peer-focus:top-[8px] peer-focus:translate-y-0 peer-focus:text-[11.5px] peer-focus:font-medium",
        "peer-autofill:top-[8px] peer-autofill:translate-y-0 peer-autofill:text-[11.5px]"
      )}
    >
      {label}
      {required && (
        <span className="ml-0.5 text-[var(--auth-accent)]" aria-hidden>
          *
        </span>
      )}
      {required && <span className="sr-only"> (필수)</span>}
    </label>
  );
}
