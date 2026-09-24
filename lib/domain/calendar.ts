/**
 * 전 업종 공통 캘린더 — 서버 조회 데이터 레이어.
 *
 * ⚠ 이 파일은 getServerSupabase()(next/headers)를 쓴다. Server Component/Action
 * 에서만 import할 것 — 클라이언트 컴포넌트는 lib/domain/calendar-shared.ts를 쓴다.
 *
 * 계약 준수:
 *  - §5.1/§5.3: 여기서도 checkAccess()로 다시 판정한다. 레이아웃 통과를 믿지 않는다.
 *  - §5.5: 오류·권한부족·정상 빈 결과를 서로 다른 값으로 돌려준다(빈 배열로 덮지 않음).
 *  - §4: 조회 구간은 [from, to) 반개구간. all_day 이벤트는 event_date(날짜 컬럼)로만
 *    걸러서 tz 변환으로 하루가 밀리는 일이 없게 한다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { checkAccess, type AccessFail } from "@/lib/auth/access";
import { dayKeyInTz, compareInstants } from "@/lib/utils/datetime";
import { mapRow, effectiveStart, type RawRow, type CalendarEvent, type MemberOption } from "./calendar-shared";

export * from "./calendar-shared";

export interface ListEventsFilter {
  /** UTC ISO, 포함 시작 */
  from: string;
  /** UTC ISO, 배타적 끝 */
  to: string;
  kinds?: string[];
  /** 특정 담당자 uuid, 또는 "unassigned"(미배정만) */
  assignee?: string;
  status?: string;
  /** 제목·메모 부분일치 검색(대소문자 무시) */
  q?: string;
}

export type ListEventsResult = { ok: true; events: CalendarEvent[] } | AccessFail;

export async function listEvents(
  businessId: string,
  filter: ListEventsFilter,
  tz: string
): Promise<ListEventsResult> {
  const access = await checkAccess(businessId, "view");
  if (!access.ok) return access;

  const sb = getServerSupabase();

  let timedQ = sb
    .schema("crm")
    .from("calendar_events")
    .select("*")
    .eq("business_id", businessId)
    .eq("all_day", false)
    .lt("starts_at", filter.to)
    // 겹침 규칙: ends_at이 있으면 ends_at >= from, 없으면(순간 이벤트) starts_at >= from.
    .or(`ends_at.gte.${filter.from},and(ends_at.is.null,starts_at.gte.${filter.from})`);

  const fromKey = dayKeyInTz(filter.from, tz);
  const toKeyExclusive = dayKeyInTz(filter.to, tz);
  let allDayQ = sb
    .schema("crm")
    .from("calendar_events")
    .select("*")
    .eq("business_id", businessId)
    .eq("all_day", true)
    .gte("event_date", fromKey)
    .lt("event_date", toKeyExclusive);

  if (filter.kinds && filter.kinds.length > 0) {
    timedQ = timedQ.in("kind", filter.kinds);
    allDayQ = allDayQ.in("kind", filter.kinds);
  }
  if (filter.status) {
    timedQ = timedQ.eq("status", filter.status);
    allDayQ = allDayQ.eq("status", filter.status);
  }
  if (filter.assignee === "unassigned") {
    timedQ = timedQ.is("assignee", null);
    allDayQ = allDayQ.is("assignee", null);
  } else if (filter.assignee) {
    timedQ = timedQ.eq("assignee", filter.assignee);
    allDayQ = allDayQ.eq("assignee", filter.assignee);
  }

  const [timedRes, allDayRes] = await Promise.all([timedQ, allDayQ]);
  if (timedRes.error) return { ok: false, reason: "error", message: timedRes.error.message };
  if (allDayRes.error) return { ok: false, reason: "error", message: allDayRes.error.message };

  let events = [...(timedRes.data as RawRow[]), ...(allDayRes.data as RawRow[])].map(mapRow);

  if (filter.q && filter.q.trim()) {
    const q = filter.q.trim().toLowerCase();
    events = events.filter(
      (e) => e.title.toLowerCase().includes(q) || (e.notes ?? "").toLowerCase().includes(q)
    );
  }

  events.sort((a, b) => compareInstants(effectiveStart(a, tz), effectiveStart(b, tz)));

  return { ok: true, events };
}

export type ListMembersResult = { ok: true; members: MemberOption[] } | AccessFail;

/**
 * 담당자 지정용 사업장 소속원 목록 — crm.business_members(0016) RPC. 표시이름은 서버가
 * auth.users 메타에서 만들어 주고, 이메일은 staff.manage 보유자에게만 채워지므로 여기서는 쓰지 않는다.
 */
export async function listAssignableMembers(businessId: string): Promise<ListMembersResult> {
  const access = await checkAccess(businessId, "view");
  if (!access.ok) return access;

  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("business_members", { p_business: businessId });

  if (error) return { ok: false, reason: "error", message: error.message };

  const rows = (data ?? []) as { user_id: string; display_name: string; role: string; status: string }[];
  return {
    ok: true,
    members: rows
      .filter((r) => r.status === "active")
      .map((r) => ({ userId: r.user_id, role: r.role, isSelf: r.user_id === access.userId, displayName: r.display_name })),
  };
}
