/// <reference lib="webworker" />
// PWA 서비스 워커(Serwist). 설치형 앱·오프라인 안내만 담당한다.
// 업무 화면(HTML·RSC·서버 액션·Supabase)은 로그인·권한·금액이 섞여 있어 절대 캐시하지 않는다 —
// 오래된 권한의 화면이 보이거나 다른 사람 데이터가 남는 사고를 막기 위해 정적 자산만 캐시한다.
import { Serwist, CacheFirst, NetworkOnly, ExpirationPlugin } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // next build 가 만든 정적 청크 목록(해시 포함)만 미리 받아 둔다.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith("/_next/static/") || /\.(png|svg|jpg|jpeg|webp|woff2?)$/.test(url.pathname)),
      handler: new CacheFirst({ cacheName: "static", plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 })] }),
    },
    { matcher: () => true, handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: "/offline.html", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
