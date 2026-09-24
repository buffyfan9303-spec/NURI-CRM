/**
 * 렌탈 도메인 조회. 전부 서버에서만 실행되고(schema('crm')), RLS가 그대로 적용된다.
 * 여기서는 어떤 권한 판정도 새로 만들지 않는다 — 호출부(page.tsx)가 requireCap/getAccess로
 * 이미 확인했거나, 컬럼/뷰 자체가 DB에서 게이팅되어 있다(rental_units.purchase_cost,
 * customers.phone/email 등 — 0006_customers.sql).
 *
 * "use server" 지시어를 일부러 붙이지 않는다 — 이 모듈은 next/headers(getServerSupabase)를
 * 쓰므로 클라이언트 번들에 들어가면 빌드가 깨진다. Server Component(page.tsx)와
 * rental-actions.ts에서만 직접 import한다. 클라이언트 컴포넌트는 타입/라벨 상수를
 * lib/domain/rental-types.ts에서 가져간다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import { ilikePattern } from "@/lib/db/ilike";
import { todayRangeISO } from "./home";
import type {
  UnitStatus,
  ItemStatus,
  PaymentStatus,
  ReservationStatus,
  ReservationRow,
  ReservationItemRow,
  ReservationBalance,
  CareJobRow,
  CustomerRow,
  ProductWithChildren,
  RentalUnit,
  RentalSku,
  ReadResult,
  ReservationFilters,
  UnitPickerRow,
  DamageClaimRow,
  ClaimInvoice,
  LedgerEntryRow,
  ClaimKind,
  SwapCandidateRow,
  CustomerMeasurementRow,
  RentalToday,
} from "./rental-types";
export * from "./rental-types";

// ── 파싱 헬퍼 ──────────────────────────────────────────────────────

/** postgres tstzrange 텍스트("[2027-06-01 00:00:00+09,2027-06-03 00:00:00+09)")를 [start,end)로 분해. */
function splitRange(period: string): { start: string; end: string } {
  const inner = period.slice(1, -1);
  const idx = inner.indexOf(",");
  return { start: inner.slice(0, idx).replace(/"/g, ""), end: inner.slice(idx + 1).replace(/"/g, "") };
}

function toItem(row: Record<string, unknown>): ReservationItemRow {
  const product = (row.rental_products ?? {}) as { name?: string; code?: string };
  const sku = (row.rental_skus ?? {}) as { color?: string; size?: string };
  const unit = (row.rental_units ?? {}) as { unit_code?: string; status?: UnitStatus };
  return {
    id: row.id as string,
    reservationId: row.reservation_id as string,
    productId: row.product_id as string,
    productName: product.name ?? "",
    productCode: product.code ?? "",
    skuId: (row.sku_id as string) ?? null,
    skuColor: sku.color ?? null,
    skuSize: sku.size ?? null,
    unitId: (row.unit_id as string) ?? null,
    unitCode: unit.unit_code ?? null,
    unitStatus: unit.status ?? null,
    qty: row.qty as number,
    fee: row.fee as number,
    discount: row.discount as number,
    itemStatus: row.item_status as ItemStatus,
  };
}

function toReservation(row: Record<string, unknown>): ReservationRow {
  const { start, end } = splitRange(row.period as string);
  const items = ((row.rental_reservation_items as Record<string, unknown>[]) ?? []).map(toItem);
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    customerRef: (row.customer_ref as string) ?? null,
    customerName: (row.customer_name as string) ?? null,
    customerPhone: (row.customer_phone as string) ?? null,
    status: row.status as ReservationStatus,
    periodStart: start,
    periodEnd: end,
    fittingAt: (row.fitting_at as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: row.created_at as string,
    items,
  };
}

// 0025: rental_reservations.customer_phone 은 pii.read, 항목 fee/discount 는 revenue.read 가 없으면 DB(열 권한)가 막는다.
// 읽기는 같은 모양의 뷰(v_*)로 간다 — 권한이 없으면 그 열이 null 로 온다(select * 가 테이블에서는 42501).
const RESERVATION_SELECT =
  "*, rental_reservation_items:v_rental_reservation_items(*, rental_products(name,code), rental_skus(color,size), rental_units(unit_code,status))";

