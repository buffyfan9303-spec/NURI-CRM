/**
 * 건물관리 입주자 셀프 조회(QR) — 서버 전용. 계약·위협 모델: docs/building-tenant-portal-contract.md, DB: supabase/migrations/0035.
 *
 * 두 부류:
 *  1. 관리자 액션(issue/revoke/status/views) — 로그인 세션(getServerSupabase) + withCap 사전 검사, 최종 판정은 crm.bld_portal_* RPC.
 *  2. 입주자 공개 함수(portal*) — 입주자는 로그인 계정이 없다. crm.portal_* RPC 는 service_role 전용(0035 r2, 검토 P1-2)이라
 *     이 파일의 서버 전용 service 클라이언트만 부른다(SUPABASE_SERVICE_ROLE_KEY — NEXT_PUBLIC 아님, 브라우저 번들에 들어가지 않는다).
 *     요청 IP 는 HMAC 해시로만 넘긴다(원문 IP 는 저장하지 않는다) — DB 가 IP 단위 시도 제한에 쓴다.
 *     세션 원문은 httpOnly 쿠키(nuri_tp, path /tenant)에만 둔다 — 브라우저 JS 는 세션 값을 읽지 못하고, 입력으로 받지도 않는다.
 * 호실·청구 소속, 확정 여부, 기능 스위치(tenant_portal), 시도 제한은 전부 DB 가 본다. 여기서 하는 일은 입력 길이 거르기와 문구 변환뿐이다.
 * "use server" — async 함수와 type 만 export. 표 UPDATE/DELETE 는 없다(전부 RPC) → verify:mutations 대상 아님.
 */
"use server";

import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { STD_CATEGORY_LABEL, type LateFeeCalc, type ReceivableRow, type StdCategory, type TaxTreatment, type UnitUseKind } from "@/lib/domain/building-types";
import type { StatementData, StatementMeter } from "@/lib/pdf/StatementDoc";
import { basisText, METER_LABEL, readingNote } from "@/lib/pdf/statement-text";
import { disputeNotice, law14Table, lateFeeFormulaLines, priorUnpaidRows, statementDensity, supplierLines, TAX_LABEL, unitInfoLine } from "@/lib/pdf/statement-p0";
import { periodLabel } from "@/components/building/period";
import { ipBucket } from "@/lib/utils/ip";

// ═══ 타입(화면 계약) ═══
export type PortalErrorCode =
  | "link_invalid" | "portal_off" | "invalid_input" | "invalid_credentials" | "locked" | "session_invalid" | "bill_not_found"
  | "invalid_kind" | "invalid_note" | "invalid_contact" | "invalid_charge_type" | "too_many_disputes"
  | "forbidden" | "feature_off" | "unit_not_in_building" | "contract_not_eligible" | "not_found" | "nothing_to_revoke" | "unknown";
export type PortalResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; hint: PortalErrorCode; retryAfterSec?: number; remainingAttempts?: number };
export type PortalDisputeKind = "dispute" | "correction_request" | "info_request";

