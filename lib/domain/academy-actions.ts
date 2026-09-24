/**
 * 학원 서버 액션. 회차 변경은 반드시 RPC(update_session_once / update_schedule_from)를 거친다 —
 * "이 회차만"과 "이후 전체"를 절대 같은 코드 경로로 섞지 않는다(명세 §3-3, 수용기준 3·4).
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

// 결함 #3 대응: tstzrange(start,end)를 만들 때 start>end면 Postgres가 커스텀 raise가 아니라
// range 생성자 자체에서 이 원문 메시지를 던진다(errcode도 커스텀 코드가 없어 메시지로만 잡는다).
const RANGE_ORDER_RE = /range lower bound must be less than or equal to range upper bound/;

function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (/class_full/.test(msg)) return "반 정원이 가득 찼습니다.";
  if (/session_conflict/.test(msg)) return "해당 시간에 강사 또는 강의실이 이미 사용 중입니다.";
  if (/teacher_required/.test(msg)) return "반 또는 시간표 버전에 강사를 먼저 지정해야 합니다.";
  if (/past_locked/.test(msg)) return "과거·오늘 이전으로는 시간표를 소급 변경할 수 없습니다.";
  if (/overpayment/.test(msg)) return "청구액을 초과하는 납부는 처리할 수 없습니다.";
  if (/stock_insufficient/.test(msg)) return "재고보다 많은 수량은 배부할 수 없습니다.";
  if (RANGE_ORDER_RE.test(msg)) return "종료 시각이 시작 시각보다 빠릅니다.";
  if (e.code === "23P01") return "시간이 겹쳐 저장할 수 없습니다.";
  if (e.code === "23505" && /acad_invoices/.test(msg)) return "이미 그 달 청구서가 있습니다.";
  if (/name_required/.test(msg)) return "반 이름을 입력하세요.";
  if (/name_phone_required/.test(msg)) return "보호자 이름과 전화번호를 입력하세요.";
  if (/consultation_lost/.test(msg)) return "이탈 처리된 상담은 등록 전환할 수 없습니다.";
  if (/student_not_in_business/.test(msg)) return "다른 사업장의 학생은 연결할 수 없습니다.";
  if (/registered_only_via_rpc/.test(msg)) return "'등록' 상태는 등록 전환 버튼으로만 만들 수 있습니다.";
  if (/teacher_not_in_business/.test(msg)) return "이 사업장의 활성 소속 강사만 지정할 수 있습니다.";
  if (/classroom_not_in_business/.test(msg)) return "이 사업장의 강의실만 지정할 수 있습니다.";
  if (/acad_consult_registered_ck/.test(msg)) return "'등록' 상태는 등록 전환 버튼으로만 만들 수 있습니다.";
  if (/invalid_period/.test(msg)) return "청구 월은 YYYY-MM 형식이어야 합니다.";
  if (/checkin_locked/.test(msg)) return "연속 실패로 잠시 잠겼습니다. 60초 후 다시 시도하세요.";
  if (/code_not_found/.test(msg)) return "등록되지 않은 코드입니다.";
  if (/no_session_now/.test(msg)) return "지금 출석 처리할 수업이 없습니다(이미 출석했거나 수업 시간이 아닙니다).";
  if (e.code === "23505" && /checkin_code/.test(msg)) return "이미 다른 학생이 쓰는 등원 코드입니다.";
  if (/acad_students_checkin_code_check/.test(msg)) return "등원 코드는 숫자 4~6자리여야 합니다.";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  // ponytail: 매핑 안 된 원문을 그대로 보여주지 않는다(Postgres 내부 메시지 노출 금지).
  // 원문은 서버 콘솔에만 남긴다 — 화면에는 항상 안전한 한국어 문구만 나간다.
  console.error("[academy pgError] unmapped:", e.code, msg);
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

/** 홈 대시보드·캘린더(회차 파생 일정)도 같이 무효화한다(CLICK-PATH-217). */
function reval(businessId: string) {
  for (const seg of ["", "students", "classes", "timetable", "attendance", "tuition", "calendar"]) revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
}

