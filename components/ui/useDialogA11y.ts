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
// 다이얼로그 밖에서 마지막으로 초점을 가졌던 요소. 모달 안 autoFocus(React 커밋 단계)가 효과보다 먼저
// 초점을 가져가므로, 효과 시점의 document.activeElement 는 이미 모달 안 요소일 수 있다(2026-09-28 검토 P1).
let lastFocusOutside: HTMLElement | null = null;
let tracking = false;
function trackFocusOutside() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest('[role="dialog"], [data-vaul-drawer]')) lastFocusOutside = t;
    },
    true
  );
}

// 모듈이 로드될 때(클라이언트) 바로 추적을 시작한다 — 모달이 열릴 때 처음 마운트돼도 직전 초점을 안다.
trackFocusOutside();

export function useDialogA11y(ref: React.RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  // onClose 는 호출부가 매 렌더 새 함수로 넘긴다. 의존성에 넣으면 열린 동안 효과가 다시 돌며
  // trigger 를 다이얼로그 안 요소로 덮어써, 닫을 때 사라진 요소에 포커스를 돌려 초점을 잃는다(2026-09-28 검토 P1).
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  trackFocusOutside();
  React.useEffect(() => {
    if (!open) return;
    const active = document.activeElement as HTMLElement | null;
    const trigger = active && !active.closest('[role="dialog"], [data-vaul-drawer]') ? active : lastFocusOutside;
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
        onCloseRef.current();
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
      if (trigger?.isConnected) trigger.focus();
    };
  }, [ref, open]);
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
