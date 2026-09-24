/**
 * 학원 조회 전용. 쓰기는 academy-actions.ts.
 * 학생 개인정보(v_acad_students_pii)는 pii.read 게이팅 — 없으면 비민감 뷰(v_acad_students)로
 * 자동 폴백한다. 연락처가 필요 없으면 아예 요청하지 않는다(화면에서 필드 자체를 숨김).
 * 학생 출결(acad_attendance)과 강사 근태(crm.attendance_records)는 완전히 다른 테이블/화면이다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayRangeISO } from "./home";
import { CONSULT_STATUSES, type ConsultStatus } from "./academy-types";

export { CONSULT_STATUSES, type ConsultStatus };

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface AcadStudent {
  id: string;
  name: string;
  grade: string | null;
  active: boolean;
  birthDate?: string | null;
  school?: string | null;
  memo?: string | null;
  /** 등원 코드(pii 뷰에서만 옴, 0023 A4). */
  checkinCode?: string | null;
}

export interface AcadGuardian {
  id: string;
  studentId: string;
  name: string;
  phone: string;
  relation: string | null;
}

export interface AcadClassroom { id: string; name: string; capacity: number }

export interface AcadClass {
  id: string;
  name: string;
  subject: string | null;
  defaultTeacherId: string | null;
  defaultClassroomId: string | null;
  capacity: number;
  tuitionAmount: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  enrolledCount?: number;
}

export interface AcadScheduleVersion {
  id: string;
  classId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  teacherId: string | null;
  classroomId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface AcadSession {
  id: string;
  classId: string;
  sessionDate: string;
  startAt: string;
  endAt: string;
  teacherId: string;
  classroomId: string | null;
  status: string;
  sessionKind: string;
  overridden: boolean;
  note: string | null;
}

export interface AcadEnrollment {
  id: string;
  studentId: string;
  classId: string;
  enrolledAt: string;
  status: string;
  tuitionSnapshot: number;
}

export interface AcadInvoiceBalance {
  invoiceId: string;
  enrollmentId: string;
  period: string;
  amount: number;
  dueDate: string;
  exempted: boolean;
  paid: number;
  outstanding: number;
  status: string;
}

export interface AcadMaterial { id: string; name: string; sku: string | null; price: number; stockQty: number; lowStockThreshold: number }

export async function listStudents(businessId: string, canReadPii: boolean): Promise<ReadResult<AcadStudent[]>> {
  const sb = getServerSupabase();
  const view = canReadPii ? "v_acad_students_pii" : "v_acad_students";
  const { data, error } = await sb.schema("crm").from(view).select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, name: r.name, grade: r.grade, active: r.active, birthDate: r.birth_date, school: r.school, memo: r.memo, checkinCode: r.checkin_code ?? null })) };
}

/**
 * 학생 1명 조회(학생 상세용). canReadPii는 호출부(page.tsx)가 access.caps로 이미 판정한
 * 값 — listStudents()와 같은 규칙으로 없으면 비민감 뷰(v_acad_students)만 조회한다.
 */
export async function getStudent(businessId: string, studentId: string, canReadPii: boolean): Promise<ReadResult<AcadStudent>> {
  const sb = getServerSupabase();
  const view = canReadPii ? "v_acad_students_pii" : "v_acad_students";
  const { data, error } = await sb.schema("crm").from(view).select("*").eq("business_id", businessId).eq("id", studentId).maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "학생을 찾을 수 없습니다." };
  return { ok: true, data: { id: data.id, name: data.name, grade: data.grade, active: data.active, birthDate: data.birth_date, school: data.school, memo: data.memo, checkinCode: data.checkin_code ?? null } };
}

/** pii.read가 없으면 아예 호출하지 않는다(화면에서 요청조차 하지 않는다, 명세 §3-7). */
export async function listGuardians(businessId: string): Promise<ReadResult<AcadGuardian[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("acad_guardians").select("*, acad_student_guardians(student_id)").eq("business_id", businessId);
  if (error) return { ok: false, message: error.message };
  const rows: AcadGuardian[] = [];
  for (const r of data ?? []) {
    for (const link of r.acad_student_guardians ?? []) rows.push({ id: r.id, studentId: link.student_id, name: r.name, phone: r.phone, relation: r.relation });
  }
  return { ok: true, data: rows };
}

