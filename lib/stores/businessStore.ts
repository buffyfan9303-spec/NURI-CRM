/**
 * 거래처(소매점·공장·원단매장) 스토어.
 * 기존 STATE.businesses 에 대응. 관리자 승인 토글이 핵심 액션.
 *
 * persist 키 'nuri_businesses' — 원본의 'nuri_state' 통합 키와 분리.
 * 마이그레이션 시점(첫 실행) 의 localStorage 데이터는 시드로 초기화됨.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Business, BusinessType } from "@/types/business";
import { SEED_BUSINESSES } from "@/lib/data/seed";

interface BusinessState {
  businesses: Business[];
  setApproved: (id: string, approved: boolean) => void;
  add: (b: Business) => void;
  update: (id: string, patch: Partial<Business>) => void;
  remove: (id: string) => void;
  /* selectors */
  getById: (id: string) => Business | undefined;
  listByType: (type: BusinessType, onlyApproved?: boolean) => Business[];
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      businesses: SEED_BUSINESSES,

      setApproved: (id, approved) =>
        set((s) => ({
          businesses: s.businesses.map((b) =>
            b.id === id ? { ...b, approved } : b
          ),
        })),

      add: (b) => set((s) => ({ businesses: [...s.businesses, b] })),

      update: (id, patch) =>
        set((s) => ({
          businesses: s.businesses.map((b) =>
            b.id === id ? { ...b, ...patch } : b
          ),
        })),

      remove: (id) =>
        set((s) => ({
          businesses: s.businesses.filter((b) => b.id !== id),
        })),

      getById: (id) => get().businesses.find((b) => b.id === id),

      listByType: (type, onlyApproved = false) =>
        get().businesses.filter(
          (b) => b.type === type && (!onlyApproved || b.approved)
        ),
    }),
    {
      name: "nuri_businesses",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
