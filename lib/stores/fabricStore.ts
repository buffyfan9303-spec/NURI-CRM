/**
 * 원단 재고 스토어.
 * 기존 STATE.fabrics + FAB_SEQ + saveOrder() 내 재고 차감 로직을 모듈화.
 *
 * 핵심 트랜잭션:
 *   consume(id, m) → 사용량 차감 + 상태 자동 갱신 + 이전/이후 상태 반환
 *   주문 등록 hook(Phase 1.7) 에서 호출 후 부족·매진 전이 시 토스트.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Fabric, FabricStatus } from "@/types/fabric";
import { SEED_FABRICS } from "@/lib/data/seed";

function calculateFabricStatus(qty: number): FabricStatus {
  if (qty <= 0) return "매진";
  if (qty < 10) return "부족";
  return "여유";
}

interface FabricState {
  fabrics: Fabric[];
  seq: number;
  editingFabId: string | null;
  setEditing: (id: string | null) => void;
  add: (f: Omit<Fabric, "id" | "status"> & { status?: FabricStatus }) => Fabric;
  update: (id: string, patch: Partial<Fabric>) => void;
  remove: (id: string) => void;
  /** 사용량(m) 만큼 차감 + 상태 자동 산정. 변경 없으면 null. */
  consume: (
    id: string,
    m: number
  ) => { fabric: Fabric; prevStatus: FabricStatus; nextStatus: FabricStatus } | null;
  /* selectors */
  getById: (id: string) => Fabric | undefined;
  listByBusiness: (businessId: string) => Fabric[];
}

export const useFabricStore = create<FabricState>()(
  persist(
    (set, get) => ({
      fabrics: SEED_FABRICS,
      seq: 8,
      editingFabId: null,

      setEditing: (id) => set({ editingFabId: id }),

      add: (input) => {
        const next: Fabric = {
          ...input,
          id: `FAB-${String(get().seq).padStart(3, "0")}`,
          status: input.status ?? calculateFabricStatus(input.qty),
        };
        set((s) => ({ fabrics: [...s.fabrics, next], seq: s.seq + 1 }));
        return next;
      },

      update: (id, patch) =>
        set((s) => ({
          fabrics: s.fabrics.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      remove: (id) =>
        set((s) => ({ fabrics: s.fabrics.filter((f) => f.id !== id) })),

      consume: (id, m) => {
        const fab = get().fabrics.find((f) => f.id === id);
        if (!fab) return null;
        const prevStatus = fab.status;
        const nextQty = Math.max(0, fab.qty - m);
        const nextStatus = calculateFabricStatus(nextQty);
        const updated: Fabric = { ...fab, qty: nextQty, status: nextStatus };
        set((s) => ({
          fabrics: s.fabrics.map((f) => (f.id === id ? updated : f)),
        }));
        return { fabric: updated, prevStatus, nextStatus };
      },

      getById: (id) => get().fabrics.find((f) => f.id === id),

      listByBusiness: (businessId) =>
        get().fabrics.filter((f) => f.businessId === businessId),
    }),
    {
      name: "nuri_fabrics",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