export async function listClassrooms(businessId: string): Promise<ReadResult<AcadClassroom[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("acad_classrooms").select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity })) };
}

export async function listClasses(businessId: string): Promise<ReadResult<AcadClass[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_acad_classes").select("*, acad_enrollments(status)").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, name: r.name, subject: r.subject, defaultTeacherId: r.default_teacher_id, defaultClassroomId: r.default_classroom_id,
      capacity: r.capacity, tuitionAmount: r.tuition_amount, startDate: r.start_date, endDate: r.end_date, active: r.active,
      enrolledCount: (r.acad_enrollments ?? []).filter((e: { status: string }) => e.status === "활성").length,
    })),
  };
}

export async function listScheduleVersions(classId: string): Promise<ReadResult<AcadScheduleVersion[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("acad_class_schedule_versions").select("*").eq("class_id", classId).order("effective_from", { ascending: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, classId: r.class_id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time, teacherId: r.teacher_id, classroomId: r.classroom_id, effectiveFrom: r.effective_from, effectiveTo: r.effective_to })) };
}

export async function listSessions(businessId: string, classId?: string, fromDate?: string): Promise<ReadResult<AcadSession[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("acad_sessions").select("*").eq("business_id", businessId).order("session_date").order("start_at");
  if (classId) q = q.eq("class_id", classId);
  if (fromDate) q = q.gte("session_date", fromDate);
  const { data, error } = await q.limit(200);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, classId: r.class_id, sessionDate: r.session_date, startAt: r.start_at, endAt: r.end_at,
      teacherId: r.teacher_id, classroomId: r.classroom_id, status: r.status, sessionKind: r.session_kind, overridden: r.overridden, note: r.note,
    })),
  };
}

export async function listEnrollments(businessId: string, classId?: string): Promise<ReadResult<AcadEnrollment[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("v_acad_enrollments").select("*").eq("business_id", businessId);
  if (classId) q = q.eq("class_id", classId);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, studentId: r.student_id, classId: r.class_id, enrolledAt: r.enrolled_at, status: r.status, tuitionSnapshot: r.tuition_snapshot })) };
}

/** 학생 상세용 보호자 목록. pii.read 없으면 page.tsx가 애초에 부르지 않는다(§3-7). */
export async function listGuardiansForStudent(businessId: string, studentId: string): Promise<ReadResult<AcadGuardian[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("acad_guardians")
    .select("*, acad_student_guardians!inner(student_id)")
    .eq("business_id", businessId)
    .eq("acad_student_guardians.student_id", studentId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, studentId, name: r.name, phone: r.phone, relation: r.relation })) };
}

export interface AcadEnrollmentDetail extends AcadEnrollment {
  className: string;
  subject: string | null;
}

/** 학생 상세 "수강 이력" — 반 이름·과목을 함께 붙인다. 최근 등록순. */
export async function listEnrollmentsForStudent(businessId: string, studentId: string): Promise<ReadResult<AcadEnrollmentDetail[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("v_acad_enrollments")
    .select("*, acad_classes!inner(name,subject,business_id)")
    .eq("student_id", studentId)
    .eq("acad_classes.business_id", businessId)
    .order("enrolled_at", { ascending: false });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, studentId: r.student_id, classId: r.class_id, enrolledAt: r.enrolled_at, status: r.status, tuitionSnapshot: r.tuition_snapshot,
      className: r.acad_classes?.name ?? "-", subject: r.acad_classes?.subject ?? null,
    })),
  };
}

export interface AcadAttendanceDetail {
  id: string;
  sessionId: string;
  sessionDate: string;
  className: string;
  status: string;
  note: string | null;
}

/** 학생 상세 "출결 이력" — 회차 날짜·반 이름과 함께. 최근순, 최대 100건. */
export async function listAttendanceForStudent(businessId: string, studentId: string): Promise<ReadResult<AcadAttendanceDetail[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("acad_attendance")
    .select("*, acad_sessions!inner(session_date,class_id,business_id,acad_classes(name))")
    .eq("student_id", studentId)
    .eq("acad_sessions.business_id", businessId)
    .order("session_date", { ascending: false, referencedTable: "acad_sessions" })
    .limit(100);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, sessionId: r.session_id, sessionDate: r.acad_sessions?.session_date ?? "", status: r.status, note: r.note,
      className: r.acad_sessions?.acad_classes?.name ?? "-",
    })),
  };
}