export async function createStudent(businessId: string, input: { name: string; birthDate?: string; school?: string; grade?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("acad_students").insert({
      business_id: businessId, name: input.name, birth_date: input.birthDate || null, school: input.school || null, grade: input.grade || null,
    }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function addGuardian(businessId: string, input: { studentId: string; name: string; phone: string; relation?: string; isPrimary?: boolean }): Promise<ActionResult> {
  // 보호자 생성 + 학생 연결을 crm.acad_add_guardian(0022) 한 트랜잭션으로 — 연결이 실패하면 고아 보호자가 남지 않는다.
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("acad_add_guardian", {
      p_student: input.studentId, p_name: input.name, p_phone: input.phone, p_relation: input.relation || null, p_is_primary: input.isPrimary ?? false,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function createClassroom(businessId: string, input: { name: string; capacity: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("acad_classrooms").insert({ business_id: businessId, name: input.name, capacity: input.capacity }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 반 개설 + 첫 시간표 버전 + 8주 회차 전개를 crm.acad_create_class(0022) 한 트랜잭션으로 — 회차 전개가 막히면(session_conflict 등) 반도 생기지 않는다. */
export async function createClass(
  businessId: string,
  input: { name: string; subject?: string; teacherId: string; classroomId?: string; capacity: number; tuitionAmount: number; startDate: string; weekday: number; startTime: string; endTime: string }
): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("acad_create_class", {
      p_business: businessId, p_name: input.name, p_subject: input.subject || null, p_teacher: input.teacherId,
      p_classroom: input.classroomId || null, p_capacity: input.capacity, p_tuition: input.tuitionAmount, p_start_date: input.startDate,
      p_weekday: input.weekday, p_start_time: input.startTime, p_end_time: input.endTime, p_weeks: 8,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data as string } };
  });
}

export async function generateSessions(businessId: string, classId: string): Promise<ActionResult<{ created: number }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("acad_generate_sessions", { p_class: classId, p_weeks: 8 });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { created: (data as number) ?? 0 } };
  });
}

/** 정원 초과는 RPC(트랜잭션 내 재검증)가 최종 판정한다. */
export async function enrollStudent(businessId: string, classId: string, studentId: string): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("acad_enroll", { p_class: classId, p_student: studentId });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: (data as { id: string }).id } };
  });
}

/** ★ "이 회차만" — 같은 반의 다른 회차는 전혀 건드리지 않는다. */
export async function updateSessionOnce(
  businessId: string,
  input: { sessionId: string; startIso?: string; endIso?: string; teacherId?: string; classroomId?: string; status?: string; note?: string }
): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").rpc("update_session_once", {
      p_session: input.sessionId, p_start: input.startIso ?? null, p_end: input.endIso ?? null,
      p_teacher: input.teacherId ?? null, p_classroom: input.classroomId ?? null, p_status: input.status ?? null, p_note: input.note ?? null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** ★ "이후 전체" — 오늘 이전으로 소급 불가, 개별 수정(overridden)된 미래 회차는 보존된다. */
export async function updateScheduleFrom(
  businessId: string,
  input: { classId: string; fromDate: string; weekday: number; startTime: string; endTime: string; teacherId?: string; classroomId?: string }
): Promise<ActionResult<{ removed: number }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("update_schedule_from", {
      p_class: input.classId, p_from: input.fromDate, p_weekday: input.weekday, p_start_time: input.startTime, p_end_time: input.endTime,
      p_teacher: input.teacherId ?? null, p_classroom: input.classroomId ?? null, p_weeks: 8,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { removed: (data as number) ?? 0 } };
  });
}

