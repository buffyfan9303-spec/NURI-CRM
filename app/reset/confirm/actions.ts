/**
 * 비밀번호 재설정 확인 화면 전용 서버 액션.
 *
 * lib/auth/actions.ts 는 수정 금지 범위라 이 두 액션은 여기(app/reset/confirm/**)에 둔다.
 * - exchangeRecoveryCode: 메일 링크의 code를 세션으로 교환한다. 쿠키 기록이 필요하므로
 *   반드시 서버 액션(또는 라우트 핸들러)에서 실행해야 한다 — RSC 렌더 중에는 안 된다.
 * - updateUserPassword: 위 세션이 선 상태에서만 의미가 있다.
 */
"use server";

import { getServerSupabase } from "@/lib/supabase/server";

export type ResetConfirmResult =
  | { ok: true }
  | { ok: false; message: string };

export async function exchangeRecoveryCode(code: string): Promise<ResetConfirmResult> {
  if (!code) return { ok: false, message: "재설정 링크가 올바르지 않습니다." };
  const sb = getServerSupabase();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return {
      ok: false,
      message: "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.",
    };
  }
  return { ok: true };
}

export async function updateUserPassword(password: string): Promise<ResetConfirmResult> {
  if (password.length < 8) {
    return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." };
  }
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return { ok: false, message: "세션이 만료되었습니다. 재설정을 다시 요청해 주세요." };
  }
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: `비밀번호를 변경하지 못했습니다: ${error.message}` };
  }
  return { ok: true };
}