export interface PortalBuilding { building_name: string; office_name: string | null; office_phone: string | null; office_hours: string | null; has_dong: boolean }
export interface PortalBuildingInfo { name: string; kind: string; address?: string | null; office_name: string | null; office_phone: string | null; office_hours: string | null; bank_name: string | null; bank_account: string | null; bank_holder: string | null }
export interface PortalBillSummary {
  id: string; period: string; bill_kind: "regular" | "correction"; revision: number;
  current_charge: number; prior_unpaid: number; late_fee: number | null; credit: number; amount_due: number;
  due_date: string | null; remaining: number | null; paid: boolean;
}
export interface PortalDispute {
  id: string; receipt_no: string; bill_id: string; period: string; kind: PortalDisputeKind; status: "open" | "resolved" | "rejected";
  note: string; charge_type_id: string | null; resolution: string | null; resolved_at: string | null; created_at: string;
}
export interface PortalFeatures { late_fee: boolean; statement_chart: boolean; statement_notice: boolean; statement_stub: boolean; statement_qr?: boolean }
export interface PortalSummary {
  building: PortalBuildingInfo; unit: { dong: string | null; unit_no: string }; payer_name: string | null; expires_at: string;
  /** 지금 낼 돈 = 이 호실의 열린 채권 잔액 합계(이 계약 것 + 같은 청구수신자의 이전 계약 미납, 정정·연체료 포함 — 청구서 전월 미납과 같은 기준). */
  outstanding: number;
  /** 잔액이 남은 채권 중 가장 이른 납부기한(없으면 null). */
  next_due_date?: string | null;
  /** 미리 낸 돈(선납·정정 차액) 잔액 — 같은 호실·같은 청구수신자 크레딧(청구 승인 때 차감하는 기준과 같음, 당사자 없는 크레딧 제외)(r3). */
  credit_balance?: number;
  bills: PortalBillSummary[]; disputes: PortalDispute[]; dispute_quota: { limit: number; used_today: number }; features: PortalFeatures;
}
export interface PortalBillLine {
  charge_type_id: string | null; std_category: StdCategory; name: string; meter_kind: string | null; tax_treatment: TaxTreatment | null;
  supply: number; vat: number; exempt: number; amount: number; basis: Record<string, unknown>;
}
export interface PortalMeter { kind: string; serial: string | null; unit_label: string; multiplier: number; prev: number; curr: number; usage: number; reason: string | null }
export interface PortalBillDetail {
  bill: PortalBillSummary & { supply: number; vat: number; exempt: number };
  lines: PortalBillLine[]; prev_lines: Record<string, number> | null; meters: PortalMeter[];
  period: { usage_from: string | null; usage_to: string | null; notice: string | null };
  history: { period: string; current_charge: number }[] | null;
  building: PortalBuildingInfo; payer_name: string | null; features: PortalFeatures;
  unit: { dong: string | null; unit_no: string; floor: string | null; use_kind: UnitUseKind; area_exclusive: number; area_common: number };
  /** 관리주체(공급자) — 명세서 머리용 사업자 정보. 없으면 null. */
  supplier: { name: string; biz_reg_no: string | null; ceo_name: string | null; address: string | null } | null;
  /** 이 청구월 이전의 아직 열린 내 채권(밀린 돈 달별). */
  prior: { period: string; kind: "bill" | "late_fee" | "correction"; due_date: string | null; amount: number; paid: number; credit_applied: number }[];
  /** 연체료 산식 재료(연체 기능 켜짐일 때만, 아니면 null). */
  late_items: LateFeeCalc[] | null;
}
export interface PortalStatus {
  feature: "on" | "off" | "external_contract_required" | "forbidden" | "unknown";
  link: { link_id: string; created_at: string } | null;
  /** 호실별. code_* 는 가장 최근 활성 코드. lock_wait_sec = 호실 전체 잠김(여러 IP 합산 50회), fails_15m = 최근 15분 실패 수(IP 별 잠김 참고). */
  units: { unit_id: string; dong: string | null; unit_no: string; code_issued_at: string | null; payer_name: string | null; last_login_at: string | null; lock_wait_sec: number;
           contract_id?: string | null; active_codes?: number; fails_15m?: number }[];
}
export interface PortalIssuedCodes {
  /** phone: 문자앱(sms: 링크)으로 코드를 보낼 청구 대상 전화 — 발급자에게 pii.read 가 있을 때만, 없으면 null(r3). */
  issued: { unit_id: string; dong: string | null; unit_no: string; payer_name: string | null; code: string; contract_id?: string; phone?: string | null }[];
  /** upcoming_contract: 입주 예정 계약이 있어 기본 발급을 건너뜀 — contract_id·payer_name(입주 예정자)을 보고 issuePortalCodes(…, contractIds) 로 다시 발급. */
  skipped: { unit_id: string; dong: string | null; unit_no: string; reason: "no_active_contract" | "inactive_unit" | "upcoming_contract"; contract_id?: string; payer_name?: string }[];
}
export interface PortalViewRow { id: number; unit_id: string; party_id: string | null; action: "login" | "summary" | "bill" | "pdf" | "dispute"; bill_id: string | null; created_at: string }

