"use client";

import * as React from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 라이브러리 없는 다이얼로그 접근성 묶음 — Modal(PC)·⌘K 검색창이 같이 쓴다.
 * - 열리면 첫 포커스 가능 요소(없으면 컨테이너)로 초점 이동
 * - Tab/Shift+Tab 이 안에서만 순환
 * - Escape 닫기(캡처 단계라 셸의 Escape 처리보다 먼저)
 * - 닫히면 원래 트리거로 포커스 복귀, body 스크롤 잠금 해제
 */
export function useDialogA11y(ref: React.RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = ref.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
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
      trigger?.focus();
    };
  }, [ref, open, onClose]);
}

/** 휴대폰 판정(<640 = Tailwind sm 미만). null 은 아직 마운트 전(SSR)이다. */
export function usePhone(): boolean | null {
  const [phone, setPhone] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}
