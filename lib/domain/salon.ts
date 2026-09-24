/**
 * 미용실 조회 전용. 쓰기는 salon-actions.ts.
 * 예약 가능시간(schedules/time_off, 계획)과 출퇴근(crm.attendance_records, 사실)은
 * 완전히 다른 테이블이다 — 이 파일은 전자만 다룬다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { todayRangeISO } from "./home";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface SalonService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  durationMinutes: number;
  active: boolean;
  /** 권장 재방문 주기(일). null 이면 재방문 대상 계산에서 제외(0023 S3). */
  revisitDays: number | null;
}

export interface SalonResource {
  id: string;
  name: string;
  resourceType: string;
  active: boolean;
}

export interface SalonStaffProfile {
  membershipId: string;
  displayName: string;
  specialties: string[];
  active: boolean;
}

export interface SalonSchedule {
  id: string;
  staffId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface SalonTimeOff {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  offType: string;
  reason: string | null;
}

export interface SalonAppointment {
  id: string;
  customerId: string;
  customerName: string | null;
  staffId: string;
  resourceId: string | null;
  serviceId: string;
  serviceName: string | null;
  startAt: string;
  endAt: string;
  status: string;
  price: number;
  memo: string | null;
}

export interface RetailItem {
  id: string;
  name: string;
  price: number;
  stockQty: number;
  lowStockThreshold: number;
}

export async function listServices(businessId: string): Promise<ReadResult<SalonService[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_services").select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id, name: r.name, category: r.category, price: r.price, durationMinutes: r.duration_minutes, active: r.active,
      revisitDays: (r.revisit_days as number | null) ?? null,
    })),
  };
}

export async function listResources(businessId: string): Promise<ReadResult<SalonResource[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_resources").select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, name: r.name, resourceType: r.resource_type, active: r.active })) };
}

export async function listStaffProfiles(businessId: string): Promise<ReadResult<SalonStaffProfile[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_staff_profiles").select("*").eq("business_id", businessId);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ membershipId: r.membership_id, displayName: r.display_name, specialties: r.specialties ?? [], active: r.active })),
  };
}

export async function listSchedules(businessId: string): Promise<ReadResult<SalonSchedule[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_staff_schedules").select("*").eq("business_id", businessId).order("weekday");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, staffId: r.staff_id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time })) };
}

export async function listTimeOff(businessId: string): Promise<ReadResult<SalonTimeOff[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_staff_time_off").select("*").eq("business_id", businessId).order("start_at", { ascending: false }).limit(100);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, staffId: r.staff_id, startAt: r.start_at, endAt: r.end_at, offType: r.off_type, reason: r.reason })) };
}

/** dateKey('YYYY-MM-DD')가 주어지면 그 하루, 아니면 앞으로 100건. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAppointmentRow(r: any): SalonAppointment {
  return {
    id: r.id, customerId: r.customer_id, customerName: r.customers?.name ?? null,
    staffId: r.staff_id, resourceId: r.resource_id, serviceId: r.service_id,
    serviceName: r.salon_services?.name ?? null,
    startAt: r.start_at, endAt: r.end_at, status: r.status, price: r.price, memo: r.memo,
  };
}

export async function listAppointments(businessId: string, dateKey?: string): Promise<ReadResult<SalonAppointment[]>> {
  const sb = getServerSupabase();
  let q = sb
    .schema("crm")
    .from("v_salon_appointments")
    .select("*, customers(name), salon_services(name)")
    .eq("business_id", businessId)
    .order("start_at", { ascending: true });
  if (dateKey) {
    q = q.gte("start_at", `${dateKey}T00:00:00Z`).lt("start_at", `${dateKey}T23:59:59.999Z`);
  } else {
    q = q.limit(100);
  }
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map(mapAppointmentRow) };
}

/**
 * 정산 화면 전용 — 취소·노쇼를 제외한 예약을 최근 순으로(결함 #1 수정: 정산이
 * lib/domain/rental.ts를 조회하던 것을 없애고 미용실 자체 데이터로 대체한다).
 */
