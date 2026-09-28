"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { useDialogA11y, usePhone } from "./useDialogA11y";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * 모달.
 * - 휴대폰(<640): vaul 하단 시트 — 손가락으로 끌어 내려 닫는다. 포커스 가둠·Escape·트리거 복귀·스크롤 잠금은
 *   vaul(Radix Dialog)이 맡는다. reduced-motion 은 globals.css 전역 규칙이 전환 시간을 0 으로 만든다.
 * - 태블릿/PC: 가운데 다이얼로그(라이브러리 없음, useDialogA11y).
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const phone = usePhone();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const isDesktopDialog = open && phone === false;
  useDialogA11y(dialogRef, isDesktopDialog, onClose);
  // 휴대폰 시트는 닫히면 바로 언마운트돼 Radix 의 포커스 복귀가 돌지 않는다 — 연 버튼으로 직접 돌려준다.
  React.useEffect(() => {
    if (!open || phone !== true) return;
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
      requestAnimationFrame(() => {
        if (trigger && trigger.isConnected) trigger.focus();
      });
    };
  }, [open, phone]);

  if (phone === null || !open) return null;

  if (phone) {
    return (
      <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Drawer.Content
            aria-describedby={undefined}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[var(--r-xl)] border border-[var(--bd)] bg-sf pb-[env(safe-area-inset-bottom)] shadow-modal outline-none",
              className
            )}
          >
            {/* 끌기 손잡이 — 시트를 끌어 닫을 수 있다는 시각 신호(44px 영역). */}
            <div className="flex h-[20px] shrink-0 items-center justify-center" aria-hidden>
              <span className="h-[5px] w-[40px] rounded-full bg-[var(--bd2)]" />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] pb-2.5 pl-5 pr-3">
              <Drawer.Title className="min-w-0 truncate text-[15px] font-semibold text-t">{title}</Drawer.Title>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-t3 hover:bg-sf2 hover:text-t"
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="scrollable min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--bd)] px-5 py-3 [&>button]:flex-1">
                {footer}
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 막: 살짝 흐림(2px)으로 뒤 화면과 분리 — 유리 효과가 아니라 초점 분리용이다. */}
      <div className="absolute inset-0 animate-fade-in bg-black/45 backdrop-blur-[2px]" aria-hidden onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full max-w-[480px] animate-sheet-up flex-col rounded-[var(--r-xl)] border border-[var(--bd)] bg-sf shadow-modal",
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
        <div className="scrollable min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--bd)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
