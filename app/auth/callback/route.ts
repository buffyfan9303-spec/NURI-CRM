/**
 * 이메일 인증(가입 확인) 콜백. 라우트 핸들러라 쿠키 기록이 가능하다.
 * code 를 세션으로 교환한 뒤 /select 로 보낸다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = req.nextUrl.origin;

  if (code) {
    const sb = getServerSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?err=confirm`);
    }
  }
  return NextResponse.redirect(`${origin}/select`);
}
