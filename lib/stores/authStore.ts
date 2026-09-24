/**
 * 사용자 인증/역할 스토어.
 *
 * 기존 NURI-CRM.html 의 CURRENT_USER + showPage('login') 흐름을 React/Next 친화적으로 옮긴 것.
 *
 *   - isAuthenticated=false : /login 으로 리다이렉트 (AuthGuard)
 *   - login()  : Zustand persist 가 localStorage 에 저장 → 새로고침 후에도 유지
 *   - logout() : 상태 초기화 후 /login 으로 복귀
 *
 * persist 키 'nuri_auth' — 다른 스토어와 충돌 없음.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CurrentUser, Role } from "@/types/auth";

export const DEFAULT_ADMIN_USER: CurrentUser = {
  role: "admin",
  businessId: null,
  businessName: "관리자",
};

interface AuthState {
  user: CurrentUser;
  isAuthenticated: boolean;
  login: (role: Role, businessId: string | null, businessName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: DEFAULT_ADMIN_USER,
      isAuthenticated: false,

      login: (role, businessId, businessName) =>
        set({
          user: { role, businessId, businessName },
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          user: DEFAULT_ADMIN_USER,
          isAuthenticated: false,
        }),
    }),
    {
      name: "nuri_auth",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

/** 외부(컴포넌트 아닌 모듈)에서 현재 role 을 동기 조회. */
export const getCurrentRole = (): Role => useAuthStore.getState().user.role;