export async function listInvoiceBalances(businessId: string): Promise<ReadResult<AcadInvoiceBalance[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_acad_invoice_balance").select("*").eq("business_id", businessId).order("due_date", { ascending: false });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ invoiceId: r.invoice_id, enrollmentId: r.enrollment_id, period: r.period, amount: r.amount, dueDate: r.due_date, exempted: r.exempted, paid: r.paid, outstanding: r.outstanding, status: r.status })),
  };
}

/**
 * 담당 강사 선택 등 가벼운 용도의 소속 목록. lib/domain/staff.ts의 listStaff()는
 * staff.manage 전용(직원·권한 관리 화면 몫)이라 여기서는 그보다 낮은 요구사항(write)으로
 * RLS가 원래 허용하는 범위(같은 사업장 소속이면 조회 가능)만큼만 가볍게 읽는다.
 */
export async function listActiveMembers(
  businessId: string
): Promise<ReadResult<{ membershipId: string; userId: string; displayName: string }[]>> {
  const sb = getServerSupabase();
  // 표시이름은 crm.business_members(0016) RPC 가 user_id 기준으로 준다(CLICK-PATH-210). 두 조회를 user_id 로 합친다.
  const [memRes, nameRes] = await Promise.all([
    sb.schema("crm").from("memberships").select("id,user_id").eq("business_id", businessId).eq("status", "active"),
    sb.schema("crm").rpc("business_members", { p_business: businessId }),
  ]);
  if (memRes.error) return { ok: false, message: memRes.error.message };
  if (nameRes.error) return { ok: false, message: nameRes.error.message };
  const names = new Map(((nameRes.data ?? []) as { user_id: string; display_name: string }[]).map((r) => [r.user_id, r.display_name]));
  return {
    ok: true,
    data: (memRes.data ?? []).map((r) => ({
      membershipId: r.id as string,
      userId: r.user_id as string,
      displayName: names.get(r.user_id as string) ?? (r.user_id as string).slice(0, 8),
    })),
  };
}

export async function listEnrolledStudents(classId: string): Promise<ReadResult<AcadStudent[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("acad_enrollments").select("status, acad_students(id,name,grade,active)").eq("class_id", classId).eq("status", "활성");
  if (error) return { ok: false, message: error.message };
  type JoinedStudent = { id: string; name: string; grade: string | null; active: boolean };
  const rows: AcadStudent[] = [];
  for (const r of data ?? []) {
    const joined = r.acad_students as unknown as JoinedStudent | JoinedStudent[] | null;
    const student = Array.isArray(joined) ? joined[0] : joined;
    if (student) rows.push({ id: student.id, name: student.name, grade: student.grade, active: student.active });
  }
  return { ok: true, data: rows };
}

export async function listStudentAttendance(sessionId: string): Promise<ReadResult<{ id: string; studentId: string; status: string; note: string | null }[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("acad_attendance").select("*").eq("session_id", sessionId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, studentId: r.student_id, status: r.status, note: r.note })) };
}

export interface AcademyToday {
  todayKey: string;
  /** 오늘 날짜의 수업 회차(정규+보강+휴강 전부, 시간순). */
  sessionsToday: AcadSession[];
  /** 보강이거나 휴강으로 표시된 오늘 회차 — 홈 보조영역 "보강/휴강". */
  makeupOrCancelToday: AcadSession[];
  /** 오늘 회차 중 출결이 한 건도 기록되지 않은(아직 확인 전) 회차 수. */
  attendanceUnmarkedCount: number;
  /** 상태가 "미납"인 청구 건수(기간 무관 — 다른 업종의 "연체/미수"와 같은 성격). revenue.read 없으면 0이 아니라 항상 0으로 두되 revenueVisible로 구분한다. */
  unpaidCount: number;
  /** false면 revenue.read가 없어 미납 건수를 아예 조회하지 않은 것(§5.8) — tuition/page.tsx와 같은 게이팅. */
  revenueVisible: boolean;
  /** 회차의 classId → 반 이름 표시용(TimetableBoard와 같은 관례). */
  classes: AcadClass[];
}

