/**
 * 인증 서버 액션.
 *
 * 원칙:
 *  - 실패를 성공처럼 보이게 하지 않는다. 모든 액션은 판별 가능한 결과를 돌려준다.
 *  - Supabase 가 자격증명을 **확정 거부**한 경우 어떤 로컬 우회 경로도 열지 않는다.
 *    (기준본 index.html 의 "이 기기 계정으로 로그인" 폴백은 서버 권한 회수를
 *     무력화하므로 이관하지 않는다 — docs/crm-baseline-inventory.md H-1 참조)
 *  - 사용자에게 보이는 문구는 한국어. 계정 존재 여부를 흘리지 않는다.
 */
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Industry } from "@/lib/industry/config";
import { isIndustry } from "@/lib/industry/config";

export type AuthActionResult =
  | { ok: true }
  | { ok: false; code: AuthErrorCode; message: string; detail?: string };

export type AuthErrorCode =
  | "invalid-credentials"
  | "email-unconfirmed"
  | "rate-limited"
  | "weak-password"
  | "already-registered"
  | "network"
  | "unknown";

/** Supabase 오류 메시지를 사용자 문구로. 계정 존재 여부를 드러내지 않는다. */
function mapAuthError(raw: string): { code: AuthErrorCode; message: string; detail?: string } {
  const m = raw.toLowerCase();
  if (/email not confirmed/.test(m))
    return {
      code: "email-unconfirmed",
      message: "이메일 인증이 완료되지 않았습니다",
      detail: "가입 시 받은 메일의 인증 링크를 먼저 눌러주세요.",
    };
  if (/too many requests|rate limit/.test(m))
    return {
      code: "rate-limited",
      message: "시도가 많아 잠시 제한되었습니다",
      detail: "잠시 후 다시 시도해 주세요.",
    };
  if (/invalid login credentials|invalid grant|user not found|invalid email or password/.test(m))
    return {
      code: "invalid-credentials",
      message: "아이디 또는 비밀번호가 일치하지 않습니다",
      detail: "비밀번호가 기억나지 않으면 비밀번호 재설정을 이용하세요.",
    };
  if (/password should be|weak password/.test(m))
    return {
      code: "weak-password",
      message: "비밀번호가 너무 단순합니다",
      detail: "8자 이상, 숫자와 영문을 섞어 주세요.",
    };
  if (/already registered|user already exists/.test(m))
    return {
      code: "already-registered",
      message: "가입 요청이 접수되었습니다",
      detail: "이미 가입된 이메일이면 비밀번호 재설정을 이용하세요.",
    };
  if (/fetch failed|network|econnrefused|getaddrinfo/.test(m))
    return {
      code: "network",
      message: "서버에 연결하지 못했습니다",
      detail: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
    };
  return { code: "unknown", message: "로그인에 실패했습니다", detail: raw.slice(0, 200) };
}

