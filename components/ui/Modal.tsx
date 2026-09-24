"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * 라이브러리 없이 구현한 모달.
 * - 포커스 트랩(Tab/Shift+Tab이 안을 순환)
 * - Escape 닫기
 * - 닫힐 때 원래 트리거로 포커스 복귀
 * - 배경 스크롤 잠금
 * - role="dialog" + aria-modal + aria-labelledby
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const node = dialogRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusables[0] ?? node).focus();
    };
    focusFirst();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  // 휴대폰(<640)은 하단 시트 — 화면 폭 전체, 위 모서리만 둥글게, 아래 safe-area 확보(Stripe FocusView 패턴).
  // 태블릿/PC 는 가운데 다이얼로그. 시트 진입 모션은 사용자 동작의 응답이라 짧게(200ms) 둔다.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/45"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex w-full max-w-[480px] animate-sheet-up flex-col border border-[var(--bd)] bg-sf shadow-modal",
          "max-h-[92dvh] rounded-t-[var(--r-xl)] pb-[env(safe-area-inset-bottom)]",
          "sm:max-h-[85vh] sm:rounded-[var(--r-xl)] sm:pb-0",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] py-3 pl-5 pr-3">
          <h2 id={titleId} className="min-w-0 truncate text-[15px] font-semibold text-t">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-t3 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className="scrollable min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--bd)] px-5 py-3 [&>button]:flex-1 sm:[&>button]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
