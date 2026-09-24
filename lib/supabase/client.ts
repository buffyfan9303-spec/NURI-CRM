/**
 * 브라우저용 Supabase 클라이언트.
 *
 * anon 키만 사용한다. 이 클라이언트가 하는 모든 요청은 RLS 아래에서 실행되므로
 * 권한 판정은 서버(정책·RPC)가 하고, 여기서는 "요청을 보낼 뿐"이다.
 *
 * ⚠ service_role 키를 이 경로로 들여오지 말 것 — 브라우저 번들에 들어간다.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 환경 변수가 없습니다. nuri-crm-next/.env.local 에 " +
        "NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요."
    );
  }
  cached = createBrowserClient(url, key);
  return cached;
}