export async function signIn(email: string, password: string): Promise<AuthActionResult> {
  const id = email.trim().toLowerCase();
  if (!id || !password) {
    return { ok: false, code: "invalid-credentials", message: "이메일과 비밀번호를 입력하세요" };
  }
  const sb = getServerSupabase();
  const { error } = await sb.auth.signInWithPassword({ email: id, password });
  if (error) return { ok: false, ...mapAuthError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signUp(
  email: string,
  password: string,
  name: string
): Promise<AuthActionResult> {
  const id = email.trim().toLowerCase();
  if (!id || password.length < 8) {
    return {
      ok: false,
      code: "weak-password",
      message: "비밀번호는 8자 이상이어야 합니다",
    };
  }
  const sb = getServerSupabase();
  const { error } = await sb.auth.signUp({
    email: id,
    password,
    // 이름은 표시용 메타데이터일 뿐 권한 근거가 아니다(계약 §5-1).
    options: { data: { name: name.trim().slice(0, 60) } },
  });
  if (error) return { ok: false, ...mapAuthError(error.message) };
  return { ok: true };
}

export async function requestPasswordReset(email: string, origin: string): Promise<AuthActionResult> {
  const id = email.trim().toLowerCase();
  const sb = getServerSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(id, {
    redirectTo: `${origin}/reset/confirm`,
  });
  // 계정이 없어도 성공처럼 답한다(계정 열거 방지). 실제 전송 실패만 오류로 본다.
  if (error && !/user not found/i.test(error.message)) {
    return { ok: false, ...mapAuthError(error.message) };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = getServerSupabase();
  await sb.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/* ── 사업장 ─────────────────────────────────────────────── */

export interface MyBusiness {
  id: string;
  name: string;
  industry: Industry;
  role: string;
  status: string;
}

export type MyBusinessesResult =
  | { ok: true; businesses: MyBusiness[]; pending: MyBusiness[] }
  | { ok: false; reason: "unauthenticated" }
  | { ok: false; reason: "error"; message: string };

/**
 * 내 사업장 목록.
 *
 * 활성 소속과 승인 대기를 **분리해서** 돌려준다.
 * 빈 목록(정상)과 조회 실패(오류)를 호출부가 구분할 수 있어야 하므로
 * 빈 배열로 오류를 덮지 않는다(계약 §5-5).
 */
export async function listMyBusinesses(): Promise<MyBusinessesResult> {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { ok: false, reason: "unauthenticated" };

  const { data, error } = await sb
    .schema("crm")
    .from("memberships")
    .select("role,status,business:businesses(id,name,industry,active)")
    .eq("user_id", auth.user.id);

  if (error) return { ok: false, reason: "error", message: error.message };

  const rows = (data ?? []) as unknown as {
    role: string;
    status: string;
    business: { id: string; name: string; industry: string; active: boolean } | null;
  }[];

  const map = (r: (typeof rows)[number]): MyBusiness | null =>
    r.business && r.business.active !== false
      ? {
          id: r.business.id,
          name: r.business.name,
          industry: isIndustry(r.business.industry) ? r.business.industry : "factory",
          role: r.role,
          status: r.status,
        }
      : null;

  const active = rows.filter((r) => r.status === "active").map(map).filter(Boolean) as MyBusiness[];
  const pending = rows.filter((r) => r.status === "pending").map(map).filter(Boolean) as MyBusiness[];

  return { ok: true, businesses: active, pending };
}

export type CreateBusinessResult =
  | { ok: true; businessId: string }
  | { ok: false; message: string };

export async function createBusiness(
  name: string,
  industry: string
): Promise<CreateBusinessResult> {
  const n = name.trim();
  if (!n) return { ok: false, message: "사업장 이름을 입력하세요" };
  if (!isIndustry(industry)) return { ok: false, message: "업종을 선택하세요" };

  const sb = getServerSupabase();
  // businesses 에는 INSERT 정책이 없다. 생성은 이 RPC 경유만 가능하고,
  // RPC 안에서 호출자를 owner/active 로 등록하며 audit 을 남긴다.
  const { data, error } = await sb
    .schema("crm")
    .rpc("create_business", { p_name: n, p_industry: industry });

  if (error) return { ok: false, message: error.message };

  // RPC 시그니처는 `returns crm.businesses` 이므로 **행 전체**가 온다(id 문자열이 아니다).
  // PostgREST 는 단일 행을 객체로, 경우에 따라 1원소 배열로 준다 — 둘 다 받는다.
  const row = (Array.isArray(data) ? data[0] : data) as { id?: unknown } | null;
  const id = typeof row?.id === "string" ? row.id : null;
  if (!id) {
    return {
      ok: false,
      message: "사업장은 만들어졌지만 식별자를 읽지 못했습니다. 목록에서 다시 선택해 주세요.",
    };
  }

  revalidatePath("/select", "page");
  return { ok: true, businessId: id };
}
