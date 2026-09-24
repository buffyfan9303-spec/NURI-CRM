/**
 * 토스트 스토어.
 * 기존 showToast(title, msg, type) DOM 조작을 React 친화적으로 대체.
 *
 * UI 측은 <Toaster /> (Phase 1.4) 가 toasts 를 구독하고 렌더.
 * 자동 dismiss 는 스토어가 책임 — 컴포넌트는 단순 표시.
 */
import { create } from "zustand";

export type ToastType = "ok" | "info" | "warn";

export interface Toast {
  id: string;
  title: string;
  msg: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  show: (title: string, msg: string, type?: ToastType) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_TIMEOUT_MS = 3800;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (title, msg, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, title, msg, type }] }));
    if (typeof window !== "undefined") {
      window.setTimeout(() => get().dismiss(id), DEFAULT_TIMEOUT_MS);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * 컴포넌트 밖에서 토스트 띄울 때 — 스토어 액션의 함수 참조 export.
 * 기존 코드의 showToast(...) 호출과 동일한 사용감.
 *
 *   import { showToast } from "@/lib/stores/toastStore";
 *   showToast("저장 완료", "주문이 등록되었습니다.", "ok");
 */
export const showToast = (...args: Parameters<ToastState["show"]>) =>
  useToastStore.getState().show(...args);
