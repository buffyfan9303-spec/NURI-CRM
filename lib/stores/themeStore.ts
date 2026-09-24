/**
 * 다크모드 스토어.
 * 기존 isDk 변수 + localStorage('nuri_dark') 로직을 1:1 대응.
 *
 * body.dk 클래스 토글까지 스토어 액션 내부에서 처리하므로
 * 컴포넌트는 useThemeStore().toggle() 한 줄만 호출하면 됨.
 *
 * SSR 고려:
 *   - persist 의 storage 는 createJSONStorage 로 lazy 평가 → SSR 안전.
 *   - 첫 렌더 시 라이트로 시작 후, 클라이언트 hydrate 직후 dk 클래스 적용.
 *     플래시가 신경 쓰이면 layout 의 <body className> 에 미리 dk 를 인라인으로 박는 방법도 가능.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
  setDark: (v: boolean) => void;
}

/**
 * 테마를 DOM에 반영한다 (브라우저 한정).
 *
 * 테마 신호가 두 군데 있다:
 *   1. `<html data-theme>` — app/layout.tsx 의 blocking 부트스트랩이 첫 paint 전에 확정
 *   2. `body.dk`           — 기존 컴포넌트들이 쓰던 레거시 셀렉터
 * globals.css 와 tailwind.config.ts 가 **둘 다** 매칭하므로, 런타임 토글이 한쪽만
 * 갱신하면 두 신호가 어긋난다(계약 §6: 초기 HTML·앱 상태·CSS·color-scheme 이 일치해야 함).
 * 그래서 모든 토글이 반드시 이 함수 하나를 지나가게 하고, 여기서 둘을 같이 쓴다.
 */
export function applyTheme(isDark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.body.classList.toggle("dk", isDark);

  // layout.tsx 의 themeColor 는 prefers-color-scheme 기반이라 **명시적 토글을 따라오지 못한다**
  // (시스템이 라이트인데 사용자가 다크를 고르면 주소창 색만 라이트로 남는다).
  // 계약 §6이 요구하는 "테마 신호 일치"를 위해 여기서 직접 덮어쓴다.
  // 값은 app/layout.tsx 의 viewport.themeColor 와 같아야 한다.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = isDark ? THEME_COLOR.dark : THEME_COLOR.light;
}

/** app/layout.tsx 의 viewport.themeColor 와 동일한 값이어야 한다. */
const THEME_COLOR = { light: "#f7f8fa", dark: "#0c0d10" } as const;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,
      toggle: () =>
        set((s) => {
          const next = !s.isDark;
          applyTheme(next);
          return { isDark: next };
        }),
      setDark: (v) => {
        applyTheme(v);
        set({ isDark: v });
      },
    }),
    {
      name: "nuri_dark",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        /* rehydrate 시 클래스 즉시 반영 */
        if (state) applyTheme(state.isDark);
      },
    }
  )
);
