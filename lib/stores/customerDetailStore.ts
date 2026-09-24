/**
 * 고객 디테일 패널 전역 상태.
 * 어디서든 useCustomerDetailStore.getState().open('김민준') 호출로 패널 트리거.
 * 패널 컴포넌트는 (app) 레이아웃에 한 번만 마운트되어 이를 구독한다.
 */
import { create } from "zustand";

interface State {
  openName: string | null;
  open: (name: string) => void;
  close: () => void;
}

export const useCustomerDetailStore = create<State>((set) => ({
  openName: null,
  open: (name) => set({ openName: name }),
  close: () => set({ openName: null }),
}));