// ── 조회 ──────────────────────────────────────────────────────────

export async function listReservations(
  businessId: string,
  filters: ReservationFilters = {}
): Promise<ReadResult<ReservationRow[]>> {
  const sb = getServerSupabase();
  let q = sb
    .schema("crm")
    .from("v_rental_reservations")
    .select(RESERVATION_SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status?.length) q = q.in("status", filters.status);
  if (filters.customerRef) q = q.eq("customer_ref", filters.customerRef);
  // 검색어의 % _ \ , ( ) 를 그대로 넣으면 와일드카드·필터 구분자로 해석된다(CLICK-PATH-229) — 공장 목록과 같은 정리.
  const customerPattern = ilikePattern(filters.customer);
  if (customerPattern) {
    q = q.or(`customer_name.ilike.${customerPattern},customer_phone.ilike.${customerPattern}`);
  }
  if (filters.from && filters.to) {
    q = q.filter("period", "ov", `[${filters.from},${filters.to})`);
  }

  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };

  let rows = (data ?? []).map(toReservation);
  if (filters.productId) {
    rows = rows.filter((r) => r.items.some((i) => i.productId === filters.productId));
  }
  // period(tstzrange) 자체엔 "끝만" 걸리는 필터가 없어(overlap은 시작도 걸린다) JS에서 건다 —
  // 홈의 "오늘 반납/피팅" 지표와 정확히 같은 건수가 나오게 하려면 이 경계 계산이어야 한다.
  if (filters.returnFrom && filters.returnTo) {
    rows = rows.filter((r) => r.periodEnd >= filters.returnFrom! && r.periodEnd < filters.returnTo!);
  }
  if (filters.fittingFrom && filters.fittingTo) {
    rows = rows.filter((r) => r.fittingAt && r.fittingAt >= filters.fittingFrom! && r.fittingAt < filters.fittingTo!);
  }
  return { ok: true, data: rows };
}

export async function getReservation(
  businessId: string,
  reservationId: string
): Promise<ReadResult<ReservationRow>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("v_rental_reservations")
    .select(RESERVATION_SELECT)
    .eq("business_id", businessId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "예약을 찾을 수 없습니다." };
  return { ok: true, data: toReservation(data) };
}

/** revenue.read 없으면 서버가 { masked: true }만 돌려준다(0004_ledger.sql mask_balance). */
export async function getReservationBalance(
  reservationId: string
): Promise<ReadResult<ReservationBalance | { masked: true }>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("reservation_balance", {
    p_reservation: reservationId,
  });
  if (error) {
    if (error.code === "42501") return { ok: true, data: { masked: true } };
    return { ok: false, message: error.message };
  }
  const b = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      cashReceived: b.cash_received as number,
      rentalRevenue: b.rental_revenue as number,
      depositBalance: b.deposit_balance as number,
      lateFee: b.late_fee as number,
      damageCharge: b.damage_charge as number,
      discount: b.discount as number,
      outstanding: b.outstanding as number,
      paymentStatus: b.payment_status as PaymentStatus,
    },
  };
}

function toUnit(u: Record<string, unknown>): RentalUnit {
  return {
    id: u.id as string,
    businessId: u.business_id as string,
    skuId: u.sku_id as string,
    unitCode: u.unit_code as string,
    qrPayload: (u.qr_payload as string) ?? null,
    location: (u.location as string) ?? null,
    status: u.status as UnitStatus,
    photoUrl: (u.photo_url as string) ?? null,
    acquiredOn: (u.acquired_on as string) ?? null,
    measurements: (u.measurements as Record<string, unknown>) ?? {},
    notes: (u.notes as string) ?? null,
  };
}

/**
 * 상품→SKU→개체 3계층을 조립한다. v_rental_units는 뷰라 PostgREST 중첩 임베딩을
 * 신뢰하지 않고, 3개의 평범한 쿼리를 따로 던져 JS에서 직접 조립한다 — 더 장황하지만
 * "이게 실제로 동작하는지" 확신할 수 있는 쪽을 택했다.
 */
