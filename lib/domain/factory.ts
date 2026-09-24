/**
 * 의류공장 도메인 조회. 전부 서버에서만 실행되고(schema('crm')), RLS가 그대로 적용된다.
 *
 * lib/domain/rental.ts와 같은 관례를 따른다: 여기서는 권한 판정을 새로 만들지 않는다 —
 * 호출부(page.tsx)가 이미 getAccess(businessId, cap)로 확인했거나, 컬럼/뷰 자체가
 * DB에서 게이팅되어 있다(materials.unit_cost → v_materials_cost, 0007_factory.sql).
 *
 * "use server" 지시어를 붙이지 않는다 — next/headers(getServerSupabase)를 쓰므로
 * Server Component/factory-actions.ts에서만 직접 import한다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { mapMaterialRow } from "./factory-materials";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import type { FactoryFieldDef, OptionValue } from "./factory-options";
import { FACTORY_OPTION_FIELDS } from "./factory-options";
import type {
  ReadResult,
  FactoryOrderType,
  FactoryOrderStatus,
  FactoryProcessStage,
  FactoryProcessStatus,
  FactoryOrderRow,
  FittingLogRow,
  FactoryProcessRow,
  MaterialOption,
  ProcessBoardRow,
  FactoryTodaySummary,
} from "./factory-types";

// "use client" 컴포넌트는 이 파일(next/headers 사용)을 직접 import하면 안 된다 —
// 타입/상수는 반드시 factory-types.ts에서 가져갈 것. rental.ts/rental-types.ts와 동일 관례.
export * from "./factory-types";

function toOrder(row: Record<string, unknown>): FactoryOrderRow {
  const customer = (row.customers ?? null) as { name?: string } | null;
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    orderNo: row.order_no as string,
    customerId: (row.customer_id as string) ?? null,
    customerName: customer?.name ?? null,
    type: row.type as FactoryOrderType,
    status: row.status as FactoryOrderStatus,
    orderDate: row.order_date as string,
    fittingDate: (row.fitting_date as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    deliveredDate: (row.delivered_date as string) ?? null,
    options: (row.options as Record<string, OptionValue>) ?? {},
    qty: (row.qty as Record<string, number>) ?? {},
    supply: row.supply as number,
    vat: row.vat as number,
    total: row.total as number,
    assignedTo: (row.assigned_to as string) ?? null,
    memo: (row.memo as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// 0025: supply/vat/total 은 revenue.read 없으면 DB 열 권한이 막는다 → 읽기는 v_factory_orders(권한 없으면 null).
const ORDER_SELECT = "*, customers(id,name)";

export interface FactoryOrderFilters {
  q?: string;
  status?: FactoryOrderStatus[];
  type?: FactoryOrderType[];
  /** 'due_asc'(기본, 납기 임박순) | 'created_desc'(최근 등록순) */
  sort?: "due_asc" | "created_desc";
  /** due_date 정확히 일치(YYYY-MM-DD). 홈 "오늘 납기" 지표와 짝. */
  dueDate?: string;
  /** 특정 고객의 주문만(고객 상세 이력 등). */
  customerId?: string;
}

/** ilike 패턴에 %/_/\\ 가 그대로 들어가면 와일드카드로 해석되므로 이스케이프한다. */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listFactoryOrders(
  businessId: string,
  filters: FactoryOrderFilters = {}
): Promise<ReadResult<FactoryOrderRow[]>> {
  const sb = getServerSupabase();
  let q = sb
    .schema("crm")
    .from("v_factory_orders")
    .select(ORDER_SELECT)
    .eq("business_id", businessId)
    .limit(300);

  if (filters.status?.length) q = q.in("status", filters.status);
  if (filters.type?.length) q = q.in("type", filters.type);
  if (filters.dueDate) q = q.eq("due_date", filters.dueDate);
  if (filters.customerId) q = q.eq("customer_id", filters.customerId);

  // 결함 CLICK-PATH-109: 예전엔 limit(300) 후 JS로 검색했다 — 300건을 넘는 사업장은 뒤쪽
  // 주문이 검색 대상에서 통째로 빠졌다. 이제 서버(ilike/in)에서 걸러 limit(300) 전에 적용한다.
  const needle = filters.q?.trim();
  if (needle) {
    const pattern = `%${escapeIlike(needle)}%`;
    const custRes = await sb
      .schema("crm")
      .from("customers")
      .select("id")
      .eq("business_id", businessId)
      .ilike("name", pattern)
      .limit(500);
    if (custRes.error) return { ok: false, message: custRes.error.message };
    const custIds = (custRes.data ?? []).map((c) => c.id as string);
    const orParts = [`order_no.ilike.${pattern}`];
    if (custIds.length) orParts.push(`customer_id.in.(${custIds.join(",")})`);
    q = q.or(orParts.join(","));
  }

  if (filters.sort === "created_desc") {
    q = q.order("created_at", { ascending: false });
  } else {
    q = q.order("due_date", { ascending: true, nullsFirst: false });
  }

  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };

  return { ok: true, data: (data ?? []).map(toOrder) };
}

