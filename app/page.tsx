/**
 * 루트 페이지 — 세션 유무만 보고 리다이렉트한다.
 * 사업장 선택·업종 판정은 /select 와 /w/[businessId] 가 서버에서 다시 한다.
 */
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function IndexPage() {
  const sb = getServerSupabase();
  const { data } = await sb.auth.getUser();
  redirect(data?.user ? "/select" : "/login");
}