export async function listProducts(
  businessId: string
): Promise<ReadResult<ProductWithChildren[]>> {
  const sb = getServerSupabase();
  const { data: productRows, error: pErr } = await sb
    .schema("crm")
    .from("rental_products")
    .select("*, rental_product_parts(*)")
    .eq("business_id", businessId)
    .order("code");
  if (pErr) return { ok: false, message: pErr.message };

  const productIds = (productRows ?? []).map((p) => (p as Record<string, unknown>).id as string);
  const { data: skuRows, error: sErr } =
    productIds.length === 0
      ? { data: [] as Record<string, unknown>[], error: null }
      : await sb.schema("crm").from("rental_skus").select("*").in("product_id", productIds);
  if (sErr) return { ok: false, message: sErr.message };

  const skuIds = (skuRows ?? []).map((s) => (s as Record<string, unknown>).id as string);
  const { data: unitRows, error: uErr } =
    skuIds.length === 0
      ? { data: [] as Record<string, unknown>[], error: null }
      : await sb.schema("crm").from("v_rental_units").select("*").in("sku_id", skuIds);
  if (uErr) return { ok: false, message: uErr.message };

  const unitsBySku = new Map<string, RentalUnit[]>();
  for (const u of unitRows ?? []) {
    const row = u as Record<string, unknown>;
    const list = unitsBySku.get(row.sku_id as string) ?? [];
    list.push(toUnit(row));
    unitsBySku.set(row.sku_id as string, list);
  }

  const skusByProduct = new Map<string, (RentalSku & { units: RentalUnit[] })[]>();
  for (const s of skuRows ?? []) {
    const row = s as Record<string, unknown>;
    const sku = {
      id: row.id as string,
      productId: row.product_id as string,
      color: row.color as string,
      size: row.size as string,
      barcode: (row.barcode as string) ?? null,
      units: unitsBySku.get(row.id as string) ?? [],
    };
    const list = skusByProduct.get(sku.productId) ?? [];
    list.push(sku);
    skusByProduct.set(sku.productId, list);
  }

  const products: ProductWithChildren[] = (productRows ?? []).map((p) => {
    const row = p as Record<string, unknown>;
    return {
      id: row.id as string,
      businessId: row.business_id as string,
      code: row.code as string,
      name: row.name as string,
      category: row.category as string,
      baseFee: row.base_fee as number,
      depositAmount: row.deposit_amount as number,
      careBufferHours: row.care_buffer_hours as number,
      active: row.active as boolean,
      skus: skusByProduct.get(row.id as string) ?? [],
      parts: ((row.rental_product_parts as Record<string, unknown>[]) ?? []).map((pp) => ({
        id: pp.id as string,
        productId: pp.product_id as string,
        partName: pp.part_name as string,
        required: pp.required as boolean,
        sort: pp.sort as number,
      })),
    };
  });
  return { ok: true, data: products };
}

/** cost.read 보유자만 원가 컬럼을 채워 돌려준다. 없으면 unitId → null 매핑. */
export async function getUnitCosts(
  businessId: string,
  unitIds: string[]
): Promise<Record<string, number | null>> {
  if (unitIds.length === 0) return {};
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("v_rental_units_cost")
    .select("id,purchase_cost")
    .eq("business_id", businessId)
    .in("id", unitIds);
  if (error || !data) return {}; // cost.read 없으면 뷰가 0행을 준다 — "비용 미입력"으로 표시될 뿐 오류 아님
  const map: Record<string, number | null> = {};
  for (const r of data as { id: string; purchase_cost: number | null }[]) map[r.id] = r.purchase_cost;
  return map;
}

/** 개체별 대여 횟수(반납 완료 이력 기준). */
export async function getUnitRentalCounts(
  businessId: string,
  unitIds: string[]
): Promise<Record<string, number>> {
  if (unitIds.length === 0) return {};
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("rental_reservation_items")
    .select("unit_id")
    .eq("business_id", businessId)
    .in("unit_id", unitIds)
    .in("item_status", ["out", "returned"]);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const r of data as { unit_id: string }[]) counts[r.unit_id] = (counts[r.unit_id] ?? 0) + 1;
  return counts;
}