// ═══ 공통 ═══
const COOKIE = "nuri_tp";
const MESSAGES: Record<PortalErrorCode, string> = {
  link_invalid: "QR 주소가 올바르지 않거나 바뀌었습니다. 관리사무소에 새 QR을 요청해 주세요.",
  portal_off: "이 건물은 지금 입주자 조회를 쓰지 않습니다. 관리사무소로 문의해 주세요.",
  invalid_input: "호실과 접속코드를 다시 확인해 주세요.",
  invalid_credentials: "호실 또는 접속코드가 맞지 않습니다.",
  locked: "여러 번 틀려 잠시 잠겼습니다. 잠시 뒤 다시 시도해 주세요.",
  session_invalid: "조회 시간이 지났습니다. 호실과 접속코드를 다시 입력해 주세요.",
  bill_not_found: "명세서를 찾을 수 없습니다.",
  invalid_kind: "종류를 골라 주세요(금액 이의·정정 요청·정보 요청).",
  invalid_note: "내용을 1~1000자로 적어 주세요.",
  invalid_contact: "연락처는 40자 이내로 적어 주세요.",
  invalid_charge_type: "이 명세서에 없는 항목입니다.",
  too_many_disputes: "오늘은 더 접수할 수 없습니다(하루 3건). 급한 일은 관리사무소로 연락해 주세요.",
  forbidden: "이 작업을 할 권한이 없습니다.",
  feature_off: "입주자 조회 기능이 꺼져 있습니다. 설정에서 켠 뒤 다시 시도하세요.",
  unit_not_in_building: "이 건물의 호실이 아닙니다.",
  not_found: "대상을 찾을 수 없습니다.",
  contract_not_eligible: "이 건물의 진행 중이거나 앞으로 시작할 계약만 선택할 수 있습니다.",
  nothing_to_revoke: "폐기할 대상이 없습니다(이미 폐기했거나 아직 발급하지 않았습니다).",
  unknown: "처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.",
};
const fail = (hint: PortalErrorCode, extra?: { retryAfterSec?: number; remainingAttempts?: number }) => ({ ok: false as const, message: MESSAGES[hint], hint, ...extra });

/** PostgREST 오류 → 계약 오류 코드. DB 원문은 서버 콘솔에만. */
function mapError(e: { code?: string; message?: string; hint?: string | null }) {
  const hint = e.hint ?? /^([a-z_]+):/.exec(e.message ?? "")?.[1];
  if (hint && Object.hasOwn(MESSAGES, hint)) return fail(hint as PortalErrorCode);
  if (e.code === "42501") return fail("forbidden");
  if (e.code === "P0002") return fail("not_found");
  console.error("[building-portal] unmapped:", e.code, e.message);
  return fail("unknown");
}

