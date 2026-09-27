/**
 * 요청 단위 getUser() 캐시.
 *
 * getUser() 는 매번 Supabase auth 서버로 왕복한다(로컬 검증 아님). 한 요청 안에서
 * layout(checkAccess) · listMyBusinesses · page · 서버 액션이 각자 부르면 3~5회 왕복이 생겼다
 * (2026-09-28 실측: 문서 1회 = auth/user 5회). React.cache 는 요청별로만 캐시하므로
 * "권한은 항상 다시 읽는다" 원칙과 충돌하지 않는다 — 다음 요청부터는 새로 묻는다.
 */
import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";

export const getAuthUser = cache(async () => {
  const sb = getServerSupabase();
  const { data, error } = await sb.auth.getUser();
  return { sb, user: data?.user ?? null, error };
});