/** unit_id → "상품명 · 개체코드" 라벨. v_rental_units/rental_skus/rental_products를 평평하게 조인. */
async function unitLabels(
  sb: ReturnType<typeof getServerSupabase>,
  unitIds: string[]
): Promise<Map<string, { unitCode: string; productName: string }>> {
  const map = new Map<string, { unitCode: string; productName: string }>();
  if (unitIds.length === 0) return map;
  const { data: units } = await sb
    .schema("crm")
    .from("v_rental_units")
    .select("id,unit_code,sku_id")
    .in("id", unitIds);
  const skuIds = [...new Set((units ?? []).map((u) => (u as Record<string, unknown>).sku_id as string))];
  const { data: skus } = skuIds.length
    ? await sb.schema("crm").from("rental_skus").select("id,product_id").in("id", skuIds)
    : { data: [] as Record<string, unknown>[] };
  const productIds = [...new Set((skus ?? []).map((s) => (s as Record<string, unknown>).product_id as string))];
  const { data: products } = productIds.length
    ? await sb.schema("crm").from("rental_products").select("id,name").in("id", productIds)
    : { data: [] as Record<string, unknown>[] };
  const productNameById = new Map((products ?? []).map((p) => [(p as Record<string, unknown>).id as string, (p as Record<string, unknown>).name as string]));
  const productIdBySku = new Map((skus ?? []).map((s) => [(s as Record<string, unknown>).id as string, (s as Record<string, unknown>).product_id as string]));
  for (const u of units ?? []) {
    const row = u as Record<string, unknown>;
    const pid = productIdBySku.get(row.sku_id as string);
    map.set(row.id as string, {
      unitCode: row.unit_code as string,
      productName: (pid && productNameById.get(pid)) || "",
    });
  }
  return map;
}

/** 세탁·수선 등록 화면의 개체 선택기용 평평한 목록. */
export async function listUnitsForPicker(businessId: string): Promise<ReadResult<UnitPickerRow[]>> {
  const products = await listProducts(businessId);
  if (!products.ok) return products;
  const rows: UnitPickerRow[] = [];
  for (const p of products.data) {
    for (const s of p.skus) {
      for (const u of s.units) {
        rows.push({ unitId: u.id, unitCode: u.unitCode, productName: p.name, color: s.color, size: s.size, status: u.status });
      }
    }
  }
  return { ok: true, data: rows };
}

/**
 * 지정한 개체들 중 앞으로 나갈 예정(확정/출고)인 예약이 걸려 있는 개체 id 집합.
 * 세탁·수선 목록의 "다음 예약 영향" 열용 — 별도 상태를 새로 만들지 않고 기존 예약 항목만 읽는다.
 */
export async function listUpcomingReservationUnitIds(businessId: string, unitIds: string[]): Promise<ReadResult<Set<string>>> {
  if (unitIds.length === 0) return { ok: true, data: new Set() };
  const sb = getServerSupabase();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .schema("crm")
    .from("rental_reservation_items")
    .select("unit_id, rental_reservations!inner(status, period, business_id)")
    .in("unit_id", unitIds)
    .eq("rental_reservations.business_id", businessId)
    .in("rental_reservations.status", ["confirmed", "out"]);
  if (error) return { ok: false, message: error.message };
  const set = new Set<string>();
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const res = r.rental_reservations as { period?: string } | undefined;
    if (!res?.period) continue;
    const { end } = splitRange(res.period);
    if (end >= nowIso) set.add(r.unit_id as string);
  }
  return { ok: true, data: set };
}

export async function listCareJobs(
  businessId: string,
  status?: CareJobRow["status"][]
): Promise<ReadResult<CareJobRow[]>> {
  const sb = getServerSupabase();
  let q = sb
    .schema("crm")
    .from("v_rental_care_jobs")
    .select("*")
    .eq("business_id", businessId)
    .order("opened_at", { ascending: false })
    .limit(200);
  if (status?.length) q = q.in("status", status);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };

  const labels = await unitLabels(sb, (data ?? []).map((r) => (r as Record<string, unknown>).unit_id as string));
  const rows: CareJobRow[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const label = labels.get(row.unit_id as string);
    return {
      id: row.id as string,
      unitId: row.unit_id as string,
      unitCode: label?.unitCode ?? "",
      productName: label?.productName ?? "",
      kind: row.kind as CareJobRow["kind"],
      status: row.status as CareJobRow["status"],
      openedAt: row.opened_at as string,
      closedAt: (row.closed_at as string) ?? null,
      cost: row.cost as number,
      notes: (row.notes as string) ?? null,
    };
  });
  return { ok: true, data: rows };
}

