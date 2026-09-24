/**
 * 미용실 서버 액션. 예약 확정은 반드시 crm.salon_book RPC를 거친다(서버가 EXCLUDE 제약으로
 * 최종 판정 — 클라이언트가 계산한 "빈 슬롯"은 힌트일 뿐이다, 명세 §2-3-7).
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";
import { DEFAULT_TZ, dayKeyInTz, overlaps, localDateTimeToUtcIso } from "@/lib/utils/datetime";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (e.code === "23P01" || /appointment_conflict/.test(msg)) return "해당 시간에 이미 예약이 있습니다.";
  if (/overpayment/.test(msg)) return "예약 금액을 초과하는 수납은 처리할 수 없습니다.";
  if (/stock_insufficient/.test(msg)) return "재고보다 많은 수량은 판매할 수 없습니다.";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (/photo_not_uploaded/.test(msg)) return "업로드된 파일이 없습니다. 업로드가 끝난 뒤 다시 시도하세요.";
  if (/invalid_photo_path/.test(msg)) return "이 시술 기록의 사진 경로가 아닙니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  if (/range lower bound must be less than or equal to range upper bound/.test(msg)) return "종료 시각이 시작 시각보다 빠릅니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[salon pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 입력값을 다시 확인해 주세요.";
}

async function withCap<T>(businessId: string, cap: Cap | Cap[], fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    for (const c of Array.isArray(cap) ? cap : [cap]) await requireCap(businessId, c);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  return fn();
}

/** 홈·캘린더(예약 파생 일정)·정산·소모품 재고까지 같이 무효화한다(CLICK-PATH-217). */
function reval(businessId: string) {
  for (const seg of ["", "services", "staff-shift", "calendar", "settlement", "stock"]) revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
}

