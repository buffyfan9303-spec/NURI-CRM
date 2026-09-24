/**
 * 직원·권한 관리 서버 액션.
 *
 * 원칙(계약 §5): 모든 동작 전에 requireCap(businessId, 'staff.manage')을 다시 부른다.
 * 클라이언트가 이미 화면에서 권한을 확인했더라도 서버는 믿지 않는다.
 * DB 트리거(마지막 owner 보호·자기 권한 상승 금지)가 던지는 42501 오류는
 * 사용자에게 한국어로 정확히 번역해 돌려준다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";

export type StaffActionResult = { ok: true } | { ok: false; message: string };

export interface RoleTemplateRow {
  role: string;
  caps: string[];
}

export interface MembershipRow {
  id: string;
  userId: string;
  /** crm.business_members(0016): auth 메타 이름 → 이메일 앞부분 → id 앞 8자 순 폴백. */
  displayName: string;
  /** staff.manage 보유자에게만 채워진다(개인정보). listStaff 는 staff.manage 전용이라 항상 채워진다. */
  email: string | null;
  role: string;
  status: "active" | "pending" | "revoked";
  permGrant: string[];
  permRevoke: string[];
  createdAt: string;
}

export type StaffListResult =
  | { ok: true; memberships: MembershipRow[]; roleTemplates: RoleTemplateRow[] }
  | { ok: false; message: string };

/** DB 트리거/RLS 오류를 한국어 문구로. 원인을 숨기지 않는다. */
function mapMembershipError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (e.code === "42501") {
    if (/last_owner_protected/.test(msg)) {
      return "마지막 활성 대표(owner)는 강등·해지·삭제할 수 없습니다.";
    }
    if (/self_escalation_blocked/.test(msg)) {
      return "본인의 역할·추가권한·활성화는 스스로 변경할 수 없습니다.";
    }
    if (/owner_only/.test(msg)) {
      return "owner 역할의 부여·강등과 owner 소속 변경은 owner 만 할 수 있습니다.";
    }
    return "권한이 없어 처리하지 못했습니다.";
  }
  if (/target_not_member/.test(msg)) return "대상 소속을 찾을 수 없습니다.";
  if (/invalid_role/.test(msg)) return "알 수 없는 역할입니다.";
  if (/invalid_cap/.test(msg)) return "알 수 없는 권한입니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[staff pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

/** RLS가 막았거나 대상이 없으면 PostgREST는 오류 없이 0행을 돌려준다 — 성공으로 보고하지 않는다. */
const NO_ROWS = "권한이 없거나 대상 소속을 찾을 수 없습니다.";

export async function listStaff(businessId: string): Promise<StaffListResult> {
  const access = await requireStaffManageOrNull(businessId);
  if (!access.ok) return access;

  const sb = getServerSupabase();
  const [memRes, tplRes, nameRes] = await Promise.all([
    sb
      .schema("crm")
      .from("memberships")
      .select("id,user_id,role,status,perm_grant,perm_revoke,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    sb.schema("crm").from("role_template").select("role,caps"),
    // 표시이름·이메일(CLICK-PATH-210). SECURITY DEFINER RPC 가 cap 에 따라 email 을 NULL 로 마스킹한다.
    sb.schema("crm").rpc("business_members", { p_business: businessId }),
  ]);

  if (memRes.error) return { ok: false, message: memRes.error.message };
  if (tplRes.error) return { ok: false, message: tplRes.error.message };
  if (nameRes.error) return { ok: false, message: nameRes.error.message };

  const identity = new Map(
    ((nameRes.data ?? []) as { user_id: string; display_name: string; email: string | null }[]).map((r) => [r.user_id, r])
  );

  const memberships: MembershipRow[] = (memRes.data ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    displayName: identity.get(r.user_id as string)?.display_name ?? (r.user_id as string).slice(0, 8),
    email: identity.get(r.user_id as string)?.email ?? null,
    role: r.role as string,
    status: r.status as MembershipRow["status"],
    permGrant: (r.perm_grant as string[]) ?? [],
    permRevoke: (r.perm_revoke as string[]) ?? [],
    createdAt: r.created_at as string,
  }));

  const roleTemplates: RoleTemplateRow[] = (tplRes.data ?? []).map((r) => ({
    role: r.role as string,
    caps: (r.caps as string[]) ?? [],
  }));

  return { ok: true, memberships, roleTemplates };
}

async function requireStaffManageOrNull(
  businessId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireCap(businessId, "staff.manage");
    return { ok: true };
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
}

async function withStaffManage(
  businessId: string,
  fn: () => Promise<StaffActionResult>
): Promise<StaffActionResult> {
  try {
    await requireCap(businessId, "staff.manage");
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  const result = await fn();
  revalidatePath(`/w/${businessId}/staff`);
  return result;
}

/**
 * 역할 변경 — crm.update_member_role(0022) 한 트랜잭션. 기본은 개별 grant/revoke 를 함께 초기화한다
 * (CLICK-PATH-207: 강등 뒤 이전 역할의 추가권한이 남는 것을 막는다). 유지하려면 resetOverrides:false.
 */
export async function updateMemberRole(
  businessId: string,
  membershipId: string,
  role: string,
  opts: { resetOverrides?: boolean } = {}
): Promise<StaffActionResult> {
  return withStaffManage(businessId, async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("update_member_role", {
      p_business: businessId,
      p_membership: membershipId,
      p_role: role,
      p_reset_overrides: opts.resetOverrides ?? true,
    });
    if (error) return { ok: false, message: mapMembershipError(error) };
    return { ok: true };
  });
}

export async function approveMember(businessId: string, membershipId: string): Promise<StaffActionResult> {
  return withStaffManage(businessId, async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb.schema("crm").from("memberships").update({ status: "active" }).eq("id", membershipId).eq("business_id", businessId)
    );
    if (!r.ok) return { ok: false, message: r.error ? mapMembershipError(r.error) : NO_ROWS };
    return { ok: true };
  });
}

export async function revokeMember(businessId: string, membershipId: string): Promise<StaffActionResult> {
  return withStaffManage(businessId, async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb.schema("crm").from("memberships").update({ status: "revoked" }).eq("id", membershipId).eq("business_id", businessId)
    );
    if (!r.ok) return { ok: false, message: r.error ? mapMembershipError(r.error) : NO_ROWS };
    return { ok: true };
  });
}

/**
 * 개별 capability grant/revoke 토글 — crm.set_member_cap(0022) 이 행을 잠그고 배열을 원자적으로 계산한다
 * (CLICK-PATH-235: 읽고-계산하고-쓰는 사이의 lost update 제거).
 * 최종 = (역할 템플릿 ∪ perm_grant) − perm_revoke, revoke가 항상 이긴다(계약 §2).
 */
export async function setMemberCap(
  businessId: string,
  membershipId: string,
  cap: Cap,
  enabled: boolean
): Promise<StaffActionResult> {
  return withStaffManage(businessId, async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("set_member_cap", {
      p_business: businessId,
      p_membership: membershipId,
      p_cap: cap,
      p_enabled: enabled,
    });
    if (error) return { ok: false, message: mapMembershipError(error) };
    return { ok: true };
  });
}
