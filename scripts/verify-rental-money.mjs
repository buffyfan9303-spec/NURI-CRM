#!/usr/bin/env node
// 0027_rental_money.sql 런타임 검증 — 원격 적용 후 실행한다.
//   node scripts/verify-rental-money.mjs        (nuri-crm-next 에서, .env.local 의 SUPABASE_SERVICE_ROLE_KEY 필요)
//
// 하는 일
//   1. 임시 격리 사업장 2개(__verify_rental_money_<ts>, _other)와 임시 계정 4개(owner/manager/staff/viewer)를 만든다.
//   2. RPC 는 전부 **실제 사용자 세션**(magiclink → verifyOtp)으로 호출한다 — service_role 성공은 권한 검증이 아니다.
//      service_role 은 준비(직접 INSERT/UPDATE: 확정 시각을 과거로 옮겨 24h 규칙을 벗어나는 등)·정리·불변 확인에만 쓴다.
//   3. 시나리오: 본 흐름(확정+자동청구→계약금→잔금→보증금→출고→반납·손상→정산→종결·명세서) / 소비자 취소 6구간 / 견적 불일치·미제출 거부 /
//      몰수→취소 이중 공제 없음(소비자·사업자) / 사업자 배상 / 미수 연령·독촉·대손·정정·재청구 방지 / 이중청구 거부 / 확정 시각 PATCH 무시 /
//      record_payment 결함(보증금·환급 계정, 할인 캡, 할인만) / 정책 저장 / 타 사업장 격리 / 금액 마스킹 문구 / notes 금액 미노출.
//   4. 자기가 만든 행만 정리하고, 시작·끝의 운영 테이블 행 수가 같은지 확인한다.
// 종료 코드: 0 = 전부 통과, 1 = 실패 있음, 2 = 실행 불가(키 없음).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  return readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.+)$`, "m"))?.[1].trim();
}
const URL = env("NEXT_PUBLIC_SUPABASE_URL"), ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), SR = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !ANON || !SR) { console.error("SKIP  NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 없어 실행할 수 없다."); process.exit(2); }

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const A = admin.schema("crm");
const TAG = `__verify_rental_money_${Date.now()}`;
const KRW = { fee: 100000, deposit: 50000 };

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; failures.push(name); console.log(`FAIL  ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}
async function rpc(client, fn, args) { const { data, error } = await client.schema("crm").rpc(fn, args); return { data, error }; }
async function expectHint(name, p, hint, code) {
  const { error } = await p;
  const ok = !!error && ((hint && error.hint === hint) || (code && error.code === code) || (hint && new RegExp(`^${hint}`).test(error.message ?? "")));
  check(name, ok, error ? `${error.code} ${error.hint ?? ""} ${error.message}` : "오류가 나지 않았다");
  return error;
}
async function expectOk(name, p) {
  const { data, error } = await p;
  check(name, !error, error ? `${error.code} ${error.hint ?? ""} ${error.message}` : "");
  return data;
}
const uid = () => crypto.randomUUID();
const iso = (d) => d.toISOString();
const addH = (d, h) => new Date(d.getTime() + h * 3600_000);
// 사업장 시간대(Asia/Seoul) 기준 "오늘 + days 일 12:00" — 서버 now() 기준 단계 판정과 같은 달력으로 맞춘다.
const KST = 9 * 3600_000;
const seoulMidnightUTC = (d) => { const t = new Date(d.getTime() + KST); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - KST; };
const dayAt = (days, hour = 12) => new Date(seoulMidnightUTC(new Date()) + days * 86400_000 + hour * 3600_000);

const SNAP_TABLES = ["businesses", "memberships", "customers", "rental_reservations", "rental_reservation_items", "ledger_entries", "rental_damage_claims", "audit_log"];
async function snapshot() {
  const out = {};
  for (const t of SNAP_TABLES) { const { count, error } = await A.from(t).select("*", { count: "exact", head: true }); if (error) throw error; out[t] = count; }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  out.auth_users = users?.users?.length ?? -1;
  return out;
}

const made = { businesses: [], users: [] };
const ids = {};
async function makeUser(role, bizId) {
  const email = `${TAG}.${role}@verify.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: uid() + "Aa1!", email_confirm: true, user_metadata: { name: `${TAG} ${role}` } });
  if (error) throw error;
  made.users.push(data.user.id);
  const m = await A.from("memberships").insert({ business_id: bizId, user_id: data.user.id, role, status: "active" });
  if (m.error) throw m.error;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const v = await c.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (v.error) throw v.error;
  return c;
}
async function items(resId) { const { data } = await A.from("rental_reservation_items").select("id,unit_id,item_status,fee").eq("reservation_id", resId); return data ?? []; }
async function bal(resId) { const { data } = await A.from("v_reservation_balance").select("*").eq("reservation_id", resId).single(); return data; }
async function entries(resId) { const { data } = await A.from("ledger_entries").select("*").eq("reservation_id", resId).order("created_at"); return data ?? []; }
async function resRow(resId) { const { data } = await A.from("rental_reservations").select("*").eq("id", resId).single(); return data; }
/** 24h 무료 취소 규칙을 벗어나게 확정 시각을 과거로 옮긴다(service_role 경로만 허용되는 직접 수정). */
async function ageContract(resId, days = 3) { const { error } = await A.from("rental_reservations").update({ confirmed_at: iso(addH(new Date(), -24 * days)) }).eq("id", resId); if (error) throw error; }