/** 입주자용: 서버 전용 service_role 클라이언트. portal_* RPC 는 service_role 만 실행할 수 있다(anon 이 실패 기록을 롤백시키는 경로 차단). */
function portalDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("입주자 조회에 필요한 서버 환경 변수(SUPABASE_SERVICE_ROLE_KEY)가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).schema("crm");
}
/** 요청 IP(IPv6 는 /64 로 묶음) → HMAC-SHA256(키 = 서버 비밀) 앞 32자. 원문 IP 는 어디에도 남기지 않는다. Vercel 은 x-real-ip / x-forwarded-for 첫 값을 플랫폼이 채운다. */
function clientKey(): string {
  const h = headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(ipBucket(ip)).digest("hex").slice(0, 32);
}
const COOKIE_PATH = "/tenant";
const session = () => cookies().get(COOKIE)?.value ?? null;
/** 쿠키 지우기. RSC 렌더 중에는 쿠키를 쓸 수 없어 예외가 나므로 삼킨다(서버 액션·route 에서는 지워진다). */
function dropSession() {
  try {
    cookies().set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: COOKIE_PATH, maxAge: 0 });
  } catch {
    /* RSC read-only cookie store — 다음 서버 액션에서 지워진다 */
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function portalRpc<T>(name: string, args: Record<string, unknown>): Promise<PortalResult<T>> {
  const { data, error } = await portalDb().rpc(name, args);
  if (error) {
    const r = mapError(error);
    if (r.hint === "session_invalid" || r.hint === "portal_off") dropSession();
    return r;
  }
  return { ok: true, data: data as T };
}
async function withSession<T>(fn: (s: string) => Promise<PortalResult<T>>): Promise<PortalResult<T>> {
  const s = session();
  return s ? fn(s) : fail("session_invalid");
}

// ═══ 입주자 공개 함수 ═══
/** 건물 QR 첫 화면(`/tenant/<token>`): 건물 이름·관리사무소·동 입력칸 필요 여부. 호실 목록은 주지 않는다. */
export async function getPortalBuilding(token: string): Promise<PortalResult<PortalBuilding>> {
  if (!token || token.length > 100) return fail("link_invalid");
  return portalRpc<PortalBuilding>("portal_building", { p_token: token });
}

/** 호실·접속코드 확인. 성공하면 httpOnly 쿠키에 30분 세션을 심는다(세션 값은 돌려주지 않는다). */
export async function portalLogin(input: { token: string; unitNo: string; code: string; dong?: string | null }): Promise<PortalResult<{ expiresAt: string }>> {
  const { token, unitNo, code, dong } = input ?? ({} as typeof input);
  if (!token || token.length > 100) return fail("link_invalid");
  if (!unitNo?.trim() || unitNo.length > 30 || !code?.trim() || code.length > 40 || (dong?.length ?? 0) > 30) return fail("invalid_input");
  const r = await portalRpc<{ ok: boolean; session?: string; expires_at?: string; error?: string; retry_after_sec?: number; remaining_attempts?: number }>(
    "portal_login", { p_token: token, p_unit_no: unitNo, p_code: code, p_dong: dong ?? null, p_client: clientKey() });
  if (!r.ok) return r;
  const d = r.data;
  if (!d.ok || !d.session || !d.expires_at) {
    const hint = (d.error && Object.hasOwn(MESSAGES, d.error) ? d.error : "invalid_credentials") as PortalErrorCode;
    return fail(hint, { retryAfterSec: d.retry_after_sec, remainingAttempts: d.remaining_attempts });
  }
  const maxAge = Math.max(60, Math.floor((new Date(d.expires_at).getTime() - Date.now()) / 1000));
  cookies().set(COOKIE, d.session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: COOKIE_PATH, maxAge });
  return { ok: true, data: { expiresAt: d.expires_at } };
}

/** 내 관리비: 최근 12개월 확정 청구·남은 돈·내가 낸 이의(처리 결과 포함)·오늘 남은 이의 건수. */
export async function getPortalSummary(): Promise<PortalResult<PortalSummary>> {
  return withSession((s) => portalRpc<PortalSummary>("portal_summary", { p_session: s }));
}

/** 명세서 한 장(화면용). 열람 기록 action=bill. */
export async function getPortalBill(billId: string): Promise<PortalResult<PortalBillDetail>> {
  if (!UUID.test(billId ?? "")) return fail("bill_not_found");
  return withSession((s) => portalRpc<PortalBillDetail>("portal_bill", { p_session: s, p_bill: billId, p_purpose: "view" }));
}