export async function listCustomers(
  businessId: string,
  q?: string
): Promise<ReadResult<CustomerRow[]>> {
  const sb = getServerSupabase();
  // pii.read 없으면 v_customers(전화/이메일 존재여부만)로 자동 폴백 — 서버가 뷰 자체로 게이팅한다.
  let query = sb
    .schema("crm")
    .from("v_customers_pii")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(300);
  const pattern = ilikePattern(q);
  if (pattern) query = query.or(`name.ilike.${pattern},phone.ilike.${pattern}`);
  let { data, error } = await query;

  if (error || !data || data.length === 0) {
    // pii.read 없음(뷰 WHERE절이 0행) 또는 실제로 없음 — 비민감 뷰로 재시도해 구분한다.
    let fallback = sb
      .schema("crm")
      .from("v_customers")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (pattern) fallback = fallback.or(`name.ilike.${pattern}`);
    const fb = await fallback;
    if (fb.error) return { ok: false, message: fb.error.message };
    data = fb.data;
  }

  const rows: CustomerRow[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      legacyNo: (row.legacy_no as string) ?? null,
      name: row.name as string,
      tags: (row.tags as string[]) ?? [],
      active: row.active as boolean,
      createdAt: row.created_at as string,
      hasPhone: row.has_phone as boolean | undefined,
      hasEmail: row.has_email as boolean | undefined,
      phone: row.phone as string | undefined,
      email: (row.email as string) ?? undefined,
      birth: (row.birth as string) ?? undefined,
      address: (row.address as string) ?? undefined,
      memo: (row.memo as string) ?? undefined,
    };
  });
  return { ok: true, data: rows };
}

function toCustomer(r: Record<string, unknown>): CustomerRow {
  return {
    id: r.id as string,
    legacyNo: (r.legacy_no as string) ?? null,
    name: r.name as string,
    tags: (r.tags as string[]) ?? [],
    active: r.active as boolean,
    createdAt: r.created_at as string,
    hasPhone: r.has_phone as boolean | undefined,
    hasEmail: r.has_email as boolean | undefined,
    phone: r.phone as string | undefined,
    email: (r.email as string) ?? undefined,
    birth: (r.birth as string) ?? undefined,
    address: (r.address as string) ?? undefined,
    memo: (r.memo as string) ?? undefined,
  };
}

/**
 * 고객 1명 조회. canReadPii는 호출부(page.tsx)가 access.caps로 이미 판정한 값을 넘긴다 —
 * 여기서 "일단 pii 뷰로 조회해보고 안 되면 폴백"하지 않는다. 권한이 없으면 애초에
 * 민감 뷰를 요청하지 않는다(지시사항: 서버에도 요청하지 말 것).
 */
export async function getCustomer(
  businessId: string,
  customerId: string,
  canReadPii: boolean
): Promise<ReadResult<CustomerRow>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from(canReadPii ? "v_customers_pii" : "v_customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "고객을 찾을 수 없습니다." };
  return { ok: true, data: toCustomer(data as Record<string, unknown>) };
}

/**
 * 고객 신체 치수 이력. pii.read 없는 호출은 애초에 하지 않는다(page.tsx가 캡 확인 후에만 부른다).
 * 개체 실측(rental_units.measurements)과는 완전히 다른 테이블 — 화면에서도 절대 합치지 않는다.
 */
export async function listCustomerMeasurements(
  businessId: string,
  customerId: string
): Promise<ReadResult<CustomerMeasurementRow[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("customer_measurements")
    .select("id,customer_id,measured_at,measured_by,values,note")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("measured_at", { ascending: false });
  if (error) return { ok: false, message: error.message };
  const rows: CustomerMeasurementRow[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      customerId: row.customer_id as string,
      measuredAt: row.measured_at as string,
      measuredBy: (row.measured_by as string) ?? null,
      values: (row.values as Record<string, number | string>) ?? {},
      note: (row.note as string) ?? null,
    };
  });
  return { ok: true, data: rows };
}

