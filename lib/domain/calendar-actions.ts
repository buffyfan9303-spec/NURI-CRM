/**
 * 캘린더 서버 액션 — 생성/수정/상태변경/삭제.
 *
 * 계약 준수:
 *  - §5.1/§5.3: requireCap()이 매 호출마다 DB의 memberships를 다시 읽는다.
 *  - 파생 일정(source_table/source_id 있음)은 이 파일에서 title/notes/일시/담당자를
 *    바꿀 수 없다 — 원 업무 갱신 경로가 아직 없으므로 읽기 전용으로 막는다.
 *  - 중복 제출 방지: DB에 idempotency_key 컬럼이 없으므로(0002_calendar.sql 범위 밖),
 *    "같은 business+kind+source+시작시각(또는 event_date)+제목"이 최근 N초 안에
 *    이미 있으면 새로 만들지 않고 그 행을 그대로 돌려준다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireCap, AccessDenied, type AccessFail, type Cap } from "@/lib/auth/access";
import { getServerSupabase } from "@/lib/supabase/server";
import { mustAffect } from "@/lib/db/mustAffect";
import { INDUSTRY_DEFS } from "@/lib/industry/config";
import { STATUS_OPTIONS, isDerivedEvent, mapRow, type CalendarEvent, type RawRow } from "@/lib/domain/calendar-shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DUPLICATE_WINDOW_MS = 15_000;
const STATUS_VALUES = STATUS_OPTIONS.map((s) => s.value) as readonly string[];

export interface CalendarEventInput {
  kind: string;
  title: string;
  allDay: boolean;
  /** allDay일 때만: 'YYYY-MM-DD' */
  eventDate?: string | null;
  /** !allDay일 때만: UTC ISO */
  startsAt?: string | null;
  endsAt?: string | null;
  assignee?: string | null;
  notes?: string | null;
}

export type MutateReason =
  | AccessFail["reason"]
  | "validation"
  | "not-found"
  | "readonly-derived";

export type MutateEventResult =
  | { ok: true; event: CalendarEvent; deduped?: boolean }
  | { ok: false; reason: MutateReason; message: string; detail?: Record<string, unknown> };

function fail(reason: MutateReason, message: string, detail?: Record<string, unknown>): MutateEventResult {
  return { ok: false, reason, message, detail };
}

/** DB 오류 → 한국어 문구. 원문은 서버 콘솔에만(CLICK-PATH-228, nuri-async-guard). */
function pgMessage(e: { code?: string; message: string }, fallback: string): string {
  const msg = e.message ?? "";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (e.code === "23505") return "같은 일정이 이미 있습니다(방금 만든 일정을 확인하세요).";
  if (e.code === "23514" || /check constraint/.test(msg)) return "입력값이 허용 범위를 벗어났습니다(종류·날짜·시각을 확인하세요).";
  if (e.code === "23503") return "담당자 또는 원 업무 레코드를 찾을 수 없습니다.";
  console.error("[calendar pgError] unmapped:", e.code, msg);
  return fallback;
}

