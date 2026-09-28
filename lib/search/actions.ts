/**
 * ⌘K 전역 검색 서버 액션. 사용자 세션 클라이언트라 RLS 가 그대로 적용된다.
 * 읽는 열은 이름·번호·상태·날짜뿐이다 — 금액·전화는 마스킹 뷰(crm.v_*)에도 아예 요청하지 않는다.
 * 업종별 대상: 고객(이름) · 렌탈 예약(고객명) · 공장 주문(번호·고객) · 학생(이름) · 미용실 예약(고객명) · 무인 상품(이름·SKU).
 * 메뉴 항목은 셸이 클라이언트에서 거른다(서버 왕복 없음).
 */
"use server";

import { checkAccess, accessMessage } from "@/lib/auth/access";
import { getServerSupabase } from "@/lib/supabase/server";
import { listFactoryOrders } from "@/lib/domain/factory";
import { RESERVATION_STATUS_LABEL, type ReservationStatus } from "@/lib/domain/rental-types";
import { formatInTz } from "@/lib/utils/datetime";
import type { SearchGroup, SearchHit, SearchResult } from "./types";

const LIMIT = 8;

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** tstzrange 텍스트의 시작 시각만 뽑는다(lib/domain/rental.ts splitRange 와 같은 규칙). */
function rangeStart(period: string): string {
  return period.slice(1, period.indexOf(",")).replace(/"/g, "");
}

export async function searchWorkspace(businessId: string, q: string): Promise<SearchResult> {
  const access = await checkAccess(businessId, "view");
  if (!access.ok) return { ok: false, message: accessMessage(access).title };

  const needle = q.trim().slice(0, 60);
  if (!needle) return { ok: true, groups: [] };
  const pattern = `%${escapeIlike(needle)}%`;
  const sb = getServerSupabase();
  const base = `/w/${businessId}`;
  const tz = access.timezone;
  const tasks: Promise<SearchGroup | null>[] = [];

  if (access.industry !== "unmanned" && access.industry !== "academy") {
    tasks.push(
      (async () => {
        const { data, error } = await sb
          .schema("crm")
          .from("v_customers")
          .select("id,name,legacy_no")
          .eq("business_id", businessId)
          .ilike("name", pattern)
          .order("name")
          .limit(LIMIT);
        if (error) throw error;
        const hits: SearchHit[] = (data ?? []).map((r) => ({
          id: r.id as string,
          title: r.name as string,
          subtitle: (r.legacy_no as string | null) ?? undefined,
          href: `${base}/customers/${r.id}`,
        }));
        return { key: "customers", label: "고객", hits };
      })()
    );
  }

  switch (access.industry) {
    case "rental":
      tasks.push(
        (async () => {
          const { data, error } = await sb
            .schema("crm")
            .from("v_rental_reservations")
            .select("id,customer_name,status,period")
            .eq("business_id", businessId)
            .ilike("customer_name", pattern)
            .order("created_at", { ascending: false })
            .limit(LIMIT);
          if (error) throw error;
          const hits: SearchHit[] = (data ?? []).map((r) => ({
            id: r.id as string,
            title: (r.customer_name as string | null) ?? "고객 미지정",
            subtitle: `${RESERVATION_STATUS_LABEL[r.status as ReservationStatus] ?? r.status} · 대여 ${formatInTz(rangeStart(r.period as string), tz, "M.d")}`,
            href: `${base}/reservations/${r.id}`,
          }));
          return { key: "reservations", label: "렌탈 예약", hits };
        })()
      );
      break;
    case "factory":
      tasks.push(
        (async () => {
          const r = await listFactoryOrders(businessId, { q: needle, sort: "created_desc" });
          if (!r.ok) throw new Error(r.message);
          const hits: SearchHit[] = r.data.slice(0, LIMIT).map((o) => ({
            id: o.id,
            title: o.orderNo,
            subtitle: [o.customerName, o.status, o.dueDate ? `납기 ${o.dueDate}` : null].filter(Boolean).join(" · "),
            href: `${base}/orders/${o.id}`,
          }));
          return { key: "orders", label: "주문", hits };
        })()
      );
      break;
    case "academy":
      tasks.push(
        (async () => {
          const { data, error } = await sb
            .schema("crm")
            .from("v_acad_students")
            .select("id,name,grade,active")
            .eq("business_id", businessId)
            .ilike("name", pattern)
            .order("name")
            .limit(LIMIT);
          if (error) throw error;
          const hits: SearchHit[] = (data ?? []).map((r) => ({
            id: r.id as string,
            title: r.name as string,
            subtitle: [r.grade as string | null, r.active ? null : "휴원"].filter(Boolean).join(" · ") || undefined,
            href: `${base}/students/${r.id}`,
          }));
          return { key: "students", label: "학생", hits };
        })()
      );
      break;
    case "salon":
      tasks.push(
        (async () => {
          const { data, error } = await sb
            .schema("crm")
            .from("v_salon_appointments")
            .select("id,start_at,status,customers!inner(name),salon_services(name)")
            .eq("business_id", businessId)
            .ilike("customers.name", pattern)
            .order("start_at", { ascending: false })
            .limit(LIMIT);
          if (error) throw error;
          const hits: SearchHit[] = (data ?? []).map((r) => {
            const cust = r.customers as unknown as { name?: string } | null;
            const svc = r.salon_services as unknown as { name?: string } | null;
            return {
              id: r.id as string,
              title: `${cust?.name ?? "고객"} · ${svc?.name ?? "시술"}`,
              subtitle: `${r.status} · ${formatInTz(r.start_at as string, tz, "M.d HH:mm")}`,
              // 미용실 예약은 상세 화면이 없다 — 예약 목록(전체) 으로 보낸다.
              href: `${base}/services?date=all`,
            };
          });
          return { key: "appointments", label: "미용실 예약", hits };
        })()
      );
      break;
    case "unmanned":
      tasks.push(
        (async () => {
          const { data, error } = await sb
            .schema("crm")
            .from("v_us_products")
            .select("id,name,sku,active")
            .eq("business_id", businessId)
            .or(`name.ilike.${pattern},sku.ilike.${pattern}`)
            .order("name")
            .limit(LIMIT);
          if (error) throw error;
          const hits: SearchHit[] = (data ?? []).map((r) => ({
            id: r.id as string,
            title: r.name as string,
            subtitle: [`SKU ${r.sku}`, r.active ? null : "판매중지"].filter(Boolean).join(" · "),
            // 상품 상세 화면이 없다 — 상품 목록으로 보낸다.
            href: `${base}/products`,
          }));
          return { key: "products", label: "상품", hits };
        })()
      );
      break;
  }

  try {
    const groups = (await Promise.all(tasks)).filter((g): g is SearchGroup => !!g && g.hits.length > 0);
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "검색하지 못했습니다." };
  }
}
