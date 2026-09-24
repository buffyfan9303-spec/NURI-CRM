/**
 * 테마 DOM 동기화 provider.
 *
 * 하는 일은 하나뿐이다: 저장된 테마가 복원되면 DOM(`data-theme` / `body.dk` / `theme-color`)에 반영.
 *
 * ⚠ 여기서 **스토어에 쓰지 말 것.**
 * Zustand persist 의 복원은 첫 클라이언트 렌더와 같은 시점이 아니다. 그래서 첫 렌더의
 * `isDark`는 저장값이 아니라 초기값(false)일 수 있다. 이때 `setDark(false)` 같은 쓰기를 하면
 * persist 가 그 false 를 localStorage 에 기록해 **사용자가 저장해 둔 dark 를 지워버린다**
 * (실제로 그렇게 회귀가 났었다: 다크로 들어가도 0.3~0.9초 뒤 라이트로 되돌아감).
 *
 * 복원 시점은 추측하지 않고 persist 가 주는 신호(`hasHydrated`/`onFinishHydration`)를 쓴다.
 * 평상시 토글은 스토어 액션이 이미 `applyTheme` 을 부르므로 여기서 다시 하지 않는다.
 */
"use client";

import { useEffect } from "react";
import { useThemeStore, applyTheme } from "@/lib/stores/themeStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const persist = useThemeStore.persist;
    // 이미 복원이 끝났으면 즉시 반영. (부트스트랩 스크립트가 세운 값과 같으면 무해한 재설정)
    if (persist.hasHydrated()) {
      applyTheme(useThemeStore.getState().isDark);
      return;
    }
    // 아직이면 복원이 끝나는 순간에만 반영한다.
    return persist.onFinishHydration((state) => applyTheme(state.isDark));
  }, []);

  return <>{children}</>;
}