async function main() {
  const before = await snapshot();
  console.log("snapshot(before)", before);

  const biz = await A.from("businesses").insert({ name: TAG, industry: "rental", timezone: "Asia/Seoul" }).select("id").single();
  if (biz.error) throw biz.error;
  const B = biz.data.id; made.businesses.push(B);
  const biz2 = await A.from("businesses").insert({ name: TAG + "_other", industry: "rental" }).select("id").single();
  if (biz2.error) throw biz2.error;
  const B2 = biz2.data.id; made.businesses.push(B2);

  const owner = await makeUser("owner", B), manager = await makeUser("manager", B), staff = await makeUser("staff", B), viewer = await makeUser("viewer", B);

  const prod = (await A.from("rental_products").insert({ business_id: B, code: "VRM-1", name: "검증 예복", base_fee: KRW.fee, deposit_amount: KRW.deposit, care_buffer_hours: 0 }).select("id").single()).data;
  const sku = (await A.from("rental_skus").insert({ business_id: B, product_id: prod.id, color: "black", size: "100" }).select("id").single()).data;
  for (let i = 1; i <= 10; i += 1) await A.from("rental_units").insert({ business_id: B, sku_id: sku.id, unit_code: `VRM-U${i}` });
  const cust = (await A.from("customers").insert({ business_id: B, name: "검증 고객", phone: "010-0000-0000" }).select("id").single()).data;
  const cust2 = (await A.from("customers").insert({ business_id: B2, name: "타사업장 고객" }).select("id").single()).data;
  // 타 사업장 예약: B 고객을 가리키는 FK + 큰 청구(M5 격리 반례). RPC 를 못 쓰므로 admin 직접 INSERT.
  const otherRes = (await A.from("rental_reservations").insert({ business_id: B2, customer_ref: cust.id, period: `[${iso(dayAt(100))},${iso(dayAt(101))})`, status: "confirmed" }).select("id").single()).data;
  await A.from("ledger_entries").insert({ business_id: B2, reservation_id: otherRes.id, entry_type: "rental_revenue", amount: 999999, direction: "in" });

  async function newRes(client, days, extra = {}) {
    const start = dayAt(days), end = addH(start, 24);
    const d = await expectOk(`create_reservation(${extra.tag ?? ""})`, rpc(client, "create_reservation", {
      p_business: B, p_start: iso(start), p_end: iso(end), p_items: [{ product_id: prod.id, sku_id: sku.id, qty: 1 }],
      p_customer_name: null, p_customer_phone: null, p_fitting_at: null, p_notes: extra.tag ?? null, p_idempotency_key: uid(), ...(extra.customer ? { p_customer: extra.customer } : {}),
    }));
    return d?.id;
  }
  const pay = (client, r, amount, stage, method = "cash", extra = {}) => rpc(client, "rental_receive_payment", { p_reservation: r, p_amount: amount, p_idempotency_key: uid(), p_method: method, p_stage: stage, ...extra });
  const dep = (client, r, amount = KRW.deposit) => rpc(client, "rental_receive_payment", { p_reservation: r, p_amount: amount, p_idempotency_key: uid(), p_method: "cash", p_kind: "deposit" });
  const quote = (client, r, cause, extra = {}) => rpc(client, "rental_cancel_quote", { p_reservation: r, p_cause: cause, ...extra });
  const cancel = (client, r, cause, rate, extra = {}) => rpc(client, "rental_cancel_with_penalty", { p_reservation: r, p_idempotency_key: uid(), p_cause: cause, p_expected_rate: rate, p_method: "transfer", ...extra });

  // ── A. 본 흐름 ─────────────────────────────────────────────
  {
    const r = await newRes(owner, 10, { tag: "A", customer: cust.id });
    ids.A = r;
    const row = await resRow(r);
    check("A 고객 연결(customer_ref·이름 스냅샷)", row.customer_ref === cust.id && row.customer_name === "검증 고객");
    const c1 = await expectOk("A rental_confirm_and_charge", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    check("A 확정+자동청구: charged_fee=100000, deposit_required=50000, confirmed_at 존재", c1?.charged_fee === KRW.fee && c1?.deposit_required === KRW.deposit && !!c1?.confirmed_at, c1);
    const c2 = await expectOk("A 재호출", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    check("A 재호출: charged_fee=0, auto_charged_before=true", c2?.charged_fee === 0 && c2?.auto_charged_before === true, c2);
    // H3: 사용자 세션의 confirmed_at/deposit_required 직접 PATCH 는 무시된다
    const before = await resRow(r);
    const patch = await owner.schema("crm").from("rental_reservations").update({ confirmed_at: "2020-01-01T00:00:00Z", deposit_required: 1 }).eq("id", r).select("confirmed_at,deposit_required");
    const after = await resRow(r);
    check("A(H3) owner 의 confirmed_at/deposit_required PATCH 무시", !patch.error && after.confirmed_at === before.confirmed_at && after.deposit_required === KRW.deposit, patch.error ?? after);
    let b = await bal(r);
    check("A 미수금 100000", b.outstanding === KRW.fee, b);
    await expectOk("A 계약금 30000 카드", pay(owner, r, 30000, "contract", "card", { p_approval_no: "12345678", p_cash_receipt: false }));
    await expectOk("A 잔금 70000 이체", pay(owner, r, 70000, "balance", "transfer", { p_cash_receipt: true }));
    const eo = await expectHint("A 미수 초과 수납 거부(owner: 금액 포함)", pay(owner, r, 1, "other"), "exceeds_outstanding");
    check("A(M4) owner 문구에 금액 있음", /\d/.test(eo?.message ?? ""), eo?.message);
    const es0 = await expectHint("A(M4) staff 미수 초과 문구에 금액 없음", pay(staff, r, 1, "other"), "exceeds_outstanding");
    check("A(M4) staff 문구에 숫자 없음", !/\d/.test(es0?.message ?? ""), es0?.message);
    await expectHint("A(L3) method null 거부", rpc(owner, "rental_receive_payment", { p_reservation: r, p_amount: 1, p_idempotency_key: uid(), p_method: null, p_kind: "deposit" }), "invalid_method");
    await expectHint("A(L3) kind null 거부", rpc(owner, "rental_receive_payment", { p_reservation: r, p_amount: 1, p_idempotency_key: uid(), p_method: "cash", p_kind: null }), "invalid_kind");
    await expectOk("A 보증금 50000 현금", dep(owner, r));
    b = await bal(r);
    check("A 수납 후: 미수 0, 현금 150000, 보증금 50000, paid", b.outstanding === 0 && b.cash_received === 150000 && b.deposit_balance === KRW.deposit && b.payment_status === "paid", b);
    const es = await entries(r);
    check("A 원장 stage/approval_no/cash_receipt 기록", es.some((e) => e.stage === "contract" && e.approval_no === "12345678" && e.cash_receipt === false) && es.some((e) => e.stage === "deposit"), es.map((e) => [e.entry_type, e.stage]));
    const key = es.find((e) => e.stage === "balance").idempotency_key;
    await expectOk("A 같은 키 재전송(재생)", rpc(owner, "rental_receive_payment", { p_reservation: r, p_amount: 70000, p_idempotency_key: key, p_method: "transfer", p_stage: "balance" }));
    check("A 재생 후 원장 행 수 불변", (await entries(r)).length === es.length);
    const its = await items(r);
    await expectOk("A 출고", rpc(owner, "mark_items_out", { p_reservation: r, p_item_ids: its.map((i) => i.id) }));
    await expectHint("A 반납 전 refund_deposit(구 4인자) 거부", rpc(owner, "refund_deposit", { p_reservation: r, p_amount: 10000, p_reason: "x", p_idempotency_key: uid() }), "not_returned");
    const nc = await expectOk("A 반납 전 종결 시도(예외 아님)", rpc(owner, "rental_close_reservation", { p_reservation: r }));
    check("A 종결 거부 이유 items_open 포함", nc?.closed === false && nc?.reasons?.some((x) => x.code === "items_open"), nc);
    const ir = await expectOk("A 반납 검수+손상 20000+보증금 정산", rpc(owner, "rental_inspect_return", {
      p_reservation: r, p_idempotency_key: uid(), p_returned_item_ids: its.map((i) => i.id),
      p_claims: [{ kind: "other", description: "단추 분실", amount: 20000 }], p_refund_remaining: true, p_method: "transfer",
    }));
    check("A 정산: applied 20000 / refunded 30000", ir?.settlement?.applied === 20000 && ir?.settlement?.refunded === 30000, ir?.settlement);
    b = await bal(r);
    check("A 정산 후: 미수 0, 보증금 0, 현금 120000", b.outstanding === 0 && b.deposit_balance === 0 && b.cash_received === 120000, b);
    const cl = await expectOk("A 종결", rpc(owner, "rental_close_reservation", { p_reservation: r }));
    check("A closed=true", cl?.closed === true && (await resRow(r)).status === "closed", cl);
    const st = await expectOk("A 거래명세서", rpc(owner, "rental_statement", { p_reservation: r }));
    check("A 명세서: 항목1·원장≥7·청구1·규정 포함", st?.items?.length === 1 && st?.entries?.length >= 7 && st?.claims?.length === 1 && !!st?.cancel_policy?.customer_tiers, { e: st?.entries?.length });
    await expectHint("A viewer 명세서 거부", rpc(viewer, "rental_statement", { p_reservation: r }), "forbidden", "42501");
    const stm = await expectOk("A manager 명세서", rpc(manager, "rental_statement", { p_reservation: r }));
    check("A manager 는 전화 보임(pii.read)", stm?.customer?.phone === "010-0000-0000", stm?.customer);
  }

  // ── B. 소비자 취소 각 구간(서버 now() 기준, 확정 시각은 3일 전으로 옮겨 24h 규칙을 벗어난다) ──
  {
    const cases = [[40, 0], [20, 10], [10, 30], [5, 50], [2, 80], [0, 100]];
    for (const [days, rate] of cases) {
      const r = await newRes(owner, days, { tag: `B${days}` });
      await expectOk(`B${days} 확정+청구`, rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
      const g = await expectOk(`B${days} 확정 직후 견적(24h 이내)`, quote(owner, r, "customer"));
      check(`B${days} 24h 이내 → 0%`, g?.within_contract_grace === true && Number(g?.rate) === 0, g);
      await ageContract(r);
      await expectOk(`B${days} 계약금 50000`, pay(owner, r, 50000, "contract"));
      await expectOk(`B${days} 보증금 50000`, dep(owner, r));
      const q = await expectOk(`B${days} 견적`, quote(owner, r, "customer"));
      const expPen = Math.min(KRW.fee * rate / 100, 50000);
      check(`B${days} 단계 ${rate}% → 위약금 ${expPen}(받은 돈 한도) 환급 ${100000 - expPen}`, q?.days_before === days && Number(q?.rate) === rate && q?.penalty === expPen && q?.refund_cash === 100000 - expPen && q?.within_contract_grace === false, q);
      const sq = await expectOk(`B${days} staff 견적(마스킹)`, quote(staff, r, "customer"));
      check(`B${days} staff 견적 masked·금액 null`, sq?.masked === true && sq?.penalty === null && Number(sq?.rate) === rate, sq);
      if (days === 10) {
        // N1: draft 로 되돌렸다가 다시 확정해도 confirmed_at 이 최초값(3일 전)이라 24h 무료 취소가 다시 시작되지 않는다
        const stamp0 = (await resRow(r)).confirmed_at;
        const tg = await owner.schema("crm").from("rental_reservations").update({ status: "draft" }).eq("id", r).select("id");
        check("B10(N1) owner 가 status 를 draft 로 되돌림", !tg.error && tg.data?.length === 1, tg.error);
        await expectOk("B10(N1) 재확정", rpc(owner, "confirm_reservation", { p_reservation: r }));
        const qq = await expectOk("B10(N1) 재확정 후 견적", quote(owner, r, "customer"));
        check("B10(N1) confirmed_at 최초값 유지·24h 무료 아님", (await resRow(r)).confirmed_at === stamp0 && qq?.within_contract_grace === false && Number(qq?.rate) === 30, { stamp0, now: (await resRow(r)).confirmed_at, qq });
        await expectHint("B10(N6) 예상 환급액 불일치 → quote_stale", cancel(owner, r, "customer", rate, { p_expected_refund: 1 }), "quote_stale");
        await expectHint("B10(H2) 견적 단계 불일치 → quote_stale", cancel(owner, r, "customer", rate + 1), "quote_stale");
        await expectHint("B10(H2) 견적 미제출 → quote_required", cancel(owner, r, "customer", null), "quote_required");
        await expectHint("B10(L3) cause null 거부", quote(owner, r, null), "invalid_cause");
        await expectHint("B10 소비자 override 가 대여료 초과 거부", quote(owner, r, "customer", { p_override_amount: 100001 }), "invalid_amount");
      }
      const c = await expectOk(`B${days} 취소 실행`, cancel(owner, r, "customer", rate));
      const b = await bal(r), row = await resRow(r);
      check(`B${days} 취소 후: cancelled, 미수 0, 보증금 0, 현금=위약금, cancel_penalty=위약금`,
        c?.status === "cancelled" && b.outstanding === 0 && b.deposit_balance === 0 && b.cash_received === expPen && b.cancel_penalty === expPen && row.status === "cancelled", b);
      // 메모의 날짜(YYYY-MM-DD, L8)는 금액이 아니므로 빼고 4자리 이상 숫자를 찾는다.
      check(`B${days}(M3) notes 에 금액 없음`, !/\d{4,}/.test((row.notes ?? "").replace(/\d{4}-\d{2}-\d{2}/g, "")) &&/취소\(소비자 귀책/.test(row.notes ?? ""), row.notes);
      check(`B${days} 항목 cancelled`, (await items(r)).every((i) => i.item_status === "cancelled"));
    }
    // B7: 당일, 계약금 30000 만, 미수로 남기기(limit_to_paid=false) → 위약금 100000, 환급 0, 미수 70000
    const r7 = await newRes(owner, 0, { tag: "B7", customer: cust.id });
    await expectOk("B7 확정+청구", rpc(owner, "rental_confirm_and_charge", { p_reservation: r7 }));
    await ageContract(r7);
    await expectOk("B7 계약금 30000", pay(owner, r7, 30000, "contract"));
    await expectHint("B7 직접 입력 금액인데 사유 없음", cancel(owner, r7, "customer", 100, { p_override_amount: 1000 }), "reason_required");
    await expectHint("B7 staff 취소(돈 이동 → refund 필요)", cancel(staff, r7, "customer", 100), "forbidden", "42501");
    const c7 = await expectOk("B7 취소(미수 남김)", cancel(owner, r7, "customer", 100, { p_limit_to_paid: false }));
    const b7 = await bal(r7);
    check("B7: 위약금 100000, 환급 0, 미수 70000", c7?.quote?.penalty === 100000 && c7?.quote?.refund_cash === 0 && b7.outstanding === 70000 && b7.cash_received === 30000, b7);
    ids.B7 = r7;
    await expectHint("B7(M1) 취소 예약에 balance 단계 수납 거부", pay(owner, r7, 10000, "balance"), "invalid_transition");
    await expectOk("B7(M1) 취소 예약 collection 단계 수납 10000", pay(owner, r7, 10000, "collection"));
    check("B7 미수 60000", (await bal(r7)).outstanding === 60000);
  }

  // ── H1. 몰수 뒤 취소 — 이중 공제 없음 ──────────────────────────
  {
    const r = await newRes(owner, 10, { tag: "H1c" });
    await expectOk("H1c 확정+청구", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    await ageContract(r);
    await expectOk("H1c 계약금 50000", pay(owner, r, 50000, "contract"));
    await expectOk("H1c 보증금 50000", dep(owner, r));
    await expectHint("H1c(L5) 몰수 멱등키 없음 거부", rpc(owner, "rental_forfeit_deposit", { p_reservation: r, p_amount: 20000, p_reason: "노쇼", p_idempotency_key: null }), "idempotency_key_required");
    await expectOk("H1c 몰수 20000", rpc(owner, "rental_forfeit_deposit", { p_reservation: r, p_amount: 20000, p_reason: "노쇼 위약", p_idempotency_key: uid() }));
    const q = await expectOk("H1c 견적(10일 전 30%)", quote(owner, r, "customer"));
    check("H1c 견적: 몰수 20000 반영 → 위약금 30000, 환급 50000", q?.deposit_forfeited === 20000 && q?.penalty === 30000 && q?.refund_cash === 50000 && q?.paid_fee === 50000, q);
    await expectOk("H1c 취소", cancel(owner, r, "customer", 30));
    const b = await bal(r);
    check("H1c 취소 후: 미수 0, 보증금 0, 현금 50000(위약 30000+몰수 20000), forfeited 20000", b.outstanding === 0 && b.deposit_balance === 0 && b.cash_received === 50000 && b.deposit_forfeited === 20000 && b.cancel_penalty === 30000, b);

    const r2 = await newRes(owner, 6, { tag: "H1b" });
    await expectOk("H1b 확정+청구", rpc(owner, "rental_confirm_and_charge", { p_reservation: r2 }));
    await ageContract(r2);
    await expectOk("H1b 계약금 50000", pay(owner, r2, 50000, "contract"));
    await expectOk("H1b 보증금 50000", dep(owner, r2));
    await expectOk("H1b 몰수 20000", rpc(manager, "rental_forfeit_deposit", { p_reservation: r2, p_amount: 20000, p_reason: "노쇼 위약", p_idempotency_key: uid() }));
    const q2 = await expectOk("H1b 사업자 견적(6일 전 30%)", quote(owner, r2, "business"));
    check("H1b 견적: 환급 80000(몰수 제외), 배상 30000, 총지급 110000", q2?.refund_cash === 80000 && q2?.compensation === 30000 && q2?.total_payout === 110000, q2);
    await expectHint("H1b(M9) manager 가 대여료 초과 배상 override → owner_only", cancel(manager, r2, "business", 30, { p_override_amount: 100001, p_reason: "특별 배상" }), "owner_only", "42501");
    await expectOk("H1b 사업자 취소(manager)", cancel(manager, r2, "business", 30));
    const b2 = await bal(r2);
    check("H1b 취소 후: 미수 0, 보증금 0, 현금 −10000, compensation 30000, forfeited 20000", b2.outstanding === 0 && b2.deposit_balance === 0 && b2.cash_received === -10000 && b2.compensation === 30000 && b2.deposit_forfeited === 20000, b2);
  }

  // ── N3. 몰수 뒤 구 cancel_confirmed_reservation(전액 환급형) — 몰수분은 환급하지 않는다 ──
  {
    const r = await newRes(owner, 8, { tag: "N3" });
    await expectOk("N3 확정+청구", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    await ageContract(r);
    await expectOk("N3 계약금 50000", pay(owner, r, 50000, "contract"));
    await expectOk("N3 보증금 50000", dep(owner, r));
    await expectOk("N3 몰수 20000", rpc(owner, "rental_forfeit_deposit", { p_reservation: r, p_amount: 20000, p_reason: "노쇼", p_idempotency_key: uid() }));
    await expectHint("N3 구 RPC p_refund=false → refund_required", rpc(owner, "cancel_confirmed_reservation", { p_reservation: r, p_idempotency_key: uid(), p_refund: false }), "refund_required");
    await expectHint("N3 staff 구 RPC(refund 캡 없음)", rpc(staff, "cancel_confirmed_reservation", { p_reservation: r, p_idempotency_key: uid(), p_refund: true }), "forbidden", "42501");
    const oc = await expectOk("N3 구 RPC 취소(manager, p_refund=true)", rpc(manager, "cancel_confirmed_reservation", { p_reservation: r, p_idempotency_key: uid(), p_refund: true, p_method: "transfer" }));
    const b = await bal(r);
    check("N3 구 반환 모양: refunded_cash 80000, deposit_returned 30000, charges_voided 100000", oc?.refunded_cash === 80000 && oc?.deposit_returned === 30000 && oc?.charges_voided === 100000, oc);
    check("N3 취소 후: 미수 0, 보증금 0, 현금 20000(=몰수), compensation 0, cancelled", b.outstanding === 0 && b.deposit_balance === 0 && b.cash_received === 20000 && b.compensation === 0 && (await resRow(r)).status === "cancelled", b);
  }

  // ── C. 사업자 취소 배상(몰수 없음) ───────────────────────────
  {
    const r = await newRes(owner, 6, { tag: "C" });
    await expectOk("C 확정+청구", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    await ageContract(r);
    await expectOk("C 계약금 50000", pay(owner, r, 50000, "contract", "card"));
    await expectOk("C 보증금 50000", dep(owner, r));
    const q = await expectOk("C 견적", quote(owner, r, "business"));
    check("C 배상 30000, 환급 100000, 총지급 130000", Number(q?.rate) === 30 && q?.compensation === 30000 && q?.refund_cash === 100000 && q?.total_payout === 130000, q);
    await expectOk("C 취소(owner, override 150000 배상)", cancel(owner, r, "business", 30, { p_override_amount: 150000, p_reason: "예식 당일 대체 불가 배상" }));
    const b = await bal(r);
    check("C 취소 후: 미수 0, 보증금 0, 현금 −150000, compensation 150000, refunded", b.outstanding === 0 && b.deposit_balance === 0 && b.cash_received === -150000 && b.compensation === 150000 && b.payment_status === "refunded", b);
  }

  // ── D. 미수 연령 + 독촉 + 정정 + 재청구 방지 + 이중청구 + 대손 ─────
  {
    const r = await newRes(owner, -40, { tag: "D", customer: cust.id });
    ids.D = r;
    await expectOk("D 확정+청구(40일 전 출고 예정)", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    await expectHint("D staff 미수 조회 거부", rpc(staff, "rental_receivables", { p_business: B }), "forbidden", "42501");
    const rec = await expectOk("D 미수 연령(manager)", rpc(manager, "rental_receivables", { p_business: B }));
    const rowD = rec?.rows?.find((x) => x.reservation_id === r), row7 = rec?.rows?.find((x) => x.reservation_id === ids.B7);
    check("D 40일 경과 → d31_60, 미수 100000", rowD?.bucket === "d31_60" && rowD?.days_overdue === 40 && rowD?.outstanding === 100000, rowD);
    check("D 취소 위약금 미수(B7) → 만기=청구일, not_due, 60000", row7?.bucket === "not_due" && row7?.outstanding === 60000, row7);
    check("D 합계·구간 집계", rec?.total >= 160000 && rec?.by_bucket?.d31_60?.count >= 1, rec?.by_bucket);
    await expectHint("D(L3) 독촉 channel null 거부", rpc(staff, "rental_log_collection", { p_reservation: r, p_channel: null }), "invalid_channel");
    await expectOk("D 독촉 기록(staff, write)", rpc(staff, "rental_log_collection", { p_reservation: r, p_channel: "call", p_note: "통화, 다음주 입금 약속", p_promised_pay_date: "2026-10-10" }));
    const rec2 = await expectOk("D 미수 재조회", rpc(manager, "rental_receivables", { p_business: B }));
    check("D 최근 독촉이 목록에 포함", rec2?.rows?.find((x) => x.reservation_id === r)?.last_contact_channel === "call");
    const vl = await viewer.schema("crm").from("rental_collection_logs").select("id").eq("reservation_id", r);
    check("D viewer 독촉 기록 0행(RLS revenue.read)", !vl.error && vl.data.length === 0, vl.error);
    const ml = await manager.schema("crm").from("rental_collection_logs").select("id").eq("reservation_id", r);
    check("D manager 독촉 기록 1행", !ml.error && ml.data.length === 1, ml.error);
    // H5 이중청구
    await expectHint("D(H5) record_payment 대여료 추가 1원 → fee_already_billed", rpc(owner, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "rental_revenue", amount: 1 }], p_idempotency_key: uid(), p_method: "cash" }), "fee_already_billed");
    await expectHint("D(N6) staff charge_rental_fee 할인 라인 거부(refund 캡)", rpc(staff, "charge_rental_fee", { p_reservation: r, p_lines: [{ entry_type: "discount", amount: 1 }], p_idempotency_key: uid() }), "forbidden", "42501");
    await expectHint("D(H5) charge_rental_fee 대여료 추가 1원 → fee_already_billed", rpc(owner, "charge_rental_fee", { p_reservation: r, p_lines: [{ entry_type: "rental_revenue", amount: 1 }], p_idempotency_key: uid() }), "fee_already_billed");
    const cu0 = await expectOk("D 차액 청구(변경 없음)", rpc(owner, "rental_charge_unbilled_fee", { p_reservation: r }));
    check("D 차액 0", cu0?.charged_fee === 0, cu0);
    // 정정
    const p = await expectOk("D 일부 수납 10000", pay(owner, r, 10000, "collection"));
    check("D 미수 90000", (await bal(r)).outstanding === 90000);
    await expectHint("D staff 정정 거부", rpc(staff, "ledger_reverse", { p_entry: p.entry_id, p_reason: "x" }), "forbidden", "42501");
    await expectHint("D 사유 없는 정정 거부", rpc(owner, "ledger_reverse", { p_entry: p.entry_id, p_reason: " " }), "reason_required");
    const rv = await expectOk("D 정정(owner)", rpc(owner, "ledger_reverse", { p_entry: p.entry_id, p_reason: "오입력" }));
    check("D 정정 후 미수 100000 복귀", (await bal(r)).outstanding === 100000);
    await expectHint("D 같은 행 두 번 정정 거부", rpc(owner, "ledger_reverse", { p_entry: p.entry_id, p_reason: "다시" }), "already_reversed");
    await expectHint("D 정정 행 재정정 거부", rpc(owner, "ledger_reverse", { p_entry: rv.reversal_id, p_reason: "다시" }), "cannot_reverse_reversal");
    // M6 정정된 대여료는 자동으로 다시 청구되지 않는다
    const feeRow = (await entries(r)).find((e) => e.entry_type === "rental_revenue" && e.reverses_id === null);
    await expectOk("D 자동청구 대여료 행 정정", rpc(owner, "ledger_reverse", { p_entry: feeRow.id, p_reason: "청구 오류" }));
    check("D 정정 후 rental_revenue 0", (await bal(r)).rental_revenue === 0);
    const cu1 = await expectOk("D 차액 청구 재호출", rpc(owner, "rental_charge_unbilled_fee", { p_reservation: r }));
    check("D(M6) 정정된 대여료는 차액 청구로 되살아나지 않음(0)", cu1?.charged_fee === 0, cu1);
    const ca = await expectOk("D 확정+자동청구 재호출", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    check("D(M6) 자동청구도 예약당 1회(0)", ca?.charged_fee === 0 && ca?.auto_charged_before === true, ca);
    await expectOk("D(M6) 수동 재청구(charge_rental_fee 100000, net 기준 허용)", rpc(owner, "charge_rental_fee", { p_reservation: r, p_lines: [{ entry_type: "rental_revenue", amount: 100000 }], p_idempotency_key: uid(), p_reason: "정정 후 재청구" }));
    check("D 재청구 후 미수 100000", (await bal(r)).outstanding === 100000);
    // 항목 대여료 인상 → 차액만
    await A.from("rental_reservation_items").update({ fee: 120000 }).eq("reservation_id", r);
    const cu2 = await expectOk("D 항목 fee 120000 으로 올린 뒤 차액 청구", rpc(owner, "rental_charge_unbilled_fee", { p_reservation: r }));
    check("D 차액 20000(원본 청구 합 200000 이라 0)", cu2?.charged_fee === 0, cu2);   // gross 100000(정정됨)+100000 = 200000 ≥ 120000 → 0
    // 대손(수납 없는 상태로 전액) → written_off 상태
    await expectHint("D manager 대손 거부(owner 전용)", rpc(manager, "rental_write_off", { p_reservation: r, p_amount: 100000, p_reason: "연락 두절", p_idempotency_key: uid() }), "owner_only", "42501");
    await expectHint("D(L5) 대손 멱등키 없음", rpc(owner, "rental_write_off", { p_reservation: r, p_amount: 100000, p_reason: "x", p_idempotency_key: "" }), "idempotency_key_required");
    await expectHint("D 대손 미수 초과", rpc(owner, "rental_write_off", { p_reservation: r, p_amount: 100001, p_reason: "x", p_idempotency_key: uid() }), "exceeds_outstanding");
    await expectOk("D 대손 100000(owner)", rpc(owner, "rental_write_off", { p_reservation: r, p_amount: 100000, p_reason: "연락 두절", p_idempotency_key: uid() }));
    const bD = await bal(r);
    check("D(L10) 대손 후: 미수 0, written_off 100000, payment_status written_off, rental_revenue 100000 유지", bD.outstanding === 0 && bD.written_off === 100000 && bD.payment_status === "written_off" && bD.rental_revenue === 100000, bD);
    // 고객 요약(M5: B2 의 999999 청구는 세지 않는다)
    const cs = await expectOk("D 고객 요약(owner)", rpc(owner, "rental_customer_money_summary", { p_customer: cust.id }));
    check("D(M5) 고객 미수 합 = B7 60000 만(타 사업장 예약 제외)", cs?.outstanding_total === 60000 && cs?.has_outstanding === true, cs);
    const css = await expectOk("D 고객 요약(staff)", rpc(staff, "rental_customer_money_summary", { p_customer: cust.id }));
    check("D staff 는 여부만(masked, 금액 null)", css?.masked === true && css?.has_outstanding === true && css?.outstanding_total === null, css);
    await expectHint("D 타 사업장 고객 요약 거부", rpc(owner, "rental_customer_money_summary", { p_customer: cust2.id }), "forbidden", "42501");
  }

  // ── H. 보증금 몰수 + 보관 현황 ───────────────────────────────
  {
    const r = await newRes(owner, 3, { tag: "H" });
    await expectOk("H 확정+청구", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    await expectOk("H 보증금 50000", dep(owner, r));
    await expectHint("H staff 몰수 거부", rpc(staff, "rental_forfeit_deposit", { p_reservation: r, p_amount: 1000, p_reason: "x", p_idempotency_key: uid() }), "forbidden", "42501");
    await expectHint("H 사유 없는 몰수 거부", rpc(owner, "rental_forfeit_deposit", { p_reservation: r, p_amount: 1000, p_reason: "", p_idempotency_key: uid() }), "reason_required");
    await expectHint("H 잔액 초과 몰수 거부", rpc(owner, "rental_forfeit_deposit", { p_reservation: r, p_amount: 50001, p_reason: "x", p_idempotency_key: uid() }), "refund_exceeds_deposit");
    const fk = uid();
    await expectOk("H 몰수 20000", rpc(manager, "rental_forfeit_deposit", { p_reservation: r, p_amount: 20000, p_reason: "노쇼 위약", p_idempotency_key: fk }));
    await expectOk("H 몰수 같은 키 재생", rpc(manager, "rental_forfeit_deposit", { p_reservation: r, p_amount: 20000, p_reason: "노쇼 위약", p_idempotency_key: fk }));
    const b = await bal(r);
    check("H 몰수 후(재생 포함 1회): 보증금 30000, deposit_forfeited 20000, 미수 100000 그대로", b.deposit_balance === 30000 && b.deposit_forfeited === 20000 && b.outstanding === 100000, b);
    const held = await expectOk("H 보관 보증금 현황", rpc(manager, "rental_deposits_held", { p_business: B }));
    check("H 현황에 30000 포함", held?.rows?.some((x) => x.reservation_id === r && x.deposit_balance === 30000) && held?.total >= 30000, held);
    await expectHint("H staff 보관 현황 거부", rpc(staff, "rental_deposits_held", { p_business: B }), "forbidden", "42501");
  }

  // ── J. 구 record_payment 정상 경로 호환 + 보안 결함(H4·M2) ────────
  {
    const r = await newRes(owner, 60, { tag: "J" });
    await expectOk("J confirm_reservation(구)", rpc(owner, "confirm_reservation", { p_reservation: r }));
    check("J 구 확정도 confirmed_at·deposit_required 스탬프", !!(await resRow(r)).confirmed_at && (await resRow(r)).deposit_required === KRW.deposit);
    await expectOk("J record_payment 대여료100000+할인10000+보증금50000(owner)", rpc(owner, "record_payment", {
      p_reservation: r, p_lines: [{ entry_type: "rental_revenue", amount: 100000 }, { entry_type: "discount", amount: 10000 }, { entry_type: "deposit_in", amount: 50000 }], p_idempotency_key: uid(), p_method: "cash",
    }));
    let b = await bal(r);
    check("J payment_in=140000, 미수 0, 보증금 50000", b.cash_received === 140000 && b.outstanding === 0 && b.deposit_balance === 50000, b);
    await expectOk("J 할인만 5000(manager: refund+revenue.read)", rpc(manager, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "discount", amount: 5000 }], p_idempotency_key: uid(), p_method: "cash" }));
    check("J 할인만 → refund 행 없음(0009 버그 수정)", !(await entries(r)).some((e) => e.entry_type === "refund"));
    await expectHint("J(M2) staff 할인 라인 거부", rpc(staff, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "discount", amount: 1000 }], p_idempotency_key: uid(), p_method: "cash" }), "forbidden", "42501");
    for (const [who, name] of [[staff, "staff"], [manager, "manager"], [owner, "owner"]]) {
      await expectHint(`J(H4) ${name} deposit_out 라인 → entry_type_not_allowed`, rpc(who, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "deposit_out", amount: 1000 }], p_idempotency_key: uid(), p_method: "cash" }), "entry_type_not_allowed");
      await expectHint(`J(H4) ${name} refund 라인 → entry_type_not_allowed`, rpc(who, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "refund", amount: 1000 }], p_idempotency_key: uid(), p_method: "cash" }), "entry_type_not_allowed");
    }
    await expectHint("J deposit_forfeit 라인 거부", rpc(owner, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "deposit_forfeit", amount: 1000 }], p_idempotency_key: uid(), p_method: "cash" }), "entry_type_not_allowed");
    await expectHint("J write_off 라인 거부", rpc(owner, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "write_off", amount: 1000 }], p_idempotency_key: uid(), p_method: "cash" }), "entry_type_not_allowed");
    await expectHint("J(L3) method null 거부", rpc(owner, "record_payment", { p_reservation: r, p_lines: [], p_idempotency_key: uid(), p_method: null, p_settle: 1 }), "invalid_method");
    await expectOk("J staff 정상 수납(연체료 라인, write)", rpc(staff, "record_payment", { p_reservation: r, p_lines: [{ entry_type: "late_fee", amount: 3000 }], p_idempotency_key: uid(), p_method: "cash" }));
    await expectOk("J staff 빈 라인+settle 0 은 무행", rpc(staff, "record_payment", { p_reservation: r, p_lines: [], p_idempotency_key: uid(), p_method: "cash", p_settle: 0 }));
    const its = await items(r);
    await expectOk("J 출고", rpc(owner, "mark_items_out", { p_reservation: r, p_item_ids: its.map((i) => i.id) }));
    await expectOk("J 반납", rpc(owner, "mark_items_returned", { p_reservation: r, p_item_ids: its.map((i) => i.id) }));
    await expectHint("J staff refund_deposit 거부", rpc(staff, "refund_deposit", { p_reservation: r, p_amount: 50000, p_reason: null, p_idempotency_key: uid() }), "forbidden", "42501");
    await expectOk("J refund_deposit(구) 50000", rpc(owner, "refund_deposit", { p_reservation: r, p_amount: 50000, p_reason: "반납 완료", p_idempotency_key: uid() }));
    b = await bal(r);
    // 현금 = 140,000(대여료 100,000 − 할인 10,000 + 보증금 50,000) + 3,000(staff 연체료 라인은 record_payment 가 "받은 돈"으로 보고 payment_in 3,000 파생)
    //        − 50,000(보증금 환불) = 93,000. 할인만 5,000 은 현금 행을 만들지 않는다.
    check("J 환불 후 보증금 0, 현금 93000", b.deposit_balance === 0 && b.cash_received === 93000, b);
  }

  // ── K. 연체료 정책 + 직접 입력 ─────────────────────────────
  {
    await expectHint("K manager 정책 저장 거부(staff.manage 없음)", rpc(manager, "rental_set_fee_policy", { p_business: B, p_name: "x", p_grace_hours: 0, p_late_fee_per_day: 1000 }), "forbidden", "42501");
    const pol = await expectOk("K owner 정책 저장", rpc(owner, "rental_set_fee_policy", { p_business: B, p_name: "기본", p_grace_hours: 12, p_late_fee_per_day: 20000, p_damage_default: 30000 }));
    const got = await expectOk("K 정책 조회(staff)", rpc(staff, "rental_get_fee_policy", { p_business: B }));
    check("K 조회값 = 저장값", got?.id === pol?.id && got?.late_fee_per_day === 20000, got);
    const r = await newRes(owner, -3, { tag: "K" });
    await expectOk("K 확정", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    await expectHint("K 사유 없는 직접 입력 거부", rpc(owner, "rental_charge_late_fee_override", { p_reservation: r, p_amount: 5000, p_reason: "", p_idempotency_key: uid() }), "reason_required");
    await expectHint("K staff 직접 입력 거부(revenue.read 없음)", rpc(staff, "rental_charge_late_fee_override", { p_reservation: r, p_amount: 5000, p_reason: "x", p_idempotency_key: uid() }), "forbidden", "42501");
    await expectOk("K 직접 입력 5000", rpc(manager, "rental_charge_late_fee_override", { p_reservation: r, p_amount: 5000, p_reason: "협의 감액", p_idempotency_key: uid() }));
    check("K late_fee 5000", (await bal(r)).late_fee === 5000);
  }

  // ── L. 취소 규정 저장 + 격리 ─────────────────────────────
  {
    const g0 = await expectOk("L 기본 규정 조회(viewer)", rpc(viewer, "rental_get_cancel_policy", { p_business: B }));
    check("L 기본값 = 공정위 표(is_default, 1개월 단계 포함)", g0?.is_default === true && g0?.customer_tiers?.length === 6 && g0?.customer_tiers?.[0]?.min_months === 1, g0);
    await expectHint("L manager 저장 거부", rpc(manager, "rental_set_cancel_policy", { p_business: B, p_customer_tiers: [{ min_days: 0, rate: 50 }], p_business_tiers: [{ min_days: 0, rate: 50 }] }), "forbidden", "42501");
    await expectHint("L 당일 단계 없는 표 거부", rpc(owner, "rental_set_cancel_policy", { p_business: B, p_customer_tiers: [{ min_days: 3, rate: 50 }], p_business_tiers: [{ min_days: 0, rate: 50 }] }), "invalid_tiers");
    await expectHint("L(L4) 필수 필드 없는 단계 거부", rpc(owner, "rental_set_cancel_policy", { p_business: B, p_customer_tiers: [{ rate: 50 }], p_business_tiers: [{ min_days: 0, rate: 50 }] }), "invalid_tiers");
    await expectHint("L(L4) rate 없는 단계 거부", rpc(owner, "rental_set_cancel_policy", { p_business: B, p_customer_tiers: [{ min_days: 0 }], p_business_tiers: [{ min_days: 0, rate: 50 }] }), "invalid_tiers");
    const g1 = await expectOk("L owner 저장(소비자 전구간 50%, grace 0)", rpc(owner, "rental_set_cancel_policy", { p_business: B, p_customer_tiers: [{ min_days: 0, rate: 50 }], p_business_tiers: [{ min_days: 0, rate: 50 }], p_contract_grace_hours: 0 }));
    check("L 저장 후 is_default=false", g1?.is_default === false);
    const r = await newRes(owner, 30, { tag: "L" });
    await expectOk("L 확정", rpc(owner, "rental_confirm_and_charge", { p_reservation: r }));
    const q = await expectOk("L 견적", quote(owner, r, "customer"));
    check("L 사업장 규정 적용(50%, grace 0)", Number(q?.rate) === 50 && q?.within_contract_grace === false && q?.computed_amount === 50000, q);
    await expectHint("L 타 사업장 예약 견적 거부(소속 아님)", quote(owner, otherRes.id, "customer"), "forbidden", "42501");
    await expectHint("L 타 사업장 고객으로 예약 생성 거부", rpc(owner, "create_reservation", { p_business: B, p_start: iso(dayAt(30)), p_end: iso(dayAt(31)), p_items: [], p_customer: cust2.id }), "customer_not_found");
  }

  // ── 게이트 유지(뷰 마스킹) ─────────────────────────────────
  {
    const sv = await staff.schema("crm").from("v_rental_reservation_items").select("fee").eq("business_id", B).limit(1);
    check("staff 에게 항목 fee 는 null(0025 게이트 유지)", !sv.error && (sv.data.length === 0 || sv.data[0].fee === null), sv.error);
    const vv = await viewer.schema("crm").from("v_rental_reservations").select("customer_phone,deposit_required,confirmed_at").eq("id", ids.A).single();
    check("viewer 에게 customer_phone 은 null(pii.read), deposit_required·confirmed_at 은 보임", !vv.error && vv.data.customer_phone === null && vv.data.deposit_required === KRW.deposit && !!vv.data.confirmed_at, vv.error ?? vv.data);
    const ov = await owner.schema("crm").from("v_rental_reservations").select("customer_phone").eq("id", ids.A).single();
    check("owner 에게 customer_phone 보임", !ov.error && ov.data.customer_phone === "010-0000-0000", ov.error ?? ov.data);
    const dl = await staff.schema("crm").from("ledger_entries").select("id").eq("business_id", B).limit(1);
    check("staff 는 원장 0행(revenue.read 없음)", !dl.error && dl.data.length === 0, dl.error);
  }

  return before;
}