export async function createService(businessId: string, input: { name: string; category?: string; price: number; durationMinutes: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("salon_services").insert({
      business_id: businessId, name: input.name, category: input.category || null,
      price: input.price, duration_minutes: input.durationMinutes,
    }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function createResource(businessId: string, input: { name: string; resourceType: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("salon_resources").insert({
      business_id: businessId, name: input.name, resource_type: input.resourceType,
    }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** staff.manage — 근무표는 예약 가능시간 "계획"이다. */
export async function upsertStaffProfile(businessId: string, membershipId: string, input: { displayName: string; specialties: string[] }): Promise<ActionResult> {
  return withCap(businessId, "staff.manage", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("salon_staff_profiles").upsert({
      membership_id: membershipId, business_id: businessId, display_name: input.displayName, specialties: input.specialties,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function addSchedule(businessId: string, input: { staffId: string; weekday: number; startTime: string; endTime: string }): Promise<ActionResult> {
  return withCap(businessId, "staff.manage", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("salon_staff_schedules").insert({
      staff_id: input.staffId, weekday: input.weekday, start_time: input.startTime, end_time: input.endTime,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function addTimeOff(businessId: string, input: { staffId: string; startAt: string; endAt: string; offType: string; reason?: string }): Promise<ActionResult> {
  return withCap(businessId, "staff.manage", async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("salon_staff_time_off").insert({
      staff_id: input.staffId, start_at: input.startAt, end_at: input.endAt, off_type: input.offType, reason: input.reason || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** 예약 생성. 충돌 시 서버가 거부하고, 여기서 클라이언트 힌트용 다음 가능 시간을 계산해 함께 돌려준다. */
export async function bookAppointment(
  businessId: string,
  input: { customerId: string; staffId: string; serviceId: string; startIso: string; resourceId?: string; memo?: string }
): Promise<ActionResult<{ id: string }> & { suggestedStartIso?: string }> {
  const capCheck = await withCap(businessId, "write", async () => ({ ok: true as const, data: undefined }));
  if (!capCheck.ok) return capCheck;

  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("salon_book", {
    p_business: businessId, p_customer: input.customerId, p_staff: input.staffId, p_service: input.serviceId,
    p_start: input.startIso, p_resource: input.resourceId ?? null, p_memo: input.memo ?? null,
  });
  if (error) {
    const suggested = error.code === "23P01" ? await suggestNextSlot(sb, businessId, input.staffId, input.serviceId, input.startIso, input.resourceId) : null;
    return { ok: false, message: pgError(error), ...(suggested ? { suggestedStartIso: suggested } : {}) };
  }
  reval(businessId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateAppointmentStatus(businessId: string, appointmentId: string, status: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("salon_appointments").update({ status }).eq("id", appointmentId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 예약을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** QA2-S05: 금액을 기록하는 동작이라 write뿐 아니라 revenue.read도 요구해 UI 게이팅(canRecordPayment)과 맞춘다. */
export async function recordSalonPayment(businessId: string, input: { appointmentId: string; customerId: string; amount: number; method: string }): Promise<ActionResult> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    const sb = getServerSupabase();
    const { error } = await sb.schema("crm").from("salon_payments").insert({
      appointment_id: input.appointmentId, customer_id: input.customerId, amount: input.amount, method: input.method,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

export async function createRetailItem(businessId: string, input: { name: string; price: number }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("salon_retail_items").insert({ business_id: businessId, name: input.name, price: input.price }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

/** 소모품 판매는 write(판매 기록). 재고 차감은 DB 트리거가 하고, 수동 재고 조정만 inventory.adjust 다(CLICK-PATH-238). */
export async function sellRetailItem(businessId: string, input: { retailItemId: string; qty: number; customerId?: string }): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data: item } = await sb.schema("crm").from("salon_retail_items").select("price").eq("id", input.retailItemId).maybeSingle();
    const { error } = await sb.schema("crm").from("salon_retail_sales").insert({
      retail_item_id: input.retailItemId, qty: input.qty, amount: (item?.price ?? 0) * input.qty, customer_id: input.customerId || null,
    });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** 예약 충돌 시 다음 가능 시간대를 계산(힌트). 최종 확정은 항상 salon_book RPC가 다시 검증한다. */
async function suggestNextSlot(
  sb: ReturnType<typeof getServerSupabase>,
  businessId: string,
  staffId: string,
  serviceId: string,
  desiredStartIso: string,
  resourceId?: string
): Promise<string | null> {
  const { data: svc } = await sb.schema("crm").from("salon_services").select("duration_minutes").eq("id", serviceId).maybeSingle();
  const durationMin = svc?.duration_minutes ?? 30;
  const dateKey = dayKeyInTz(desiredStartIso, DEFAULT_TZ);
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();

  const { data: schedules } = await sb.schema("crm").from("salon_staff_schedules").select("start_time,end_time").eq("staff_id", staffId).eq("weekday", weekday);
  if (!schedules || schedules.length === 0) return null;
  const winStart = schedules.reduce((min, s) => (s.start_time < min ? s.start_time : min), schedules[0].start_time);
  const winEnd = schedules.reduce((max, s) => (s.end_time > max ? s.end_time : max), schedules[0].end_time);

  const dayStartIso = localDateTimeToUtcIso(dateKey, winStart.slice(0, 5), DEFAULT_TZ);
  const dayEndIso = localDateTimeToUtcIso(dateKey, winEnd.slice(0, 5), DEFAULT_TZ);

  const { data: timeOff } = await sb.schema("crm").from("salon_staff_time_off").select("start_at,end_at").eq("staff_id", staffId)
    .lt("start_at", dayEndIso).gt("end_at", dayStartIso);
  const { data: appts } = await sb.schema("crm").from("salon_appointments").select("start_at,end_at,resource_id").eq("staff_id", staffId)
    .not("status", "in", "(취소,노쇼)").lt("start_at", dayEndIso).gt("end_at", dayStartIso);
  let resourceAppts: { start_at: string; end_at: string }[] = [];
  if (resourceId) {
    const { data } = await sb.schema("crm").from("salon_appointments").select("start_at,end_at").eq("resource_id", resourceId)
      .not("status", "in", "(취소,노쇼)").lt("start_at", dayEndIso).gt("end_at", dayStartIso);
    resourceAppts = data ?? [];
  }
  const busy = [...(timeOff ?? []), ...(appts ?? []), ...resourceAppts];

  const STEP_MS = 10 * 60 * 1000;
  const durationMs = durationMin * 60 * 1000;
  let candidate = Math.max(new Date(desiredStartIso).getTime(), new Date(dayStartIso).getTime());
  candidate = Math.ceil(candidate / STEP_MS) * STEP_MS;
  const dayEndMs = new Date(dayEndIso).getTime();

  while (candidate + durationMs <= dayEndMs) {
    const candEndIso = new Date(candidate + durationMs).toISOString();
    const candStartIso = new Date(candidate).toISOString();
    const conflict = busy.some((b) => overlaps(candStartIso, candEndIso, b.start_at, b.end_at));
    if (!conflict) return candStartIso;
    candidate += STEP_MS;
  }
  return null;
}

// ── 시술 기록 + 전후 사진(0023) ───────────────────────────────────
// 흐름: createTreatmentHistory → createSalonPhotoUploadUrl(경로·토큰) → 브라우저가
// getBrowserSupabase().storage.from("salon-photos").uploadToSignedUrl(path, token, file) → attachSalonPhoto(경로 기록).
// 용량 10MB·MIME(jpeg/png/webp) 은 버킷 자체 제한이 최종 판정이다. 여기 검사는 안내용.

// "use server" 파일은 async 함수만 export 할 수 있다 — 상수를 export 하면 모듈 전체 액션이 500(QA2-S01).
const SALON_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const SALON_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export async function createTreatmentHistory(businessId: string, input: { appointmentId: string; note?: string }): Promise<ActionResult<{ id: string }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").from("salon_treatment_history")
      .insert({ appointment_id: input.appointmentId, note: input.note?.trim() || null }).select("id").single();
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { id: data.id as string } };
  });
}

export async function updateTreatmentNote(businessId: string, historyId: string, note: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("salon_treatment_history").update({ note: note.trim() || null }).eq("id", historyId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 시술 기록을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}

/** 서명 업로드 URL. 경로 = {business_id}/{history_id}/{timestamp}-{안전한파일명}. 토큰은 2시간 유효, 1회용. */
export async function createSalonPhotoUploadUrl(
  businessId: string,
  input: { historyId: string; fileName: string; mime: string; size: number }
): Promise<ActionResult<{ path: string; token: string }>> {
  return withCap(businessId, "write", async () => {
    if (!(SALON_PHOTO_MIME as readonly string[]).includes(input.mime)) return { ok: false, message: "JPEG·PNG·WebP 이미지만 올릴 수 있습니다." };
    if (!(input.size > 0) || input.size > SALON_PHOTO_MAX_BYTES) return { ok: false, message: "사진은 10MB 이하여야 합니다." };
    const sb = getServerSupabase();
    const { data: h } = await sb.schema("crm").from("salon_treatment_history").select("id").eq("id", input.historyId).eq("business_id", businessId).maybeSingle();
    if (!h) return { ok: false, message: "시술 기록을 찾을 수 없습니다." };
    const ext = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg";
    const base = input.fileName.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9가-힣_-]/g, "_").slice(0, 40) || "photo";
    const path = `${businessId}/${input.historyId}/${Date.now()}-${base}.${ext}`;
    const { data, error } = await sb.storage.from("salon-photos").createSignedUploadUrl(path);
    if (error) return { ok: false, message: /row-level security|policy|permission/i.test(error.message) ? "사진 업로드 권한이 없습니다." : "업로드 URL을 만들지 못했습니다." };
    return { ok: true, data: { path: data.path, token: data.token } };
  });
}

/** 업로드 완료 후 경로를 기록(crm.salon_add_photo — 실제 객체 존재·경로 소속을 서버가 검증). 반환 = 갱신된 전체 경로. */
export async function attachSalonPhoto(businessId: string, historyId: string, path: string): Promise<ActionResult<{ photoPaths: string[] }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("salon_add_photo", { p_history: historyId, p_path: path });
    if (error) return { ok: false, message: pgError(error) };
    reval(businessId);
    return { ok: true, data: { photoPaths: (data as string[]) ?? [] } };
  });
}

/** DB 경로 제거 후 Storage 객체 삭제. 객체 삭제가 실패해도 DB 에서는 이미 빠져 있다(고아 파일은 비공개라 무해). */
export async function removeSalonPhoto(businessId: string, historyId: string, path: string): Promise<ActionResult<{ photoPaths: string[] }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("salon_remove_photo", { p_history: historyId, p_path: path });
    if (error) return { ok: false, message: pgError(error) };
    const { error: rmErr } = await sb.storage.from("salon-photos").remove([path]);
    if (rmErr) console.error("[salon photo] storage remove failed (orphan left):", path, rmErr.message);
    reval(businessId);
    return { ok: true, data: { photoPaths: (data as string[]) ?? [] } };
  });
}

/**
 * QA2-S03: 소모품 입고. salon_retail_items에는 입출고 이력 테이블이 없어(무인매장의
 * us_inventory_movements 같은 원장이 없다) 직접 UPDATE + mustAffect로 최소 구현한다.
 * 동시 입고 경합(lost update)을 막기 위해 읽은 stock_qty를 WHERE 절에 다시 걸어
 * 낙관적 잠금을 건다 — 그 사이 다른 곳에서 먼저 바뀌면 "다시 시도" 오류로 재시도를 유도한다.
 * ponytail: 원장 테이블 없이 CAS로 충분(입고 빈도가 낮다) — 동시 입고가 잦아지면 movements 테이블+트리거로 승격.
 */
export async function addRetailStock(businessId: string, itemId: string, qty: number): Promise<ActionResult<{ stockQty: number }>> {
  return withCap(businessId, "inventory.adjust", async () => {
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, message: "입고 수량은 1 이상의 정수여야 합니다." };
    const sb = getServerSupabase();
    const { data: item, error: readErr } = await sb.schema("crm").from("salon_retail_items").select("stock_qty").eq("id", itemId).eq("business_id", businessId).maybeSingle();
    if (readErr) return { ok: false, message: pgError(readErr) };
    if (!item) return { ok: false, message: "상품을 찾을 수 없습니다." };
    const nextQty = item.stock_qty + qty;
    const r = await mustAffect(
      sb.schema("crm").from("salon_retail_items").update({ stock_qty: nextQty }).eq("id", itemId).eq("business_id", businessId).eq("stock_qty", item.stock_qty)
    );
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "다른 곳에서 먼저 재고를 바꿨습니다. 새로고침 후 다시 시도하세요." };
    reval(businessId);
    return { ok: true, data: { stockQty: nextQty } };
  });
}

/** 시술별 권장 재방문 주기(일). null 이면 해제(0023 S3). */
export async function setServiceRevisitDays(businessId: string, serviceId: string, revisitDays: number | null): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    if (revisitDays != null && (!Number.isInteger(revisitDays) || revisitDays <= 0)) return { ok: false, message: "재방문 주기는 1일 이상의 정수여야 합니다." };
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("salon_services").update({ revisit_days: revisitDays }).eq("id", serviceId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 시술을 찾을 수 없습니다." };
    reval(businessId);
    return { ok: true, data: undefined };
  });
}
