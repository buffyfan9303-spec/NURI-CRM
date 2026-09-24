/**
 * 근태 조회 — 미용실·학원 공용 crm.attendance_records (0011_salon.sql).
 *
 * ★ 이 테이블은 "예약 가능시간"(salon_staff_schedules 등, 계획)과 완전히 다르다.
 *   여기는 "실제로 언제 일했는가"(사실)만 다룬다.
 * ★ 공장 사업장에는 이 화면 자체를 노출하지 않는다(사용자 필수 요구) — 호출부(페이지)가
 *   access.industry === 'factory' 를 확인해 막는다. 이 파일은 그 판단을 하지 않는다
 *   (industry는 권한 근거가 아니다 — 계약 §1).
 */
import { getServerSupabase } from "@/lib/supabase/server";

export interface AttendanceRecord {
  id: string;
  userId: string;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  source: "self" | "admin" | "correction";
  correctionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string | null;
}

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

function mapRow(r: Record<string, unknown>): AttendanceRecord {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    workDate: r.work_date as string,
    clockIn: r.clock_in as string,
    clockOut: (r.clock_out as string) ?? null,
    breakMinutes: (r.break_minutes as number) ?? 0,
    source: r.source as AttendanceRecord["source"],
    correctionReason: (r.correction_reason as string) ?? null,
    approvedBy: (r.approved_by as string) ?? null,
    approvedAt: (r.approved_at as string) ?? null,
    note: (r.note as string) ?? null,
  };
}

/** 본인 근태만(attendance.self). RLS가 어차피 강제하지만 조회 범위를 명시적으로 좁힌다. */
export async function listMyAttendance(businessId: string, limit = 30): Promise<ReadResult<AttendanceRecord[]>> {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { ok: false, message: "로그인이 필요합니다." };
  const { data, error } = await sb
    .schema("crm")
    .from("attendance_records")
    .select("*")
    .eq("business_id", businessId)
    .eq("user_id", auth.user.id)
    .order("clock_in", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map(mapRow) };
}

/** 전 직원(attendance.all) — RLS가 없으면 0행으로 되돌리므로 caller가 caps로 화면을 분기한다. */
export async function listAllAttendance(businessId: string, limit = 100): Promise<ReadResult<AttendanceRecord[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("attendance_records")
    .select("*")
    .eq("business_id", businessId)
    .order("clock_in", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map(mapRow) };
}