export async function listSettlementAppointments(businessId: string): Promise<ReadResult<SalonAppointment[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("v_salon_appointments")
    .select("*, customers(name), salon_services(name)")
    .eq("business_id", businessId)
    .not("status", "in", "(취소,노쇼)")
    .order("start_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map(mapAppointmentRow) };
}

/**
 * 고객 상세 "시술 이력" — 이 고객의 예약 전체를 최근순으로. dateKey 필터가 없는
 * listAppointments()와 달리 customerId로 좁혀서 예약이 많아도 안전하다.
 */
export async function listAppointmentsForCustomer(businessId: string, customerId: string): Promise<ReadResult<SalonAppointment[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("v_salon_appointments")
    .select("*, customers(name), salon_services(name)")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("start_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map(mapAppointmentRow) };
}

export async function getAppointmentBalance(appointmentId: string): Promise<ReadResult<{ price: number; paid: number; outstanding: number } | null>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_salon_appointment_balance").select("*").eq("appointment_id", appointmentId).maybeSingle();
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data ? { price: data.price, paid: data.paid, outstanding: data.outstanding } : null };
}

export async function listRetailItems(businessId: string): Promise<ReadResult<RetailItem[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_retail_items").select("*").eq("business_id", businessId).order("name");
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, name: r.name, price: r.price, stockQty: r.stock_qty, lowStockThreshold: r.low_stock_threshold })) };
}

const SALON_TERMINAL = new Set(["완료", "취소", "노쇼"]);

export interface SalonToday {
  todayKey: string;
  /** 시간순 정렬된 오늘 예약 전부(취소·노쇼 포함 — 목록은 있는 그대로 보여준다). */
  appointmentsToday: SalonAppointment[];
  /** 아직 시작하지 않은 것 중 가장 이른 예약. */
  nextAppointment: SalonAppointment | null;
  /** 지금 이 순간 시작~종료 사이인 예약 수. */
  inProgressCount: number;
  /** 오늘 완료됐지만 잔액이 남은 예약(수납 필요). revenue.read 없으면 항상 []. */
  outstanding: { appointment: SalonAppointment; outstanding: number }[];
  /** false면 revenue.read가 없어 잔액을 아예 조회하지 않은 것 — 0건과 구분해야 한다(§5.8, "미수" 지표를 통째로 숨긴다). */
  revenueVisible: boolean;
  lowStockRetail: RetailItem[];
  /** 오늘과 겹치는 휴무·휴게. */
  timeOffToday: SalonTimeOff[];
}

/**
 * 홈 대시보드용 "오늘 현황". 가짜 지표 없음 — 전부 실제 쿼리 결과.
 * "시술 중"은 저장된 상태 값이 아니라 현재 시각이 [startAt,endAt) 안인지로 계산한다
 * (스키마에 별도 "진행중" 상태가 없다 — 예약 시간표 자체가 근거다).
 *
 * canReadRevenue는 호출부(page.tsx)가 access.caps로 이미 판정한 값 — settlement/page.tsx와
 * 똑같이 revenue.read 없으면 잔액(getAppointmentBalance)을 아예 요청하지 않는다.
 */
