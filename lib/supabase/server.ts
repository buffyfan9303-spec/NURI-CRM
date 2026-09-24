/**
 * 서버(RSC / route handler / server action)용 Supabase 클라이언트.
 *
 * 쿠키 기반 세션을 읽어 요청자의 신원으로 동작한다. 즉 **RLS가 그대로 적용된다.**
 * 권한 우회가 필요해 보이면 그것은 정책이 잘못된 것이지 service_role 을 쓸 이유가 아니다.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 환경 변수가 없습니다. nuri-crm-next/.env.local 을 확인하세요."
    );
  }
  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        // RSC 렌더 중에는 쿠키를 쓸 수 없다. 세션 갱신은 middleware 가 담당하므로
        // 여기서의 실패는 정상 동작이다(삼키되 무시 이유를 남긴다).
        try {
          store.set({ name, value, ...options });
        } catch {
          /* RSC read-only cookie store — middleware 가 갱신 */
        }
      },
      remove: (name: string, options: CookieOptions) => {
        try {
          store.set({ name, value: "", ...options, maxAge: 0 });
        } catch {
          /* 위와 동일 */
        }
      },
    },
  });
}
