#!/usr/bin/env node
// 0029_scan_order_prefix.sql 런타임 검증 — 원격 적용 후 실행한다.
//   node scripts/verify-scan-0029.mjs        (nuri-crm-next 에서, .env.local 의 SUPABASE_SERVICE_ROLE_KEY 필요)
//
// 하는 일
//   1. 임시 격리 사업장 2개(__verify_scan_0029_<ts> / _other)와 임시 계정 3개(owner/viewer, 타 사업장 owner)를 만든다.
//   2. RPC 는 전부 **실제 사용자 세션**(magiclink → verifyOtp)으로 호출한다 — service_role 성공은 권한 검증이 아니다.
//   3. D1: 'NURI:<주문번호>' 스캔이 공장 주문으로 해석되는지(owner·viewer), 원문 주문번호·렌탈 qr_payload('NURI:U-…')·
//      unit_code 매칭 불변, 타 사업장 주문은 not_found, 비회원 사업장은 forbidden, stage_scan_batch(factory_lookup) 경유.
//   4. 자기가 만든 행만 정리하고, 시작·끝의 운영 테이블 행 수가 같은지 확인한다.
// 종료 코드: 0 = 전부 통과, 1 = 실패 있음, 2 = 실행 불가(키 없음).
// 같은 시나리오의 로컬(PGlite) 판본은 2026-09-28 24/24 통과 — 이 스크립트는 원격 PostgREST 경로를 확인한다.
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
const TAG = `__verify_scan_0029_${Date.now()}`;

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; failures.push(name); console.log(`FAIL  ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}
const fmt = (e) => `${e.code ?? ""} ${e.hint ?? ""} ${e.message ?? ""}`.trim();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${fmt(r.error)}`); return r.data; };

const SNAP_TABLES = ["businesses", "memberships", "factory_orders", "rental_products", "rental_skus", "rental_units", "scan_log", "scan_batch_items", "audit_log"];
async function snapshot() {
  const out = {};
  for (const t of SNAP_TABLES) { const { count, error } = await A.from(t).select("*", { count: "exact", head: true }); if (error) throw error; out[t] = count; }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  out.auth_users = users?.users?.length ?? -1;
  return out;
}