function fromAccessFail(f: AccessFail): MutateEventResult {
  switch (f.reason) {
    case "unauthenticated":
      return fail("unauthenticated", "로그인이 필요합니다.");
    case "not-member":
      return fail("not-member", "이 사업장에 활성 소속이 없습니다.");
    case "forbidden":
      return fail(
        "forbidden",
        `이 작업에는 '${f.missing}' 권한이 필요합니다. 사업장 관리자에게 요청하세요.`,
        { missing: f.missing, caps: f.caps }
      );
    case "error":
      return fail("error", "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

function validateInput(
  input: CalendarEventInput,
  allowedKinds: string[]
): { ok: true } | { ok: false; message: string } {
  if (!input.kind || !allowedKinds.includes(input.kind)) {
    return { ok: false, message: "이 업종에 없는 일정 종류입니다." };
  }
  const title = input.title?.trim() ?? "";
  if (!title || title.length > 200) {
    return { ok: false, message: "제목은 1~200자로 입력하세요." };
  }
  if (input.allDay) {
    if (!input.eventDate || !DATE_KEY_RE.test(input.eventDate)) {
      return { ok: false, message: "종일 일정은 날짜를 선택해야 합니다." };
    }
  } else {
    if (!input.startsAt || Number.isNaN(new Date(input.startsAt).getTime())) {
      return { ok: false, message: "시작 시각을 입력하세요." };
    }
    if (input.endsAt) {
      if (Number.isNaN(new Date(input.endsAt).getTime())) {
        return { ok: false, message: "종료 시각이 올바르지 않습니다." };
      }
      if (new Date(input.endsAt).getTime() < new Date(input.startsAt).getTime()) {
        return { ok: false, message: "종료 시각은 시작 시각보다 빠를 수 없습니다." };
      }
    }
  }
  if (input.assignee && !UUID_RE.test(input.assignee)) {
    return { ok: false, message: "담당자 값이 올바르지 않습니다." };
  }
  return { ok: true };
}

interface EventRow {
  business_id: string;
  kind: string;
  title: string;
  all_day: boolean;
  event_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  assignee: string | null;
  notes: string | null;
}

function toRow(businessId: string, input: CalendarEventInput): EventRow {
  return {
    business_id: businessId,
    kind: input.kind,
    title: input.title.trim(),
    all_day: input.allDay,
    event_date: input.allDay ? (input.eventDate as string) : null,
    starts_at: input.allDay ? null : (input.startsAt as string),
    ends_at: input.allDay ? null : input.endsAt || null,
    assignee: input.assignee || null,
    notes: input.notes?.trim() || null,
  };
}

async function findRecentDuplicate(
  sb: ReturnType<typeof getServerSupabase>,
  businessId: string,
  input: CalendarEventInput
): Promise<RawRow | null> {
  let q = sb
    .schema("crm")
    .from("calendar_events")
    .select("*")
    .eq("business_id", businessId)
    .eq("kind", input.kind)
    .eq("title", input.title.trim())
    .gte("created_at", new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString());
  q = input.allDay ? q.eq("event_date", input.eventDate as string) : q.eq("starts_at", input.startsAt as string);
  const { data } = await q.limit(1).maybeSingle();
  return (data as RawRow) ?? null;
}

export async function createEvent(businessId: string, input: CalendarEventInput): Promise<MutateEventResult> {
  let access;
  try {
    access = await requireCap(businessId, "write" as Cap);
  } catch (e) {
    if (e instanceof AccessDenied) return fromAccessFail(e.detail);
    throw e;
  }

  const allowedKinds = INDUSTRY_DEFS[access.industry].eventKinds.map((k) => k.kind);
  const v = validateInput(input, allowedKinds);
  if (!v.ok) return fail("validation", v.message);

  const sb = getServerSupabase();

  const dup = await findRecentDuplicate(sb, businessId, input);
  if (dup) return { ok: true, event: mapRow(dup), deduped: true };

  const { data, error } = await sb
    .schema("crm")
    .from("calendar_events")
    .insert(toRow(businessId, input))
    .select("*")
    .single();

  if (error) return fail("error", pgMessage(error, "일정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."));

  revalidatePath(`/w/${businessId}/calendar`);
  return { ok: true, event: mapRow(data as RawRow) };
}

async function loadEvent(
  sb: ReturnType<typeof getServerSupabase>,
  businessId: string,
  eventId: string
): Promise<RawRow | null> {
  const { data } = await sb
    .schema("crm")
    .from("calendar_events")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", eventId)
    .maybeSingle();
  return (data as RawRow) ?? null;
}

export async function updateEvent(
  businessId: string,
  eventId: string,
  input: CalendarEventInput
): Promise<MutateEventResult> {
  let access;
  try {
    access = await requireCap(businessId, "write" as Cap);
  } catch (e) {
    if (e instanceof AccessDenied) return fromAccessFail(e.detail);
    throw e;
  }

  const sb = getServerSupabase();
  const existing = await loadEvent(sb, businessId, eventId);
  if (!existing) return fail("not-found", "일정을 찾을 수 없습니다.");
  if (isDerivedEvent({ sourceTable: existing.source_table, sourceId: existing.source_id })) {
    return fail(
      "readonly-derived",
      "이 일정은 원 업무 레코드에서 만들어졌습니다. 캘린더에서 직접 수정할 수 없고 원 업무에서 변경해야 합니다.",
      { sourceTable: existing.source_table, sourceId: existing.source_id }
    );
  }

  const allowedKinds = INDUSTRY_DEFS[access.industry].eventKinds.map((k) => k.kind);
  const v = validateInput(input, allowedKinds);
  if (!v.ok) return fail("validation", v.message);

  const r = await mustAffect<RawRow>(
    sb.schema("crm").from("calendar_events").update(toRow(businessId, input)).eq("business_id", businessId).eq("id", eventId),
    "*"
  );
  if (!r.ok) {
    if (r.error) return fail("error", pgMessage(r.error, "일정을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    return fail("forbidden", "수정 권한이 없거나 이미 삭제된 일정입니다.");
  }

  revalidatePath(`/w/${businessId}/calendar`);
  return { ok: true, event: mapRow(r.rows[0]) };
}

/** 상태만 바꾼다(완료 처리 등). 파생 일정은 여전히 막는다 — 상태는 원 업무 쪽 진행상황과 얽혀 있다. */
export async function updateEventStatus(
  businessId: string,
  eventId: string,
  status: string
): Promise<MutateEventResult> {
  if (!STATUS_VALUES.includes(status)) return fail("validation", "알 수 없는 상태값입니다.");

  let access;
  try {
    access = await requireCap(businessId, "write" as Cap);
  } catch (e) {
    if (e instanceof AccessDenied) return fromAccessFail(e.detail);
    throw e;
  }
  void access;

  const sb = getServerSupabase();
  const existing = await loadEvent(sb, businessId, eventId);
  if (!existing) return fail("not-found", "일정을 찾을 수 없습니다.");
  if (isDerivedEvent({ sourceTable: existing.source_table, sourceId: existing.source_id })) {
    return fail(
      "readonly-derived",
      "이 일정은 원 업무 레코드에서 만들어졌습니다. 상태 변경은 원 업무에서 해야 합니다.",
      { sourceTable: existing.source_table, sourceId: existing.source_id }
    );
  }

  const r = await mustAffect<RawRow>(
    sb.schema("crm").from("calendar_events").update({ status }).eq("business_id", businessId).eq("id", eventId),
    "*"
  );
  if (!r.ok) {
    if (r.error) return fail("error", pgMessage(r.error, "상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    return fail("forbidden", "변경 권한이 없거나 이미 삭제된 일정입니다.");
  }

  revalidatePath(`/w/${businessId}/calendar`);
  return { ok: true, event: mapRow(r.rows[0]) };
}

export type DeleteEventResult = { ok: true } | { ok: false; reason: MutateReason; message: string };

export async function deleteEvent(businessId: string, eventId: string): Promise<DeleteEventResult> {
  let access;
  try {
    access = await requireCap(businessId, "delete" as Cap);
  } catch (e) {
    if (e instanceof AccessDenied) {
      const m = fromAccessFail(e.detail);
      return m.ok ? { ok: true } : { ok: false, reason: m.reason, message: m.message };
    }
    throw e;
  }
  void access;

  const sb = getServerSupabase();
  const existing = await loadEvent(sb, businessId, eventId);
  if (!existing) return { ok: false, reason: "not-found", message: "일정을 찾을 수 없습니다." };
  if (isDerivedEvent({ sourceTable: existing.source_table, sourceId: existing.source_id })) {
    return {
      ok: false,
      reason: "readonly-derived",
      message: "이 일정은 원 업무 레코드에서 만들어졌습니다. 취소는 원 업무에서 해야 합니다.",
    };
  }

  const r = await mustAffect(sb.schema("crm").from("calendar_events").delete().eq("business_id", businessId).eq("id", eventId));
  if (!r.ok) {
    if (r.error) return { ok: false, reason: "error", message: pgMessage(r.error, "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.") };
    return { ok: false, reason: "forbidden", message: "삭제 권한이 없거나 이미 삭제된 일정입니다." };
  }

  revalidatePath(`/w/${businessId}/calendar`);
  return { ok: true };
}
