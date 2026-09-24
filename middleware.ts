/**
 * 세션 갱신 미들웨어.
 *
 * RSC 는 쿠키를 쓸 수 없으므로 Supabase 세션 토큰 갱신은 여기서만 일어난다.
 * 여기서 **권한을 판정하지 않는다** — 권한은 각 화면/액션이 checkAccess() 로 서버에서 다시 본다.
 * 미들웨어의 역할은 딱 두 가지다:
 *   1. 만료 임박 토큰 갱신(쿠키 재기록)
 *   2. 미인증 사용자가 작업공간 URL 에 직접 들어왔을 때 로그인으로 보내기(편의)
 * 2번은 UX일 뿐 보안 경계가 아니다. 미들웨어를 우회해도 서버가 다시 막는다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/** 인증 없이 열려야 하는 경로. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/reset",
  "/auth",
  // 개발·검증용 페이지. 사업장 데이터를 전혀 읽지 않으므로 인증 없이 연다.
  "/ui-preview",
  "/scan-selftest",
];

/**
 * 결함 CLICK-PATH-101: app/(app)/* 는 localStorage 목 인증을 쓰던 레거시 화면이라
 * 실제 로그인 세션으로는 절대 열리지 않고 /login↔/select 를 왕복시킨다. 코드는 보존하되
 * (다른 에이전트/향후 재사용 대비) 라우트는 여기서 항상 /select 로 돌려보낸다.
 * 이 경로들은 `/w/{businessId}/...`와 겹치지 않는 루트 경로라 prefix 충돌이 없다.
 */
const LEGACY_APP_PREFIXES = [
  "/dashboard",
  "/customers",
  "/orders",
  "/production",
  "/mtm",
  "/styles",
  "/factory",
  "/fab-vendors",
  "/fabrics",
  "/accounting",
  "/delivery",
  "/admin",
];

function isLegacyApp(pathname: string) {
  return LEGACY_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  if (isLegacyApp(req.nextUrl.pathname)) {
    const to = req.nextUrl.clone();
    to.pathname = "/select";
    to.search = "";
    return NextResponse.redirect(to);
  }

  let res = NextResponse.next({ request: { headers: req.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // 환경변수가 없으면 인증 자체가 불가능하다. 조용히 통과시키면 "로그인 없이 들어가진"
  // 것처럼 보이므로, 공개 경로가 아니면 로그인으로 보내 원인을 드러낸다.
  if (!url || !key) {
    if (isPublic(req.nextUrl.pathname)) return res;
    return redirectToLogin(req, "config");
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      get: (name: string) => req.cookies.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        req.cookies.set({ name, value, ...options });
        res = NextResponse.next({ request: { headers: req.headers } });
        res.cookies.set({ name, value, ...options });
      },
      remove: (name: string, options: CookieOptions) => {
        req.cookies.set({ name, value: "", ...options });
        res = NextResponse.next({ request: { headers: req.headers } });
        res.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });

  // getUser() 는 토큰을 서버에서 검증하고 필요하면 갱신한다. getSession() 과 달리
  // 쿠키에 든 값을 그대로 믿지 않으므로 여기서는 반드시 getUser() 를 쓴다.
  const { data } = await supabase.auth.getUser();

  if (!data?.user && !isPublic(req.nextUrl.pathname)) {
    return redirectToLogin(req, "signin");
  }
  return res;
}

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function redirectToLogin(req: NextRequest, reason: string) {
  const to = req.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  // 로그인 후 원래 가려던 곳으로 돌려보내기 위해 경로만 보존한다(쿼리는 버린다).
  to.searchParams.set("from", req.nextUrl.pathname);
  if (reason === "config") to.searchParams.set("err", "config");
  return NextResponse.redirect(to);
}

export const config = {
  // 정적 자산과 이미지 최적화는 제외. 그 외 모든 경로에서 세션을 갱신한다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*\\.svg|manifest.webmanifest).*)"],
};