/** 학생 출결 — 강사 근태와 완전히 다른 경로(write, 세션/반 단위). */
export async function markStudentAttendance(businessId: string, input: { sessionId: string; studentId: string; status: string; note?: string }): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("acad_attendance").upsert({
      session_id: input.sessionId, student_id: input.studentId, status: input.status, note: input.note || null,
    }, { onConflict: "session_id,student_id" });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function createInvoice(businessId: string, input: { enrollmentId: string; period: string; amount: number; dueDate: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("acad_invoices").insert({
      enrollment_id: input.enrollmentId, period: input.period, amount: input.amount, due_date: input.dueDate,
    }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function recordAcadPayment(businessId: string, input: { invoiceId: string; amount: number; method: string }): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("acad_payments").insert({ invoice_id: input.invoiceId, amount: input.amount, method: input.method });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function exemptInvoice(businessId: string, invoiceId: string, reason: string): Promise<ActionResult> {
  return withCap(businessId, "refund", async () => {
    if (!reason.trim()) return { ok: false, message: "면제 사유를 입력하세요." };
    const sb = getServerSupabase();
    const r = await mustAffect(
      sb.schema("crm").from("acad_invoices").update({ exempted: true, exempt_reason: reason.trim() }).eq("id", invoiceId).eq("business_id", businessId)
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 청구서를 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

// ── 입학 상담(0023) ───────────────────────────────────────────────
export interface ConsultationInput {
  candidateName: string;
  guardianName?: string;
  guardianPhone?: string;
  source?: string;
  subject?: string;
  /** ISO 또는 "YYYY-MM-DDTHH:mm" */
  consultedAt?: string;
  status?: "신규" | "상담완료" | "등록" | "보류" | "이탈";
  memo?: string;
  assigneeId?: string;
}

function consultRow(input: ConsultationInput) {
  return {
    candidate_name: input.candidateName.trim(), guardian_name: input.guardianName?.trim() || null, guardian_phone: input.guardianPhone?.trim() || null,
    source: input.source?.trim() || null, subject: input.subject?.trim() || null, consulted_at: input.consultedAt || null,
    memo: input.memo?.trim() || null, assignee_id: input.assigneeId || null,
  };
}

export async function createConsultation(businessId: string, input: ConsultationInput): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    if (!input.candidateName?.trim()) return { ok: false, message: "학생 이름을 입력하세요." };
    if (input.status === "등록") return { ok: false, message: "'등록'은 등록 전환으로만 처리할 수 있습니다." };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("acad_consultations")
      .insert({ business_id: businessId, ...consultRow(input), status: input.status ?? "신규" }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 상태 '등록' 으로의 직접 변경은 막는다(DB CHECK 도 막는다) — convertConsultation 을 쓴다. */
export async function updateConsultation(businessId: string, consultationId: string, input: Partial<ConsultationInput>): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    if (input.status === "등록") return { ok: false, message: "'등록'은 등록 전환으로만 처리할 수 있습니다." };
    const patch: Record<string, unknown> = {};
    if (input.candidateName !== undefined) patch.candidate_name = input.candidateName.trim();
    if (input.guardianName !== undefined) patch.guardian_name = input.guardianName.trim() || null;
    if (input.guardianPhone !== undefined) patch.guardian_phone = input.guardianPhone.trim() || null;
    if (input.source !== undefined) patch.source = input.source.trim() || null;
    if (input.subject !== undefined) patch.subject = input.subject.trim() || null;
    if (input.consultedAt !== undefined) patch.consulted_at = input.consultedAt || null;
    if (input.memo !== undefined) patch.memo = input.memo.trim() || null;
    if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId || null;
    if (input.status !== undefined) patch.status = input.status;
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("acad_consultations").update(patch).eq("id", consultationId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 상담을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** 등록 전환 — crm.acad_convert_consultation: 학생 생성 + 보호자(있으면) 연결 + 상담 '등록' 을 한 트랜잭션으로. 재호출은 같은 학생 id. */
export async function convertConsultation(
  businessId: string, consultationId: string, input?: { birthDate?: string; school?: string; grade?: string }
): Promise<ActionResult<{ studentId: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("acad_convert_consultation", {
      p_consultation: consultationId, p_birth_date: input?.birthDate || null, p_school: input?.school || null, p_grade: input?.grade || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { studentId: data as string } };
  });
}

// ── 청구서 일괄 발행(0023 A1) ─────────────────────────────────────
/** 활성 수강 전원에게 period(YYYY-MM) 청구서를 만든다. 이미 있으면 건너뜀. 권한 write+revenue.read(RPC 가 재검사). */
export async function issueMonthlyInvoices(businessId: string, period: string, dueDate?: string): Promise<ActionResult<{ created: number; skipped: number; dueDate: string }>> {
  return withCap(businessId, "write", async () => {
    if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) return { ok: false, message: "청구 월은 YYYY-MM 형식이어야 합니다." };
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("acad_issue_monthly_invoices", { p_business: businessId, p_period: period, p_due_date: dueDate || null });
    if (error) return { ok: false, message: pgError(error) };
    const j = data as { created: number; skipped: number; due_date: string };
    reval(businessId);
    return { ok: true, data: { created: j.created, skipped: j.skipped, dueDate: j.due_date } };
  });
}

// ── 등원 코드(0023 A4) ────────────────────────────────────────────
/** 숫자 4~6자리, 사업장 내 유일(DB unique). null 이면 해제. */
export async function setStudentCheckinCode(businessId: string, studentId: string, code: string | null): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const v = code?.trim() || null;
    if (v != null && !/^[0-9]{4,6}$/.test(v)) return { ok: false, message: "등원 코드는 숫자 4~6자리여야 합니다." };
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("acad_students").update({ checkin_code: v }).eq("id", studentId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 학생을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export interface CheckinResult { attendanceId: string; studentId: string; studentName: string; sessionId: string; className: string; status: "출석" | "지각"; checkedAt: string }

/**
 * 키오스크 화면(직원 로그인 세션)에서 코드 입력 → 지금 시간대의 수업에 출석/지각. 5회 연속 실패 시 60초 잠금(서버).
 * 오답·잠금·수업 없음은 RPC 가 예외가 아니라 {ok:false, hint} 로 돌려준다(0024: raise 하면 실패 카운터가 롤백돼 잠금이 안 걸린다).
 */
export async function checkinByCode(businessId: string, code: string): Promise<ActionResult<CheckinResult>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("acad_checkin_by_code", { p_business: businessId, p_code: code.trim() });
    if (error) return { ok: false, message: pgError(error) };
    const j = data as Record<string, unknown>;
    if (j.ok === false) {
      const hint = String(j.hint ?? "");
      if (hint === "checkin_locked") return { ok: false, message: `연속 실패로 잠시 잠겼습니다. ${Number(j.retry_after_sec ?? 60)}초 후 다시 시도하세요.` };
      if (hint === "no_session_now") return { ok: false, message: `${String(j.student_name ?? "")} 학생: 지금 출석 처리할 수업이 없습니다(이미 출석했거나 수업 시간이 아닙니다).` };
      return { ok: false, message: "등록되지 않은 코드입니다." };
    }
    reval(businessId);
    return {
      ok: true,
      data: { attendanceId: j.attendance_id as string, studentId: j.student_id as string, studentName: j.student_name as string,
              sessionId: j.session_id as string, className: j.class_name as string, status: j.status as "출석" | "지각", checkedAt: j.checked_at as string },
    };
  });
}