/** 개체 교환 후보 — 같은 SKU에서 available/reserved 상태만(0017_swap_unit.sql 규칙과 일치). */
export async function getSwapCandidates(
  businessId: string,
  skuId: string,
  excludeUnitId: string
): Promise<ReadResult<SwapCandidateRow[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .schema("crm")
    .from("v_rental_units")
    .select("id,unit_code,status")
    .eq("business_id", businessId)
    .eq("sku_id", skuId)
    .in("status", ["available", "reserved"])
    .neq("id", excludeUnitId);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return { unitId: row.id as string, unitCode: row.unit_code as string, status: row.status as UnitStatus };
    }),
  };
}

// ── 오늘 현황 (대시보드가 소비. 여기서는 데이터만 만든다 — 가짜 지표 금지) ──

export async function getRentalToday(
  businessId: string,
  tz = "Asia/Seoul"
): Promise<ReadResult<RentalToday>> {
  const sb = getServerSupabase();
  const now = new Date();
  const { startISO, endISO } = todayRangeISO(tz);
  const nowISO = now.toISOString();

  const [resAll, careResult, skuRes] = await Promise.all([
    sb
      .schema("crm")
      .from("v_rental_reservations")
      .select(RESERVATION_SELECT)
      .eq("business_id", businessId)
      .not("status", "in", "(cancelled,closed)")
      .limit(500),
    listCareJobs(businessId, ["open", "doing"]),
    sb.schema("crm").from("rental_skus").select("id,color,size,product_id").eq("business_id", businessId).limit(300),
  ]);

  if (resAll.error) return { ok: false, message: resAll.error.message };
  if (!careResult.ok) return careResult;
  if (skuRes.error) return { ok: false, message: skuRes.error.message };

  const skuIds = (skuRes.data ?? []).map((r) => (r as Record<string, unknown>).id as string);
  const productIds = [...new Set((skuRes.data ?? []).map((r) => (r as Record<string, unknown>).product_id as string))];
  const [unitsBySkuRes, productsRes] = await Promise.all([
    skuIds.length
      ? sb.schema("crm").from("v_rental_units").select("sku_id,status").in("sku_id", skuIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    productIds.length
      ? sb.schema("crm").from("rental_products").select("id,name").in("id", productIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  const productNameById = new Map(
    (productsRes.data ?? []).map((p) => [(p as Record<string, unknown>).id as string, (p as Record<string, unknown>).name as string])
  );
  const unitCountsBySku = new Map<string, { available: number; total: number }>();
  for (const u of unitsBySkuRes.data ?? []) {
    const row = u as Record<string, unknown>;
    const key = row.sku_id as string;
    const cur = unitCountsBySku.get(key) ?? { available: 0, total: 0 };
    cur.total += 1;
    if (row.status === "available") cur.available += 1;
    unitCountsBySku.set(key, cur);
  }

  const reservations = (resAll.data ?? []).map(toReservation);

  const fittingsToday = reservations
    .filter((r) => r.fittingAt && r.fittingAt >= startISO && r.fittingAt < endISO)
    .map((r) => ({ id: r.id, customerName: r.customerName, fittingAt: r.fittingAt as string }));

  const checkoutsToday = reservations.filter(
    (r) => r.status === "confirmed" && r.periodStart >= startISO && r.periodStart < endISO
  );

  const returnsToday = reservations.filter(
    (r) =>
      (r.status === "out" || r.status === "partial_return") &&
      r.periodEnd >= startISO &&
      r.periodEnd < endISO
  );

  const overdue = reservations.filter(
    (r) => (r.status === "out" || r.status === "partial_return") && r.periodEnd < nowISO
  );

  const staleDrafts = reservations.filter((r) => r.status === "draft" && r.periodStart < nowISO);

  const careWaiting: CareJobRow[] = careResult.data;

  const lowStockSkus = (skuRes.data ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      const counts = unitCountsBySku.get(row.id as string) ?? { available: 0, total: 0 };
      return {
        skuId: row.id as string,
        productName: productNameById.get(row.product_id as string) ?? "",
        color: row.color as string,
        size: row.size as string,
        availableCount: counts.available,
        totalCount: counts.total,
      };
    })
    .filter((s) => s.totalCount > 0 && s.availableCount === 0)
    .map(({ skuId, productName, color, size }) => ({ skuId, productName, color, size }));

  return {
    ok: true,
    data: { fittingsToday, checkoutsToday, returnsToday, overdue, careWaiting, lowStockSkus, staleDrafts },
  };
}

// ── 손상 청구·정산 내역(0023) ─────────────────────────────────────
/** 청구 목록(v_rental_damage_claims). amount 는 revenue.read 없으면 뷰가 null 로 준다(0025). */
export async function listDamageClaims(businessId: string, reservationId: string): Promise<ReadResult<DamageClaimRow[]>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("v_rental_damage_claims")
    .select("id,reservation_id,item_id,kind,description,reason,amount,photo_paths,created_at")
    .eq("business_id", businessId).eq("reservation_id", reservationId).order("created_at");
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string, reservationId: r.reservation_id as string, itemId: (r.item_id as string) ?? null, kind: r.kind as ClaimKind,
      description: r.description as string, reason: (r.reason as string) ?? null, amount: (r.amount as number) ?? null,
      photoPaths: (r.photo_paths as string[]) ?? [], createdAt: r.created_at as string,
    })),
  };
}