/** PDF 라우트용: 명세서 한 장을 StatementDoc 입력으로. 열람 기록 action=pdf. */
export async function getPortalStatement(billId: string): Promise<PortalResult<StatementData>> {
  if (!UUID.test(billId ?? "")) return fail("bill_not_found");
  const r = await withSession((s) => portalRpc<PortalBillDetail>("portal_bill", { p_session: s, p_bill: billId, p_purpose: "pdf" }));
  if (!r.ok) return r;
  const d = r.data, b = d.bill, bd = d.building;
  const unitNo = d.unit.dong ? `${d.unit.dong} ${d.unit.unit_no}` : d.unit.unit_no;
  const bank = bd.bank_name && bd.bank_account ? `${bd.bank_name} ${bd.bank_account}${bd.bank_holder ? ` (${bd.bank_holder})` : ""}` : null;
  const meters: StatementMeter[] = d.meters.map((m) => {
    const amount = d.lines.filter((l) => l.meter_kind === m.kind).reduce((a, l) => a + l.amount, 0);
    return { label: `${METER_LABEL[m.kind] ?? m.kind}${m.serial ? ` ${m.serial}` : ""}`, prev: m.prev, curr: m.curr, usage: m.usage, unit: m.unit_label, amount: amount || null, note: readingNote(m.reason) };
  });
  const lines = d.lines.map((l) => ({
    name: l.name, category: STD_CATEGORY_LABEL[l.std_category] ?? "", amount: l.amount,
    prev: d.prev_lines && l.charge_type_id ? d.prev_lines[l.charge_type_id] ?? null : null, basis: basisText(l.basis),
    supply: l.supply, vat: l.vat, exempt: l.exempt, tax: TAX_LABEL[l.tax_treatment ?? "taxable"] ?? "",
  }));
  // priorUnpaidRows 가 읽는 필드(status·period·party_id·amount·paid·credit_applied·due_date·kind)만 채운다 — 관리자 명세서와 같은 계산.
  const prior = priorUnpaidRows({ period: b.period, bill_to_party_id: "self" }, d.prior.map((r) => ({ ...r, status: "open", party_id: "self" })) as unknown as ReceivableRow[]);
  const lateFormula = d.features.late_fee && (b.late_fee ?? 0) > 0 ? lateFeeFormulaLines(d.late_items) : null;
  const supplier = supplierLines(d.supplier);
  const commercial = bd.kind === "commercial";
  const chart = d.history && d.history.length >= 2 ? d.history.map((h) => ({ label: `${Number(h.period.slice(5))}월`, amount: h.current_charge })) : null;
  const office = [bd.office_name, bd.office_phone, bd.office_hours].filter(Boolean).join(" · ") || null;
  return {
    ok: true,
    data: {
      buildingName: bd.name,
      periodLabel: periodLabel(b.period),
      docNo: `${b.period.replace("-", "")}-${d.unit.unit_no}-r${b.revision}${b.bill_kind === "correction" ? " 정정" : ""}`,
      issuedAt: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
      unitNo,
      payerName: d.payer_name ?? "—",
      usageRange: d.period.usage_from && d.period.usage_to ? `${d.period.usage_from} ~ ${d.period.usage_to}` : null,
      dueDate: b.due_date,
      bank: bank ? (d.features.statement_qr ? `${bank} · 계좌 QR은 준비 중` : bank) : null,
      amountDue: b.amount_due, currentCharge: b.current_charge, priorUnpaid: b.prior_unpaid, lateFee: d.features.late_fee ? b.late_fee ?? 0 : null, credit: b.credit,
      supply: b.supply, vat: b.vat, exempt: b.exempt,
      lines,
      meters,
      notice: d.period.notice,
      buildingAddress: bd.address ?? null,
      supplier,
      unitInfo: unitInfoLine(d.unit),
      law14: commercial ? law14Table(d.lines) : null,
      priorRows: prior.rows,
      priorMismatch: prior.sum !== b.prior_unpaid,
      lateFormula,
      dispute: disputeNotice(office),
      dense: statementDensity({ lines: lines.length, law14: commercial, prior: prior.rows.length, late: lateFormula?.lines.length ?? 0, meters: meters.length, notice: !!d.period.notice, chart: !!chart, stub: d.features.statement_stub, supplier: supplier.length }),
      chart,
      stub: d.features.statement_stub,
      commercial,
    },
  };
}