export async function getFactoryOrder(
  businessId: string,
  orderId: string
): Promise<ReadResult<{ order: FactoryOrderRow; processes: FactoryProcessRow[]; fittingLogs: FittingLogRow[] }>> {
  const sb = getServerSupabase();
  const [orderRes, procRes, fitRes] = await Promise.all([
    sb.schema("crm").from("v_factory_orders").select(ORDER_SELECT).eq("business_id", businessId).eq("id", orderId).maybeSingle(),
    sb.schema("crm").from("factory_processes").select("*").eq("business_id", businessId).eq("order_id", orderId),
    sb.schema("crm").from("fitting_logs").select("*").eq("business_id", businessId).eq("order_id", orderId).order("at", { ascending: false }),
  ]);
  if (orderRes.error) return { ok: false, message: orderRes.error.message };
  if (!orderRes.data) return { ok: false, message: "주문을 찾을 수 없습니다." };
  if (procRes.error) return { ok: false, message: procRes.error.message };
  if (fitRes.error) return { ok: false, message: fitRes.error.message };

  const processes: FactoryProcessRow[] = (procRes.data ?? []).map((r) => ({
    id: r.id as string,
    orderId: r.order_id as string,
    stage: r.stage as FactoryProcessStage,
    plannedMinutes: (r.planned_minutes as number) ?? null,
    actualMinutes: (r.actual_minutes as number) ?? null,
    assignee: (r.assignee as string) ?? null,
    startedAt: (r.started_at as string) ?? null,
    finishedAt: (r.finished_at as string) ?? null,
    status: r.status as FactoryProcessStatus,
  }));
  const fittingLogs: FittingLogRow[] = (fitRes.data ?? []).map((r) => ({
    id: r.id as string,
    orderId: r.order_id as string,
    at: r.at as string,
    notes: (r.notes as string) ?? null,
    photoPaths: (r.photo_paths as string[]) ?? [],
  }));

  return { ok: true, data: { order: toOrder(orderRes.data), processes, fittingLogs } };
}

/**
 * 공정 칸반 행. 접수·진행중 주문 전부 + 최근 14일 출고(완료) 주문 — 완료 열에서 "완료 취소(재개)" 할 수 있게(0021).
 * 완료 주문은 orderStatus === '완료' 로 구분한다.
 */
export async function listProcessBoard(businessId: string, tz = "Asia/Seoul"): Promise<ReadResult<ProcessBoardRow[]>> {
  const sb = getServerSupabase();
  const recentSince = addDaysToKey(todayKeyInTz(tz), -14);
  const { data, error } = await sb
    .schema("crm")
    .from("factory_processes")
    .select("*, factory_orders!inner(order_no,status,due_date,delivered_date,business_id,customers(name))")
    .eq("business_id", businessId)
    .or(`status.in.(접수,진행중),and(status.eq.완료,delivered_date.gte.${recentSince})`, { referencedTable: "factory_orders" })
    .order("stage", { ascending: true });
  if (error) return { ok: false, message: error.message };

  const rows: ProcessBoardRow[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const order = (row.factory_orders ?? {}) as Record<string, unknown>;
    const customer = (order.customers ?? null) as { name?: string } | null;
    return {
      id: row.id as string,
      orderId: row.order_id as string,
      stage: row.stage as FactoryProcessStage,
      plannedMinutes: (row.planned_minutes as number) ?? null,
      actualMinutes: (row.actual_minutes as number) ?? null,
      assignee: (row.assignee as string) ?? null,
      startedAt: (row.started_at as string) ?? null,
      finishedAt: (row.finished_at as string) ?? null,
      status: row.status as FactoryProcessStatus,
      orderNo: (order.order_no as string) ?? "",
      customerName: customer?.name ?? null,
      dueDate: (order.due_date as string) ?? null,
      orderStatus: order.status as FactoryOrderStatus,
    };
  });
  return { ok: true, data: rows };
}

