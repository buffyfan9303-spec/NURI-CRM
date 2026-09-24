/**
 * 시스템 설정 스토어 (관리자 — 기준 가격).
 * 기존 SYS_CONFIG + applySysConfig() 의 BASE_PRICE 매핑 로직 통합.
 *
 * getBasePriceTable() 은 calculateOrderPrice(util) 에 주입되어
 * 관리자 설정 변경 즉시 가격 산출에 반영된다.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  SYS_CONFIG_DEFAULTS,
  BASE_PRICE_DEFAULTS,
  type SysConfig,
} from "@/lib/constants/basePrice";

interface ConfigState {
  config: SysConfig;
  update: (patch: Partial<SysConfig>) => void;
  reset: () => void;
  /** SysConfig + BASE_PRICE_DEFAULTS 를 합쳐 calculateOrderPrice 에 넘길 매핑 생성. */
  getBasePriceTable: () => Record<string, number>;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      config: SYS_CONFIG_DEFAULTS,

      update: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),

      reset: () => set({ config: SYS_CONFIG_DEFAULTS }),

      getBasePriceTable: () => {
        const c = get().config;
        return {
          ...BASE_PRICE_DEFAULTS,
          "싱글 수트": c.base_single_suit,
          "수트": c.base_single_suit,
          "더블 수트": c.base_double_suit,
          "쓰리피스": c.base_three_piece,
          "스리피스": c.base_three_piece,
          "재킷": c.base_jacket,
          "재켓": c.base_jacket,
          "자켓": c.base_jacket,
          "팬츠": c.base_pants,
          "바지": c.base_pants,
          "트라우저": c.base_pants,
          "코트": c.base_coat,
          "오버코트": c.base_coat,
          "조끼": c.base_vest,
          "베스트": c.base_vest,
        };
      },
    }),
    {
      name: "nuri_sys_config",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
