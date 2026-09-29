/**
 * 5단계 할 일 카드(§4.1) — 서버 컴포넌트 가능. `<ol>` + 현재 단계 `aria-current="step"`.
 * 행: 번호/체크 · 제목 · 남은 건수 또는 막힌 이유(<p>, 초점 낭비 금지) · 현재 단계만 큰 계속하기(Button lg 크기 링크).
 * 폰(<sm)은 행이 세로로 쌓이고 CTA 가 전폭.
 */
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Lock } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

export type StepState = "done" | "current" | "blocked" | "todo";
export interface Step {
  title: string;
  state: StepState;
  /** 남은 건수·완료 요약·막힌 이유 한 문장. */
  detail: string;
  /** 현재 단계 CTA. 문구는 결과를 밝힌다("관리비 계산하기"). */
  cta?: { label: string; href: string };
  /** 완료·대기 단계의 작은 이동 링크(선택). */
  href?: string;
}

/** Button lg(48px) 모양의 링크 — 버튼 안에 a 를 넣지 않기 위해 따로 둔다. */
export function LinkButton({ href, children, variant = "primary", size = "lg", className }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; size?: "md" | "lg"; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-md)] font-medium transition-[background-color,border-color,box-shadow,transform] duration-1 ease-out active:scale-[.98]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        size === "lg" ? "min-h-[48px] px-5 text-[length:var(--fs-card)]" : "min-h-[44px] px-4 text-[length:var(--fs-body)]",
        variant === "primary"
          ? "border border-transparent bg-[var(--accent-strong)] text-[var(--accent-contrast)] shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_1px_2px_rgba(16,24,40,.12)] hover:bg-[var(--accent-hover)]"
          : "border border-[var(--bd-strong)] bg-sf text-t shadow-card hover:bg-sf2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function StepCard({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("divide-y divide-[var(--bd)]", className)}>
      {steps.map((s, i) => {
        const current = s.state === "current";
        const done = s.state === "done";
        const blocked = s.state === "blocked";
        return (
          <li
            key={s.title}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5",
              current && "border-l-[3px] border-l-[var(--accent)] bg-sf3/60",
              blocked && "text-t3",
            )}
          >
            <span
              className={cn(
                "flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-[length:var(--fs-body)] font-semibold tabular-nums",
                done ? "bg-okb text-okt" : current ? "bg-[var(--accent-strong)] text-[var(--accent-contrast)]" : "border border-[var(--bd-strong)] bg-sf text-t2",
              )}
              aria-hidden
            >
              {done ? <CheckCircle2 size={20} /> : blocked ? <Lock size={16} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className={cn("break-keep text-[length:var(--fs-card)] font-semibold leading-snug", blocked ? "text-t2" : "text-t")}>
                <span className="sr-only">{i + 1}단계 {done ? "완료" : current ? "현재" : blocked ? "대기" : ""}: </span>
                {s.title}
              </h3>
              <p className={cn("mt-0.5 break-keep text-[length:var(--fs-body)]", current ? "text-t2" : "text-t3")}>{s.detail}</p>
            </div>
            {current && s.cta && (
              <LinkButton href={s.cta.href} className="w-full sm:w-auto">
                {s.cta.label}
                <ChevronRight size={18} aria-hidden />
              </LinkButton>
            )}
            {!current && s.href && !blocked && (
              <Link href={s.href} className="inline-flex min-h-[44px] items-center gap-0.5 self-start rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] font-medium text-[var(--accent-ink)] hover:bg-sf2 sm:self-auto">
                열기 <ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
