"use client";

/**
 * USB/블루투스 "키보드형" 바코드 스캐너 지원. 이런 스캐너는 리더가 아니라 키보드로 인식되어
 * 코드를 아주 빠른 연속 keydown + Enter로 흘려보낸다.
 *
 * 안전장치(우선순위 순):
 *  1) 입력 필드(input/textarea/select/contentEditable)에 포커스가 있으면 절대 가로채지 않는다
 *     — 수동 입력창에 포커스를 준 상태라면 이 훅은 완전히 비활성이다.
 *  2) 그 상태에서도 "사람이 천천히 타이핑" 패턴이면(키 간격이 크면) 버퍼를 리셋한다 —
 *     일반 키보드 입력을 코드로 오인하지 않기 위함.
 */
import { useEffect, useRef } from "react";

export interface UseKeyboardWedgeOptions {
  /** 이 시간(ms)보다 키 간격이 크면 사람이 타이핑 중이라고 보고 버퍼를 리셋한다. */
  maxIntervalMs?: number;
  /** 이보다 짧은 버퍼는 우연한 키 입력으로 보고 무시한다. */
  minLength?: number;
  enabled?: boolean;
}

function isEditableTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useKeyboardWedge(onScan: (code: string) => void, opts?: UseKeyboardWedgeOptions): void {
  const maxIntervalMs = opts?.maxIntervalMs ?? 40;
  const minLength = opts?.minLength ?? 3;
  const enabled = opts?.enabled ?? true;

  const bufferRef = useRef("");
  const lastTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(document.activeElement)) return; // 일반 폼 입력은 절대 가로채지 않는다
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const gap = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length !== 1) return; // Shift/Tab 등 특수키는 버퍼에 넣지 않는다

      if (gap > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = ""; // 간격이 크면 사람이 타이핑 중인 것으로 보고 리셋
      }
      bufferRef.current += e.key;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, maxIntervalMs, minLength]);
}
