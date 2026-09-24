"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

/** 근태 RPC/제약 오류를 한국어로. */
function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (/already_clocked_in/.test(msg)) return "아직 퇴근하지 않은 근무 기록이 있습니다. 먼저 퇴근 처리하세요.";
  if (/not_clocked_in/.test(msg)) return "열린 근무 기록이 없습니다. 출근 기록부터 확인하세요.";
  if (/attendance_disabled/.test(msg)) return "이 사업장은 근태 기능을 사용하지 않습니다(사업장 설정 우선).";
  if (e.code === "42501" || /forbidden/.test(msg)) return "근태 권한이 없습니다.";
  if (e.code === "23505") return "이미 존재하는 기록입니다.";
  if (/attendance_not_supported/.test(msg)) return "의류공장 업종에는 근태 기능이 없습니다.";
  if (/attendance_span_ck/.test(msg)) return "퇴근 시각은 출근 시각보다 뒤여야 합니다.";
  if (/attendance_correction_ck/.test(msg)) return "보정 기록에는 사유가 필요합니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[attendance pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요.";
}

async function withCap<T>(businessId: string, cap: Cap, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireCap(businessId, cap);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  return fn();
}

function reval(businessId: string) {
  revalidatePath(`/w/${businessId}/staff-shift`);
}

export async function clockInAction(businessId: string, note?: string): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "attendance.self", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("clock_in", { p_business: businessId, p_note: note ?? null });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: (data as { id: string }).id } };
  });
}

export async function clockOutAction(businessId: string, breakMinutes = 0): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "attendance.self", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .rpc("clock_out", { p_business: businessId, p_break_minutes: Math.max(0, Math.trunc(breakMinutes)) });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: (data as { id: string }).id } };
  });
}

/** 누락 보정 — attendance.all 전용. 사유 필수(테이블 CHECK가 재확인). */
export async function correctAttendanceAction(
  businessId: string,
  input: { userId: string; workDate: string; clockIn: string; clockOut: string | null; breakMinutes: number; reason: string }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "attendance.all", async () => {
    const reason = input.reason.trim();
    if (!reason) return { ok: false, message: "보정 사유를 입력하세요." };
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("attendance_records")
      .insert({
        business_id: businessId,
        user_id: input.userId,
        work_date: input.workDate,
        clock_in: input.clockIn,
        clock_out: input.clockOut,
        break_minutes: Math.max(0, Math.trunc(input.breakMinutes)),
        source: "correction",
        correction_reason: reason,
      })
      .select("id")
      .single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 보정 기록 승인 — attendance.all 전용. 승인자 ≠ 대상자(CLICK-PATH-231): 본인 기록은 다른 승인자가 봐야 한다. */
export async function approveAttendanceAction(businessId: string, recordId: string): Promise<ActionResult> {
  return withCap(businessId, "attendance.all", async () => {
    const sb = getServerSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, message: "로그인이 필요합니다." };
    const { data: rec, error: readErr } = await sb
      .schema("crm").from("attendance_records").select("user_id,approved_at").eq("id", recordId).eq("business_id", businessId).maybeSingle();
    if (readErr) return { ok: false, message: pgError(readErr) };
    if (!rec) return { ok: false, message: "근태 기록을 찾을 수 없습니다." };
    if (rec.user_id === uid) return { ok: false, message: "본인 근태 기록은 스스로 승인할 수 없습니다. 다른 관리자에게 요청하세요." };
    if (rec.approved_at) return { ok: false, message: "이미 승인된 기록입니다." };
    const r = await mustAffect(
      sb
        .schema("crm")
        .from("attendance_records")
        .update({ approved_by: uid, approved_at: new Date().toISOString() })
        .eq("id", recordId)
        .eq("business_id", businessId)
        .neq("user_id", uid)
        .is("approved_at", null)
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "승인 권한이 없거나 근태 기록을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
