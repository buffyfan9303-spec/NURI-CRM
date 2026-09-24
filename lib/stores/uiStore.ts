/**
 * 가벼운 UI 상태 (필터·페이지 간 보존).
 * 페이지를 떠나도 살아 있는 작은 클라이언트 상태.
 */
import { create } from "zustand";

export type DeliveryFilter = "all" | "planned" | "today" | "overdue" | "done";

interface UIState {
  deliveryFilter: DeliveryFilter;
  setDeliveryFilter: (f: DeliveryFilter) => void;
  /** 모바일에서 사이드바 드로어 표시 여부 (md 이상에서는 무시됨) */
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  deliveryFilter: "all",
  setDeliveryFilter: (f) => set({ deliveryFilter: f }),
  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