async function cleanup() {
  // RESTRICT FK(청구→원장, 정정→원본, 항목→상품/SKU/개체)가 cascade 순서에 걸리지 않게 명시 순서로 지운다. 나머지는 사업장 cascade.
  for (const b of made.businesses) {
    const steps = [
      ["rental_damage_claims", (q) => q.eq("business_id", b)],
      ["rental_collection_logs", (q) => q.eq("business_id", b)],
      ["ledger_entries", (q) => q.eq("business_id", b).not("reverses_id", "is", null)],
      ["ledger_entries", (q) => q.eq("business_id", b)],
      ["rental_reservation_items", (q) => q.eq("business_id", b)],
      ["rental_reservations", (q) => q.eq("business_id", b)],
      ["rental_units", (q) => q.eq("business_id", b)],
      ["rental_skus", (q) => q.eq("business_id", b)],
      ["rental_products", (q) => q.eq("business_id", b)],
      ["businesses", (q) => q.eq("id", b)],
    ];
    for (const [t, where] of steps) { const { error } = await where(A.from(t).delete()); if (error) throw new Error(`${t}: ${error.message}`); }
  }
  for (const u of made.users) { const { error } = await admin.auth.admin.deleteUser(u); if (error) throw error; }
}

let before;
try {
  before = await main();
} catch (e) {
  fail += 1; failures.push("실행 중 예외"); console.error("EXCEPTION", e);
} finally {
  try { await cleanup(); } catch (e) { fail += 1; failures.push("정리 실패"); console.error("CLEANUP FAILED", e); }
  if (before) {
    const after = await snapshot();
    const same = SNAP_TABLES.every((t) => before[t] === after[t]) && before.auth_users === after.auth_users;
    check("정리 후 운영 테이블 행 수 불변(자기가 만든 행만 삭제)", same, { before, after });
  }
}
console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  통과 ${pass} / 실패 ${fail}${fail ? "\n  - " + failures.join("\n  - ") : ""}`);
process.exit(fail === 0 ? 0 : 1);
