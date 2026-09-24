import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/layout/Toaster";

export const metadata: Metadata = {
  title: "NURI CRM — 맞춤양복 통합 관리 시스템",
  description: "맞춤 양복 · 공장 · 원단 통합 관리 시스템",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NURI CRM",
  },
  icons: {
    icon: [
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-192.svg" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 단일 meta 하나만 둔다. 앱 테마는 OS 설정이 아니라 localStorage(nuri_dark)로 정해지므로
  // media 분기 두 개를 두면 부트스트랩/applyTheme 이 첫 번째(light)만 갱신해 주소창 색이 어긋났다.
  // 값은 lib/stores/themeStore.ts 의 THEME_COLOR 와 같아야 한다.
  themeColor: "#f7f8fa",
};

/**
 * 테마 계약(§6): 첫 paint 전에 <html data-theme>를 확정해 다크 깜빡임을 0으로 만든다.
 * 저장값 없음/JSON 손상/localStorage 접근 실패는 전부 light로 폴백한다.
 * themeStore(lib/stores/themeStore.ts)가 쓰는 zustand persist 키("nuri_dark")를 그대로 읽는다.
 */
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var raw=window.localStorage.getItem('nuri_dark');var dark=false;if(raw){var parsed=JSON.parse(raw);dark=!!(parsed&&parsed.state&&parsed.state.isDark===true);}document.documentElement.setAttribute('data-theme',dark?'dark':'light');if(dark){var m=document.querySelector('meta[name="theme-color"]');if(m)m.content='#0c0d10';}}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

/**
 * body.dk 는 구 시제품 화면들이 쓰는 레거시 셀렉터다. 예전에는 themeStore 가 **하이드레이션 이후**
 * 붙여서 (1) React 가 className 불일치를 경고했고 (2) 그 화면들만 첫 페인트에 라이트로 번쩍였다.
 * body 가 존재하는 시점(여는 태그 직후)에 같은 키를 읽어 먼저 붙인다.
 * 서버 HTML 에는 이 클래스가 없으므로 <body> 에 suppressHydrationWarning 을 둔다 — 의도된 차이다.
 */
const BODY_THEME_SCRIPT = `(function(){try{var raw=window.localStorage.getItem('nuri_dark');if(raw){var p=JSON.parse(raw);if(p&&p.state&&p.state.isDark===true)document.body.classList.add('dk');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* 부트스트랩 스크립트가 첫 paint 전에 <html data-theme>를 붙이므로
       서버가 보낸 마크업과 클라이언트가 보는 마크업이 의도적으로 달라진다.
       이 한 요소의 속성 차이만 무시한다(자식 요소에는 영향 없음). */
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="bg-bg text-t antialiased" suppressHydrationWarning>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: BODY_THEME_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
