"use client";

import * as React from "react";
import { ArrowRight, Check } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { INDUSTRY_WORKFLOW } from "./industryFlow";
import type { Industry } from "@/lib/industry/config";

export interface IndustryOption {
  key: string;
  name: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  desc: string;
}

export interface IndustryPickerProps {
  industries: IndustryOption[];
  value: string | null;
  onChange: (key: string) => void;
  /** grid(기본) = 2~3열 카드, list = 세로 1열 + 선택 업종의 업무 흐름 미리보기. */
  layout?: "grid" | "list";
}

/**
 * 업종은 "진입 의도"일 뿐이다(계약 §1). 카드/행 라디오 그룹 + 방향키 탐색.
 * 실제 권한은 로그인 후 사업장 소속으로 결정된다는 안내를 항상 함께 보여준다.
 *
 * 인증 화면은 항상 웜톤 배경 위에 놓이므로(§8·§9) 업무 화면 토큰(bg-sf 등)이 아니라
 * auth-* 토큰만 쓴다. 선택 상태는 색만이 아니라 테두리+체크 아이콘으로도 드러난다(§10.2).
 */
export function IndustryPicker({ industries, value, onChange, layout = "grid" }: IndustryPickerProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = (index: number) => {
    const len = industries.length;
    const next = ((index % len) + len) % len;
    refs.current[next]?.focus();
    onChange(industries[next].key);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(industries.length - 1);
        break;
    }
  };

  if (layout === "list") {
    return (
      <div>
        <div role="radiogroup" aria-label="업종 선택" className="flex flex-col gap-1.5">
          {industries.map((ind, i) => {
            const selected = value === ind.key;
            const Icon = ind.icon;
            const flow = INDUSTRY_WORKFLOW[ind.key as Industry];
            return (
              <div key={ind.key}>
                <button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (value === null && i === 0) ? 0 : -1}
                  onClick={() => onChange(ind.key)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-left transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-tx)]",
                    selected
                      ? "border-[var(--auth-tx)] bg-[var(--auth-field-bd)]"
                      : "border-auth-field-bd bg-auth-field hover:bg-[var(--auth-field-bd)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      selected ? "bg-auth-field text-auth-tx" : "bg-[var(--auth-field-bd)] text-auth-tx2"
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-auth-tx">{ind.name}</span>
                    <span className="block truncate text-[11.5px] leading-snug text-auth-tx2">{ind.desc}</span>
                  </span>
                  {selected && <Check size={16} className="shrink-0 text-auth-tx" aria-hidden />}
                </button>
                {selected && flow && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3.5 pb-1 pt-2 text-[11.5px] text-auth-tx2">
                    {flow.map((step, si) => (
                      <React.Fragment key={step}>
                        {si > 0 && <ArrowRight size={11} className="text-auth-tx2" aria-hidden />}
                        <span className="rounded-full bg-[var(--auth-field-bd)] px-2 py-0.5 text-auth-tx">{step}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-snug text-auth-tx2">
          업종 선택은 진입 의도일 뿐이며, 실제 권한은 로그인 후 사업장 소속으로 결정됩니다.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div role="radiogroup" aria-label="업종 선택" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {industries.map((ind, i) => {
          const selected = value === ind.key;
          const Icon = ind.icon;
          return (
            <button
              key={ind.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (value === null && i === 0) ? 0 : -1}
              onClick={() => onChange(ind.key)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={cn(
                "relative flex flex-col items-start gap-1.5 rounded-[16px] border px-3.5 py-3 text-left transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-tx)]",
                selected
                  ? "border-[var(--auth-tx)] bg-[var(--auth-field-bd)]"
                  : "border-auth-field-bd bg-auth-field hover:bg-[var(--auth-field-bd)]"
              )}
            >
              {selected && (
                <Check size={15} className="absolute right-2.5 top-2.5 text-auth-tx" aria-hidden />
              )}
              <Icon size={20} className={selected ? "text-auth-tx" : "text-auth-tx2"} />
              <span className="text-[13px] font-semibold text-auth-tx">{ind.name}</span>
              <span className="text-[11.5px] leading-snug text-auth-tx2">{ind.desc}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-auth-tx2">
        업종 선택은 진입 의도일 뿐이며, 실제 권한은 로그인 후 사업장 소속으로 결정됩니다.
      </p>
    </div>
  );
}
