"use client";

/**
 * 공용 토스트(sonner) — 짧은 성공/안내 알림 전용. 오류는 화면 인라인(Alert/FormError)에 남긴다.
 *   import { toast } from "@/components/ui/toast";  toast.success("저장했습니다.");
 * 색은 CSS 변수 토큰만 쓴다(테마 토글과 같이 바뀐다). 닫기 버튼은 44px.
 * 구 시제품(app/(app))의 zustand Toaster(components/layout/Toaster.tsx)와는 별개다.
 */
import { Toaster as Sonner, toast } from "sonner";
import { useThemeStore } from "@/lib/stores/themeStore";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, Loader2, X } from "@/lib/icons";

export { toast };

const TOKEN_STYLE = {
  "--normal-bg": "var(--sf)",
  "--normal-border": "var(--bd2)",
  "--normal-text": "var(--t)",
  "--success-bg": "var(--okb)",
  "--success-border": "var(--okt)",
  "--success-text": "var(--okt)",
  "--info-bg": "var(--ib)",
  "--info-border": "var(--it)",
  "--info-text": "var(--it)",
  "--warning-bg": "var(--wb)",
  "--warning-border": "var(--wt)",
  "--warning-text": "var(--wt)",
  "--error-bg": "var(--eb)",
  "--error-border": "var(--et)",
  "--error-text": "var(--et)",
  "--border-radius": "var(--r-md)",
  fontFamily: "inherit",
} as React.CSSProperties;

export function AppToaster() {
  const isDark = useThemeStore((s) => s.isDark);
  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      position="bottom-right"
      closeButton
      duration={3200}
      offset={{ bottom: 20, right: 20 }}
      mobileOffset={{ bottom: 16, left: 12, right: 12 }}
      gap={8}
      style={TOKEN_STYLE}
      icons={{
        success: <CheckCircle2 size={17} aria-hidden />,
        info: <Info size={17} aria-hidden />,
        warning: <TriangleAlert size={17} aria-hidden />,
        error: <CircleAlert size={17} aria-hidden />,
        loading: <Loader2 size={17} className="animate-spin" aria-hidden />,
        close: <X size={16} aria-hidden />,
      }}
      toastOptions={{
        classNames: {
          toast: "!pr-[52px] !text-[13.5px] !shadow-modal",
          title: "!font-medium",
          description: "!text-[12.5px] !text-t2",
          // sonner 기본 닫기(20px, 좌상단 걸침)를 오른쪽 세로 중앙 44px 로 옮긴다.
          closeButton:
            "!left-auto !right-1 !top-1/2 !h-[44px] !w-[44px] !-translate-y-1/2 !translate-x-0 !rounded-[var(--r-sm)] !border-0 !bg-transparent !text-t2 hover:!bg-sf2",
        },
      }}
    />
  );
}