/** 원단/안감/단추 재고 — cost.read 없으면 v_materials가 unit_cost를 자체적으로 뺀다. */
export async function listMaterials(
  businessId: string,
  kind?: "fabric" | "lining" | "button"
): Promise<ReadResult<MaterialOption[]>> {
  const sb = getServerSupabase();
  let q = sb.schema("crm").from("v_materials").select("*").eq("business_id", businessId).eq("active", true);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map((r) => mapMaterialRow(r as Record<string, unknown>)) };
}


/**
 * 대시보드용 오늘 현황. 가짜 지표 없음 — 전부 실제 쿼리 결과.
 *
 * ⚠ "미발행 정산"은 0007_factory.sql에 발행 여부 컬럼이 없어 그대로 구현할 수 없다
 *   (정산은 다른 에이전트 소유 도메인이고, 공장 스키마엔 세금계산서 발행 플래그가 없다).
 *   대신 이번 달 완료된 주문의 매출 합계(completedThisMonth)로 대체했다 — 미해결 사항 참고.
 */
export async function getFactoryToday(
  businessId: string,
  tz = "Asia/Seoul"
): Promise<ReadResult<FactoryTodaySummary>> {
  const sb = getServerSupabase();
  const today = todayKeyInTz(tz);
  const weekEnd = addDaysToKey(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [fittingRes, dueRes, doingRes, materialsRes, completedRes] = await Promise.all([
    sb.schema("crm").from("factory_orders").select("id,order_no,customers(name)").eq("business_id", businessId).eq("fitting_date", today),
    sb
      .schema("crm")
      .from("factory_orders")
      .select("id,order_no,due_date,customers(name)")
      .eq("business_id", businessId)
      .gte("due_date", today)
      .lte("due_date", weekEnd)
      .not("status", "in", "(완료,취소)"),
    sb
      .schema("crm")
      .from("factory_processes")
      .select("id,order_id,stage,started_at,planned_minutes,factory_orders(order_no)")
      .eq("business_id", businessId)
      .eq("status", "doing")
      .not("started_at", "is", null)
      .not("planned_minutes", "is", null),
    listMaterials(businessId),
    sb
      .schema("crm")
      .from("v_factory_orders")
      .select("supply", { count: "exact" })
      .eq("business_id", businessId)
      .eq("status", "완료")
      .gte("delivered_date", monthStart),
  ]);

  if (fittingRes.error) return { ok: false, message: fittingRes.error.message };
  if (dueRes.error) return { ok: false, message: dueRes.error.message };
  if (doingRes.error) return { ok: false, message: doingRes.error.message };
  if (!materialsRes.ok) return { ok: false, message: materialsRes.message };
  if (completedRes.error) return { ok: false, message: completedRes.error.message };

  const now = Date.now();
  const delayedProcesses = ((doingRes.data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const startedAt = r.started_at as string;
      const plannedMinutes = r.planned_minutes as number;
      const elapsedMinutes = Math.round((now - new Date(startedAt).getTime()) / 60000);
      const order = (r.factory_orders ?? {}) as { order_no?: string };
      return {
        orderId: r.order_id as string,
        orderNo: order.order_no ?? "",
        stage: r.stage as FactoryProcessStage,
        startedAt,
        plannedMinutes,
        elapsedMinutes,
      };
    })
    .filter((r) => r.elapsedMinutes > r.plannedMinutes);

  const completedRows = (completedRes.data ?? []) as { supply: number }[];

  return {
    ok: true,
    data: {
      fittingsToday: ((fittingRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        orderId: r.id as string,
        orderNo: r.order_no as string,
        customerName: ((r.customers ?? null) as { name?: string } | null)?.name ?? null,
      })),
      dueThisWeek: ((dueRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        orderId: r.id as string,
        orderNo: r.order_no as string,
        customerName: ((r.customers ?? null) as { name?: string } | null)?.name ?? null,
        dueDate: r.due_date as string,
      })),
      delayedProcesses,
      lowStockMaterials: materialsRes.data.filter((m) => m.stock <= m.minStock),
      completedThisMonth: {
        count: completedRows.length,
        totalSupply: completedRows.reduce((sum, r) => sum + (r.supply ?? 0), 0),
      },
    },
  };
}

export function optionFieldsFor(): FactoryFieldDef[] {
  return FACTORY_OPTION_FIELDS;
}