/** 금액 이의·고쳐 달라는 요청·정보 요청(14항목 금액) 제출 → 관리자 "입주자 문의·이의"(bld_disputes, source tenant). */
export async function submitPortalDispute(input: { billId: string; kind: PortalDisputeKind; note: string; contact?: string | null; chargeTypeId?: string | null }): Promise<PortalResult<{ id: string; receiptNo: string; remainingToday: number }>> {
  const { billId, kind, note, contact, chargeTypeId } = input ?? ({} as typeof input);
  if (!UUID.test(billId ?? "")) return fail("bill_not_found");
  if (!["dispute", "correction_request", "info_request"].includes(kind)) return fail("invalid_kind");
  if (!note?.trim() || note.length > 1000) return fail("invalid_note");
  if ((contact?.length ?? 0) > 40) return fail("invalid_contact");
  if (chargeTypeId && !UUID.test(chargeTypeId)) return fail("invalid_charge_type");
  const r = await withSession((s) => portalRpc<{ id: string; receipt_no: string; remaining_today: number }>("portal_dispute",
    { p_session: s, p_bill: billId, p_kind: kind, p_note: note, p_contact: contact ?? null, p_charge_type: chargeTypeId ?? null }));
  return r.ok ? { ok: true, data: { id: r.data.id, receiptNo: r.data.receipt_no, remainingToday: r.data.remaining_today } } : r;
}

/** 조회 끝내기: DB 세션 폐기 + 쿠키 삭제. 이미 끝난 세션이어도 성공으로 본다(멱등). */
export async function portalLogout(): Promise<PortalResult> {
  const s = session();
  if (s) await portalDb().rpc("portal_logout", { p_session: s });
  dropSession();
  return { ok: true, data: undefined };
}

// ═══ 관리자 액션(로그인 직원) ═══
async function withCap<T>(businessId: string, caps: Cap[], fn: () => Promise<PortalResult<T>>): Promise<PortalResult<T>> {
  try {
    for (const c of caps) await requireCap(businessId, c);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail, hint: "forbidden" };
    throw e;
  }
  return fn();
}
async function staffRpc<T>(name: string, args: Record<string, unknown>): Promise<PortalResult<T>> {
  const { data, error } = await getServerSupabase().schema("crm").rpc(name, args);
  return error ? mapError(error) : { ok: true, data: data as T };
}
/** 클라이언트가 보낸 건물 id 가 이 사업장 것인지 다시 확인(RLS 아래 조회). */
async function ownBuilding(businessId: string, buildingId: string): Promise<boolean> {
  if (!UUID.test(buildingId ?? "")) return false;
  const { data } = await getServerSupabase().schema("crm").from("bld_buildings").select("id").eq("id", buildingId).eq("business_id", businessId).maybeSingle();
  return !!data;
}

/** 건물 QR 발급(재발급 = 이전 QR·그 QR 세션 폐기). token 은 이 응답에서 한 번만 — QR 주소는 `${origin}/tenant/${token}`. cap write. */
export async function issuePortalLink(businessId: string, buildingId: string): Promise<PortalResult<{ linkId: string; token: string; revokedPrevious: number }>> {
  return withCap(businessId, ["write"], async () => {
    if (!(await ownBuilding(businessId, buildingId))) return fail("not_found");
    const r = await staffRpc<{ link_id: string; token: string; revoked_previous: number }>("bld_portal_issue_link", { p_building: buildingId });
    return r.ok ? { ok: true, data: { linkId: r.data.link_id, token: r.data.token, revokedPrevious: r.data.revoked_previous } } : r;
  });
}