/** 정산 내역 = 원장 행 시간순. revenue.read 없으면 RLS 로 0행 → { masked: true }. */
export async function listSettlementHistory(businessId: string, reservationId: string): Promise<ReadResult<{ masked: boolean; entries: LedgerEntryRow[] }>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").from("ledger_entries")
    .select("id,entry_type,amount,direction,method,reason,occurred_at")
    .eq("business_id", businessId).eq("reservation_id", reservationId).order("occurred_at");
  if (error) return { ok: false, message: error.message };
  const entries = (data ?? []).map((r) => ({
    id: r.id as string, entryType: r.entry_type as string, amount: r.amount as number, direction: r.direction as "in" | "out",
    method: (r.method as string) ?? null, reason: (r.reason as string) ?? null, occurredAt: r.occurred_at as string,
  }));
  return { ok: true, data: { masked: entries.length === 0 && (await ledgerMasked(businessId)), entries } };
}

async function ledgerMasked(businessId: string): Promise<boolean> {
  const sb = getServerSupabase();
  const { data } = await sb.schema("crm").rpc("has_cap", { p_business: businessId, p_cap: "revenue.read" });
  return data !== true;
}

/** 청구서 1건(인쇄·PDF). crm.rental_claim_invoice — 회원이면 조회, revenue.read 없으면 금액 null·masked=true. */
export async function getClaimInvoice(claimId: string): Promise<ReadResult<ClaimInvoice>> {
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("rental_claim_invoice", { p_claim: claimId });
  if (error) return { ok: false, message: error.code === "42501" ? "이 사업장의 구성원이 아닙니다." : error.message };
  const j = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    ok: true,
    data: {
      claimId: j.claim_id, claimNo: j.claim_no, issuedAt: j.issued_at,
      business: { id: j.business?.id, name: j.business?.name },
      customer: { name: j.customer?.name ?? null, phone: j.customer?.phone ?? null },
      reservation: { id: j.reservation?.id, no: j.reservation?.no, periodStart: j.reservation?.period_start, periodEnd: j.reservation?.period_end, status: j.reservation?.status },
      item: { id: j.item?.id ?? null, label: j.item?.label ?? null, kind: j.item?.kind, description: j.item?.description, reason: j.item?.reason ?? null, photoPaths: j.item?.photo_paths ?? [] },
      masked: Boolean(j.masked), amount: n(j.amount), claimsTotal: n(j.claims_total), depositApplied: n(j.deposit_applied),
      depositBalance: n(j.deposit_balance), outstanding: n(j.outstanding),
    },
  };
}