export async function getSalonToday(
  businessId: string,
  tz: string,
  canReadRevenue: boolean
): Promise<ReadResult<SalonToday>> {
  const { todayKey, startISO, endISO } = todayRangeISO(tz);
  const [apptRes, retailRes, timeOffRes] = await Promise.all([
    listAppointments(businessId, todayKey),
    listRetailItems(businessId),
    listTimeOff(businessId),
  ]);
  if (!apptRes.ok) return apptRes;
  if (!retailRes.ok) return retailRes;
  if (!timeOffRes.ok) return timeOffRes;
  const timeOffToday = timeOffRes.data.filter((t) => t.startAt < endISO && t.endAt > startISO);

  const now = Date.now();
  const appointmentsToday = apptRes.data;
  const active = appointmentsToday.filter((a) => !SALON_TERMINAL.has(a.status));

  const nextAppointment =
    active
      .filter((a) => new Date(a.startAt).getTime() >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null;

  const inProgressCount = active.filter(
    (a) => new Date(a.startAt).getTime() <= now && now < new Date(a.endAt).getTime()
  ).length;

  // 완료된 예약만 잔액을 확인한다(N+1이지만 "오늘" 범위라 건수가 작다).
  // revenue.read 없으면 애초에 요청하지 않는다 — settlement/page.tsx와 같은 게이팅.
  const outstanding: { appointment: SalonAppointment; outstanding: number }[] = [];
  if (canReadRevenue) {
    const completedToday = appointmentsToday.filter((a) => a.status === "완료");
    const balances = await Promise.all(completedToday.map((a) => getAppointmentBalance(a.id)));
    completedToday.forEach((a, i) => {
      const b = balances[i];
      if (b.ok && b.data && b.data.outstanding > 0) outstanding.push({ appointment: a, outstanding: b.data.outstanding });
    });
  }

  const lowStockRetail = retailRes.data.filter((r) => r.stockQty <= r.lowStockThreshold);

  return {
    ok: true,
    data: {
      todayKey,
      appointmentsToday,
      nextAppointment,
      inProgressCount,
      outstanding,
      revenueVisible: canReadRevenue,
      lowStockRetail,
      timeOffToday,
    },
  };
}

// ── 시술 기록 + 사진(0023) ───────────────────────────────────────
export interface TreatmentHistoryRow {
  id: string;
  appointmentId: string;
  note: string | null;
  /** Storage 경로(salon-photos 버킷). 삭제·재발급에 쓴다. */
  photoPaths: string[];
  /** 경로와 같은 순서의 서명 URL(10분). 실패한 경로는 null. */
  photoUrls: (string | null)[];
  createdAt: string;
}

export const SALON_PHOTO_BUCKET = "salon-photos";
const SIGNED_URL_TTL_SEC = 600;

/** 고객(또는 예약) 기준 시술 기록. 사진은 서명 URL 로만 나간다 — 버킷이 비공개라 경로만으로는 열 수 없다. */
export async function listTreatmentHistory(businessId: string, filter: { customerId?: string; appointmentId?: string }): Promise<ReadResult<TreatmentHistoryRow[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("salon_treatment_history").select("id,appointment_id,note,photo_paths,created_at,salon_appointments!inner(customer_id)")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
  if (filter.appointmentId) q = q.eq("appointment_id", filter.appointmentId);
  if (filter.customerId) q = q.eq("salon_appointments.customer_id", filter.customerId);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  const rows = (data ?? []) as unknown as { id: string; appointment_id: string; note: string | null; photo_paths: string[]; created_at: string }[];
  const allPaths = rows.flatMap((r) => r.photo_paths ?? []);
  const urlByPath = new Map<string, string | null>();
  if (allPaths.length > 0) {
    const { data: signed } = await sb.storage.from(SALON_PHOTO_BUCKET).createSignedUrls(allPaths, SIGNED_URL_TTL_SEC);
    for (const sgn of signed ?? []) urlByPath.set(sgn.path ?? "", sgn.error ? null : sgn.signedUrl);
  }
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id, appointmentId: r.appointment_id, note: r.note, photoPaths: r.photo_paths ?? [],
      photoUrls: (r.photo_paths ?? []).map((pth) => urlByPath.get(pth) ?? null), createdAt: r.created_at,
    })),
  };
}

// ── 재방문 시기 도래 고객(0023 S3) ────────────────────────────────
export interface RevisitDueRow {
  customerId: string;
  customerName: string;
  /** pii.read 없으면 null(서버가 가린다). */
  phone: string | null;
  serviceId: string;
  serviceName: string;
  staffId: string;
  lastVisit: string;
  dueDate: string;
  daysOverdue: number;
}

/** crm.salon_revisit_due — 마지막 '완료' 예약 + 시술 revisit_days 경과, 앞으로 잡힌 예약 없음. graceDays 만큼 앞당겨 본다. */
export async function listRevisitDue(businessId: string, graceDays = 0): Promise<ReadResult<RevisitDueRow[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("salon_revisit_due", { p_business: businessId, p_grace_days: graceDays });
  if (error) return { ok: false, message: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    ok: true,
    data: rows.map((r) => ({
      customerId: r.customer_id as string, customerName: r.customer_name as string, phone: (r.phone as string | null) ?? null,
      serviceId: r.service_id as string, serviceName: r.service_name as string, staffId: r.staff_id as string,
      lastVisit: r.last_visit as string, dueDate: r.due_date as string, daysOverdue: Number(r.days_overdue ?? 0),
    })),
  };
}

// ── 고객별 노쇼 횟수(전체 이력, 0023 S4) ─────────────────────────
/** listAppointments 의 100건 제한과 무관하게 전체 이력에서 센다. 노쇼가 없는 고객은 키가 없다(0으로 취급). */
export async function countNoShowsByCustomer(businessId: string): Promise<ReadResult<Record<string, number>>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("salon_appointments").select("customer_id").eq("business_id", businessId).eq("status", "노쇼").limit(10000);
  if (error) return { ok: false, message: error.message };
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.customer_id as string] = (out[r.customer_id as string] ?? 0) + 1;
  return { ok: true, data: out };
}