const made = { businesses: [], users: [] };
async function makeUser(role, bizId) {
  const email = `${TAG}.${role}.${bizId.slice(0, 4)}@verify.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID() + "Aa1!", email_confirm: true, user_metadata: { name: `${TAG} ${role}` } });
  if (error) throw error;
  made.users.push(data.user.id);
  must(await A.from("memberships").insert({ business_id: bizId, user_id: data.user.id, role, status: "active" }), "membership");
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const v = await c.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (v.error) throw v.error;
  return c;
}
const scan = (c, biz, code) => c.schema("crm").rpc("resolve_scan", { p_business: biz, p_code: code, p_session: null });
async function expectKind(name, p, kind, id) {
  const { data, error } = await p;
  check(name, !error && data?.kind === kind && (id === undefined || data?.id === id), error ? fmt(error) : data);
  return data;
}
async function expectHint(name, p, hint) {
  const { error } = await p;
  check(name, !!error && (error.hint === hint || (error.message ?? "").startsWith(hint) || (error.message ?? "").includes(hint)), error ? fmt(error) : "오류가 나지 않았다");
}

const before = await snapshot();
try {
  const B = must(await A.from("businesses").insert({ name: TAG, industry: "factory" }).select("id").single(), "biz").id; made.businesses.push(B);
  const B2 = must(await A.from("businesses").insert({ name: TAG + "_other", industry: "factory" }).select("id").single(), "biz2").id; made.businesses.push(B2);
  const owner = await makeUser("owner", B), viewer = await makeUser("viewer", B), owner2 = await makeUser("owner", B2);
  const ORD = `${TAG}-ORD-001`, ORD2 = `${TAG}-ORD-777`;
  const O = must(await A.from("factory_orders").insert({ business_id: B, order_no: ORD, type: "suit" }).select("id").single(), "o").id;
  const O2 = must(await A.from("factory_orders").insert({ business_id: B2, order_no: ORD2, type: "suit" }).select("id").single(), "o2").id;
  const prod = must(await A.from("rental_products").insert({ business_id: B, code: `${TAG}-P`, name: "검증 정장" }).select("id").single(), "prod").id;
  const sku = must(await A.from("rental_skus").insert({ business_id: B, product_id: prod, color: "black", size: "100" }).select("id").single(), "sku").id;
  const UC = `${TAG}-U-1`;
  const U = must(await A.from("rental_units").insert({ business_id: B, sku_id: sku, unit_code: UC, qr_payload: `NURI:${UC}` }).select("id").single(), "unit").id;

  // ── D1 공장 QR
  await expectKind("D1 owner NURI:주문번호 → factory_order", scan(owner, B, `NURI:${ORD}`), "factory_order", O);
  await expectKind("D1 viewer NURI:주문번호 → factory_order (view cap)", scan(viewer, B, `NURI:${ORD}`), "factory_order", O);
  await expectKind("주문번호 원문 → factory_order (기존 동작)", scan(owner, B, ORD), "factory_order", O);
  await expectKind("소문자 nuri: 는 접두사 아님 → not_found", scan(owner, B, `nuri:${ORD}`), "not_found");
  // ── 사업장 격리·권한
  await expectKind("타 사업장 주문 NURI: → not_found(존재 유출 없음)", scan(owner, B, `NURI:${ORD2}`), "not_found");
  await expectKind("타 사업장 owner 는 자기 사업장에서 자기 주문", scan(owner2, B2, `NURI:${ORD2}`), "factory_order", O2);
  await expectHint("비회원 사업장 조회 → forbidden", scan(owner2, B, `NURI:${ORD}`), "forbidden");
  // ── 기존 동작 불변
  await expectKind("렌탈 qr_payload NURI:U-… → rental_unit(접두사 원문 유지)", scan(owner, B, `NURI:${UC}`), "rental_unit", U);
  await expectKind("렌탈 unit_code → rental_unit", scan(owner, B, UC), "rental_unit", U);
  await expectKind("URL → text", scan(owner, B, `https://example.com/NURI:${ORD}`), "text");
  // ── stage_scan_batch(0023) 경유
  const st = must(await owner.schema("crm").rpc("stage_scan_batch", { p_business: B, p_session: `${TAG}-s1`, p_code: `NURI:${ORD}`, p_qty: 1, p_mode: "factory_lookup" }), "stage");
  check("stage factory_lookup NURI: → staged", st?.kind === "factory_order" && st?.staged === true, st);
  const st2 = must(await owner.schema("crm").rpc("stage_scan_batch", { p_business: B, p_session: `${TAG}-s2`, p_code: `NURI:${ORD}`, p_qty: 1, p_mode: "rental_checkout" }), "stage2");
  check("stage rental_checkout 에 공장 주문 → mode_mismatch", st2?.rejected === "mode_mismatch", st2);
  await expectHint("viewer stage → forbidden(write 없음)", viewer.schema("crm").rpc("stage_scan_batch", { p_business: B, p_session: `${TAG}-s3`, p_code: `NURI:${ORD}`, p_qty: 1, p_mode: "factory_lookup" }), "forbidden");
} catch (e) {
  fail += 1; failures.push("실행 중 예외"); console.error("EXCEPTION", e);
} finally {
  for (const b of made.businesses) {
    for (const t of ["scan_batch_items", "scan_log", "rental_units", "rental_skus", "rental_products", "factory_orders", "memberships", "audit_log", "businesses"]) {
      const { error } = await A.from(t).delete().eq(t === "businesses" ? "id" : "business_id", b);
      if (error) console.log(`cleanup ${t}: ${fmt(error)}`);
    }
  }
  for (const u of made.users) { const { error } = await admin.auth.admin.deleteUser(u); if (error) console.log(`cleanup user: ${error.message}`); }
  const after = await snapshot();
  for (const k of Object.keys(before)) check(`운영 행 수 불변 ${k}`, before[k] === after[k], `${before[k]} → ${after[k]}`);
}
console.log(`\n${pass} passed, ${fail} failed${failures.length ? `\n- ${failures.join("\n- ")}` : ""}`);
process.exit(fail ? 1 : 0);