/** 건물 QR 폐기(0건이면 nothing_to_revoke). cap write. */
export async function revokePortalLink(businessId: string, buildingId: string): Promise<PortalResult<{ revoked: number }>> {
  return withCap(businessId, ["write"], async () => {
    if (!(await ownBuilding(businessId, buildingId))) return fail("not_found");
    const r = await staffRpc<number>("bld_portal_revoke_link", { p_building: buildingId });
    if (!r.ok) return r;
    return r.data > 0 ? { ok: true, data: { revoked: r.data } } : fail("nothing_to_revoke");
  });
}

/**
 * 접속코드 발급. 코드는 계약에 묶이고 이 응답에서 한 번만 나온다 — 인쇄·전달 후 버린다. cap write + revenue.read.
 * unitIds 없으면 지금 계약 있는 활성 호실 전부. 입주 예정 계약이 있는 호실은 skipped(upcoming_contract)로 돌아온다.
 * contractIds 를 주면 그 계약들에만 발급(입주 예정자 포함, unitIds 는 무시).
 */
export async function issuePortalCodes(businessId: string, buildingId: string, unitIds?: string[], contractIds?: string[]): Promise<PortalResult<PortalIssuedCodes>> {
  return withCap(businessId, ["write", "revenue.read"], async () => {
    if (!(await ownBuilding(businessId, buildingId))) return fail("not_found");
    if (unitIds && (unitIds.length === 0 || unitIds.length > 1000 || !unitIds.every((u) => UUID.test(u)))) return fail("unit_not_in_building");
    if (contractIds && (contractIds.length === 0 || contractIds.length > 1000 || !contractIds.every((u) => UUID.test(u)))) return fail("contract_not_eligible");
    return staffRpc<PortalIssuedCodes>("bld_portal_issue_codes", { p_building: buildingId, p_units: unitIds ?? null, p_contracts: contractIds ?? null });
  });
}

/** 호실 접속코드 폐기(그 코드 세션 즉시 끝). 0건이면 nothing_to_revoke. cap write. */
export async function revokePortalCode(businessId: string, unitId: string): Promise<PortalResult<{ revoked: number }>> {
  return withCap(businessId, ["write"], async () => {
    if (!UUID.test(unitId ?? "")) return fail("not_found");
    const u = await getServerSupabase().schema("crm").from("bld_units").select("id").eq("id", unitId).eq("business_id", businessId).maybeSingle();
    if (!u.data) return fail("not_found");
    const r = await staffRpc<number>("bld_portal_revoke_code", { p_unit: unitId });
    if (!r.ok) return r;
    return r.data > 0 ? { ok: true, data: { revoked: r.data } } : fail("nothing_to_revoke");
  });
}

/** 관리 카드: 기능 상태·건물 QR 발급 여부·호실별 코드 발급일·마지막 조회·잠김(초). cap write. */
export async function getPortalStatus(businessId: string, buildingId: string): Promise<PortalResult<PortalStatus>> {
  return withCap(businessId, ["write"], async () => {
    if (!(await ownBuilding(businessId, buildingId))) return fail("not_found");
    return staffRpc<PortalStatus>("bld_portal_status", { p_building: buildingId });
  });
}

/** 열람 기록(최신순). RLS: 소속만. 호실 이름은 getPortalStatus().units 로 붙인다. */
export async function listPortalViews(businessId: string, buildingId: string, limit = 200): Promise<PortalResult<PortalViewRow[]>> {
  return withCap(businessId, ["view"], async () => {
    const { data, error } = await getServerSupabase().schema("crm").from("bld_portal_views")
      .select("id,unit_id,party_id,action,bill_id,created_at").eq("business_id", businessId).eq("building_id", buildingId)
      .order("created_at", { ascending: false }).limit(Math.min(Math.max(1, limit), 1000));
    return error ? mapError(error) : { ok: true, data: (data ?? []) as PortalViewRow[] };
  });
}