/**
 * 홈 대시보드용 "오늘 현황". 가짜 지표 없음 — 전부 실제 쿼리 결과.
 * canReadRevenue는 호출부(page.tsx)가 access.caps로 이미 판정한 값 — tuition/page.tsx가
 * revenue.read를 요구하는 것과 동일하게, 없으면 listInvoiceBalances를 아예 부르지 않는다.
 */
export async function getAcademyToday(
  businessId: string,
  tz: string,
  canReadRevenue: boolean
): Promise<ReadResult<AcademyToday>> {
  const { todayKey } = todayRangeISO(tz);
  const [sessionsRes, invoicesRes, classesRes] = await Promise.all([
    listSessions(businessId, undefined, todayKey),
    canReadRevenue ? listInvoiceBalances(businessId) : Promise.resolve({ ok: true as const, data: [] }),
    listClasses(businessId),
  ]);
  if (!sessionsRes.ok) return sessionsRes;
  if (!invoicesRes.ok) return invoicesRes;
  if (!classesRes.ok) return classesRes;

  const sessionsToday = sessionsRes.data
    .filter((s) => s.sessionDate === todayKey)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const makeupOrCancelToday = sessionsToday.filter((s) => s.sessionKind === "보강" || s.status === "휴강");

  // 회차별 출결 기록 여부(N+1이지만 "오늘" 범위라 건수가 작다). 휴강은 출결 대상이 아니다.
  const checkTargets = sessionsToday.filter((s) => s.status !== "휴강");
  const attendanceCounts = await Promise.all(checkTargets.map((s) => listStudentAttendance(s.id)));
  const attendanceUnmarkedCount = attendanceCounts.filter((r) => r.ok && r.data.length === 0).length;

  const unpaidCount = invoicesRes.data.filter((i) => i.status === "미납").length;

  return {
    ok: true,
    data: {
      todayKey,
      sessionsToday,
      makeupOrCancelToday,
      attendanceUnmarkedCount,
      unpaidCount,
      revenueVisible: canReadRevenue,
      classes: classesRes.data,
    },
  };
}

// ── 입학 상담(0023) — CONSULT_STATUSES/ConsultStatus는 academy-types.ts가 단일 출처 ──
export interface AcadConsultation {
  id: string;
  candidateName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  source: string | null;
  subject: string | null;
  consultedAt: string | null;
  status: ConsultStatus;
  memo: string | null;
  assigneeId: string | null;
  convertedStudentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 목록은 pii.read 가 있어야 보인다(보호자 연락처 포함 — acad_guardians 와 같은 기준). 없으면 화면이 호출하지 말 것. */
export async function listConsultations(businessId: string, filter?: { status?: ConsultStatus; from?: string; to?: string }): Promise<ReadResult<AcadConsultation[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("acad_consultations").select("*").eq("business_id", businessId)
    .order("consulted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (filter?.status) q = q.eq("status", filter.status);
  if (filter?.from) q = q.gte("consulted_at", filter.from);
  if (filter?.to) q = q.lte("consulted_at", filter.to);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, candidateName: r.candidate_name, guardianName: r.guardian_name, guardianPhone: r.guardian_phone, source: r.source,
      subject: r.subject, consultedAt: r.consulted_at, status: r.status as ConsultStatus, memo: r.memo, assigneeId: r.assignee_id,
      convertedStudentId: r.converted_student_id, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  };
}

export interface ConsultationStats {
  from: string;
  to: string;
  total: number;
  converted: number;
  /** 백분율(소수 1자리) */
  rate: number;
  byStatus: Record<string, number>;
  bySource: { source: string; total: number; converted: number; rate: number }[];
}

/** crm.acad_consultation_stats — PII 없는 집계라 is_member 면 된다(홈 대시보드 로더에서 호출). from/to = "YYYY-MM-DD" 포함 구간. */
export async function getConsultationStats(businessId: string, from: string, to: string): Promise<ReadResult<ConsultationStats>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("acad_consultation_stats", { p_business: businessId, p_from: from, p_to: to });
  if (error) return { ok: false, message: error.message };
  const j = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      from, to, total: Number(j.total ?? 0), converted: Number(j.converted ?? 0), rate: Number(j.rate ?? 0),
      byStatus: (j.by_status as Record<string, number>) ?? {},
      bySource: ((j.by_source as Record<string, unknown>[]) ?? []).map((r) => ({
        source: String(r.source), total: Number(r.total), converted: Number(r.converted), rate: Number(r.rate),
      })),
    },
  };
}
