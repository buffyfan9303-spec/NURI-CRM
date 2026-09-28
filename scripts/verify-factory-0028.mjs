#!/usr/bin/env node
// 0028_factory_fixes.sql 런타임 검증 — 원격 적용 후 실행한다.
//   node scripts/verify-factory-0028.mjs        (nuri-crm-next 에서, .env.local 의 SUPABASE_SERVICE_ROLE_KEY 필요)
//
// 하는 일
//   1. 임시 격리 공장 사업장 2개(__verify_factory_0028_<ts> / _other)와 임시 계정 4개(owner/manager/staff/viewer)를 만든다.
//   2. RPC·REST 는 전부 **실제 사용자 세션**(magiclink → verifyOtp)으로 호출한다 — service_role 성공은 권한 검증이 아니다.
//      service_role 은 준비·정리·불변 확인에만 쓴다.
//   3. F02 타 사업장 자재 소비 거부 / F03 staff 조정·소비 거부(in/out 은 write 허용) / F04 상태·출고일 직접 PATCH 거부 + 공정 RPC 경로 통과 +
//      접수→취소 직접 허용 / F05 adjust_material_to(실제 수량→차이) / F06 재고 초과 출고·음수 조정 거부 / F28 타 사업장·타 주문·`..` 사진 경로 거부.
//      독립 검토 반영(R1~R5): service_role 가드 통과·photo_paths 불변 UPDATE / NaN·Infinity 수량 거부 / REST 타 사업장 자재 항목 거부 / 경로 문자 집합.
//   4. 자기가 만든 행만 정리하고, 시작·끝의 운영 테이블 행 수가 같은지 확인한다.
// 종료 코드: 0 = 전부 통과, 1 = 실패 있음, 2 = 실행 불가(키 없음).
// 같은 시나리오의 로컬(PGlite) 판본은 2026-09-25 64/64 통과 — 이 스크립트는 원격 PostgREST 경로(REST 0행·hint 전달)를 확인한다.
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
const TAG = `__verify_factory_0028_${Date.now()}`;

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; failures.push(name); console.log(`FAIL  ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}
const fmt = (e) => `${e.code ?? ""} ${e.hint ?? ""} ${e.message ?? ""}`.trim();
async function expectHint(name, p, hint) {
  const { error } = await p;
  check(name, !!error && (error.hint === hint || new RegExp(`^${hint}`).test(error.message ?? "") || (error.message ?? "").includes(hint)), error ? fmt(error) : "오류가 나지 않았다");
  return error;
}
async function expectOk(name, p) { const { data, error } = await p; check(name, !error, error ? fmt(error) : ""); return data; }
/** REST UPDATE 가 RLS 에 막히면 오류가 아니라 0행이다. */
async function expectZeroRows(name, p) { const { data, error } = await p; check(name, !error && Array.isArray(data) && data.length === 0, error ? fmt(error) : data); }

const SNAP_TABLES = ["businesses", "memberships", "customers", "materials", "material_moves", "factory_orders", "factory_order_items", "factory_processes", "fitting_logs", "calendar_events", "audit_log"];
async function snapshot() {
  const out = {};
  for (const t of SNAP_TABLES) { const { count, error } = await A.from(t).select("*", { count: "exact", head: true }); if (error) throw error; out[t] = count; }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  out.auth_users = users?.users?.length ?? -1;
  return out;
}

const made = { businesses: [], users: [] };
async function makeUser(role, bizId) {
  const email = `${TAG}.${role}@verify.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID() + "Aa1!", email_confirm: true, user_metadata: { name: `${TAG} ${role}` } });
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
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${fmt(r.error)}`); return r.data; };
const stock = async (m) => Number(must(await A.from("materials").select("stock").eq("id", m).single(), "stock").stock);
const orderRow = async (o) => must(await A.from("factory_orders").select("status,delivered_date").eq("id", o).single(), "order");

const before = await snapshot();
try {
  // ── 픽스처
  const B = must(await A.from("businesses").insert({ name: TAG, industry: "factory" }).select("id").single(), "biz").id; made.businesses.push(B);
  const B2 = must(await A.from("businesses").insert({ name: TAG + "_other", industry: "factory" }).select("id").single(), "biz2").id; made.businesses.push(B2);
  const owner = await makeUser("owner", B), manager = await makeUser("manager", B), staff = await makeUser("staff", B), viewer = await makeUser("viewer", B);
  const cust = must(await A.from("customers").insert({ business_id: B, name: "검증 고객" }).select("id").single(), "cust").id;
  const mat = must(await A.from("materials").insert({ business_id: B, kind: "fabric", code: "V28-F1", name: "검증 원단" }).select("id").single(), "mat").id;
  const mat2 = must(await A.from("materials").insert({ business_id: B2, kind: "fabric", code: "V28-X1", name: "타사 원단" }).select("id").single(), "mat2").id;
  const O2 = must(await A.from("factory_orders").insert({ business_id: B2, order_no: TAG + "-Q2", type: "suit" }).select("id").single(), "o2").id;
  const rpc = (c, fn, args) => c.schema("crm").rpc(fn, args);
  const mv = (c, row) => c.schema("crm").from("material_moves").insert(row).select("id");
  const O = (await expectOk("owner create_factory_order", rpc(owner, "create_factory_order", { p_business: B, p_customer: cust, p_type: "suit", p_supply: 100000 })))?.id;

  // ── F06 재고 하한 + F03 in/out=write, adjust=inventory.adjust
  await expectHint("F06 staff out 1 (재고 0) → insufficient_stock", mv(staff, { material_id: mat, kind: "out", qty: 1 }), "insufficient_stock");
  await expectOk("F03 staff in 5 (write)", mv(staff, { material_id: mat, kind: "in", qty: 5 }));
  await expectOk("F03 staff out 2 (write)", mv(staff, { material_id: mat, kind: "out", qty: 2 }));
  check("재고 캐시 = 3", (await stock(mat)) === 3, await stock(mat));
  await expectHint("F06 staff out 4 (재고 3) → insufficient_stock", mv(staff, { material_id: mat, kind: "out", qty: 4 }), "insufficient_stock");
  await expectHint("F03 viewer in → RLS", mv(viewer, { material_id: mat, kind: "in", qty: 1 }), "row-level security");
  await expectHint("F03 staff adjust → RLS(inventory.adjust)", mv(staff, { material_id: mat, kind: "adjust", qty: 1, reason: "x" }), "row-level security");
  await expectHint("F06 manager adjust -4 (재고 3) → negative_stock", mv(manager, { material_id: mat, kind: "adjust", qty: -4, reason: "x" }), "negative_stock");
  await expectOk("manager adjust +1 직접(차이값 계약)", mv(manager, { material_id: mat, kind: "adjust", qty: 1, reason: "x" }));
  check("재고 = 4", (await stock(mat)) === 4);
  await expectHint("owner 타 사업장 자재 이동 → RLS", mv(owner, { material_id: mat2, kind: "in", qty: 1 }), "row-level security");
  await expectHint("material_recompute_stock 은 클라이언트에서 호출 불가", rpc(owner, "material_recompute_stock", { p_material: mat }), "permission denied");

  // ── F05 adjust_material_to
  const a1 = await expectOk("F05 manager adjust_material_to 10", rpc(manager, "adjust_material_to", { p_material: mat, p_actual_qty: 10, p_reason: "실사" }));
  check("F05 before 4 / after 10 / delta 6 / move_id", Number(a1?.before) === 4 && Number(a1?.after) === 10 && Number(a1?.delta) === 6 && !!a1?.move_id, a1);
  const a2 = await expectOk("F05 같은 수량 → delta 0", rpc(manager, "adjust_material_to", { p_material: mat, p_actual_qty: 10, p_reason: "실사" }));
  check("F05 delta 0 → move_id null", Number(a2?.delta) === 0 && a2?.move_id === null, a2);
  check("재고 = 10", (await stock(mat)) === 10);
  await expectHint("F05 staff → forbidden", rpc(staff, "adjust_material_to", { p_material: mat, p_actual_qty: 1, p_reason: "x" }), "forbidden");
  await expectHint("F05 타 사업장 자재 → material_not_found", rpc(owner, "adjust_material_to", { p_material: mat2, p_actual_qty: 1, p_reason: "x" }), "material_not_found");
  await expectHint("F05 음수 → invalid_qty", rpc(manager, "adjust_material_to", { p_material: mat, p_actual_qty: -1, p_reason: "x" }), "invalid_qty");
  await expectHint("F05 빈 사유 → reason_required", rpc(manager, "adjust_material_to", { p_material: mat, p_actual_qty: 1, p_reason: " " }), "reason_required");
  // ── R2 NaN/Infinity(PostgREST 는 JSON 숫자만 받지만 문자열 'NaN' 을 numeric 으로 캐스팅한다)
  await expectHint("R2 staff in 'NaN' → invalid_qty", mv(staff, { material_id: mat, kind: "in", qty: "NaN" }), "invalid_qty");
  await expectHint("R2 staff in 'Infinity' → invalid_qty", mv(staff, { material_id: mat, kind: "in", qty: "Infinity" }), "invalid_qty");
  await expectHint("R2 manager adjust_material_to 'NaN' → invalid_qty", rpc(manager, "adjust_material_to", { p_material: mat, p_actual_qty: "NaN", p_reason: "x" }), "invalid_qty");
  await expectHint("R2 owner consume 'NaN' → invalid_qty", rpc(owner, "consume_material", { p_order: O, p_material: mat, p_qty: "NaN" }), "invalid_qty");
  check("R2 재고 = 10 그대로", (await stock(mat)) === 10);

  // ── F02·F03 consume_material
  await expectHint("F02 owner 타 사업장 자재를 내 주문에 소비 → material_not_found", rpc(owner, "consume_material", { p_order: O, p_material: mat2, p_qty: 1 }), "material_not_found");
  check("F02 타 사업장 재고 불변", (await stock(mat2)) === 0);
  await expectHint("F03 staff consume → forbidden", rpc(staff, "consume_material", { p_order: O, p_material: mat, p_qty: 1 }), "forbidden");
  await expectHint("owner 타 사업장 주문에 소비 → forbidden", rpc(owner, "consume_material", { p_order: O2, p_material: mat, p_qty: 1 }), "forbidden");
  await expectHint("F06 owner consume 11 (재고 10) → insufficient_stock", rpc(owner, "consume_material", { p_order: O, p_material: mat, p_qty: 11 }), "insufficient_stock");
  await expectHint("consume qty 0 → invalid_qty", rpc(owner, "consume_material", { p_order: O, p_material: mat, p_qty: 0 }), "invalid_qty");
  await expectOk("owner consume 3", rpc(owner, "consume_material", { p_order: O, p_material: mat, p_qty: 3 }));
  check("재고 = 7", (await stock(mat)) === 7);
  // ── R3 REST 로 타 사업장 자재를 주문 항목에 연결
  await expectHint("R3 owner REST factory_order_items(타 사업장 자재) → material_not_found", owner.schema("crm").from("factory_order_items").insert({ order_id: O, material_id: mat2, qty: 1 }).select("id"), "material_not_found");
  await expectOk("R3 owner REST factory_order_items(자기 자재) 허용", owner.schema("crm").from("factory_order_items").insert({ order_id: O, material_id: mat, qty: 1 }).select("id"));

  // ── F04 상태·출고일 잠금(REST PATCH 는 RLS 통과 후 트리거가 42501 이 아닌 P0001 로 막는다)
  const patch = (c, row) => c.schema("crm").from("factory_orders").update(row).eq("id", O).select("id");
  await expectHint("F04 owner PATCH status=완료 → status_locked", patch(owner, { status: "완료" }), "status_locked");
  await expectHint("F04 owner PATCH delivered_date(접수) → delivered_date_locked", patch(owner, { delivered_date: "2026-09-25" }), "delivered_date_locked");
  await expectHint("F04 owner INSERT status=완료 → status_locked", owner.schema("crm").from("factory_orders").insert({ business_id: B, order_no: TAG + "-Z", type: "suit", status: "완료" }).select("id"), "status_locked");
  await expectOk("F04 memo·가봉일 직접 수정은 그대로", patch(owner, { memo: "m", fitting_date: "2026-09-30" }));
  await expectZeroRows("viewer PATCH memo → 0행(RLS)", patch(viewer, { memo: "v" }));
  await expectOk("staff advance 작지 doing(write)", rpc(staff, "advance_factory_process", { p_order: O, p_stage: "작지", p_status: "doing", p_actual_minutes: null }));
  check("RPC 로 진행중", (await orderRow(O)).status === "진행중");
  for (const st of ["작지", "재단", "봉제", "가봉", "외주", "검수"]) await expectOk(`next ${st}`, rpc(staff, "advance_factory_process_next", { p_business: B, p_order: O, p_stage: st, p_actual_minutes: null }));
  await expectOk("F04 출고 doing 중 출고일 직접 입력 허용", patch(owner, { delivered_date: "2026-09-24" }));
  await expectOk("next 출고 → 완료", rpc(staff, "advance_factory_process_next", { p_business: B, p_order: O, p_stage: "출고", p_actual_minutes: null }));
  let r = await orderRow(O);
  check("완료 + 사용자가 넣은 출고일 유지", r.status === "완료" && r.delivered_date === "2026-09-24", r);
  await expectHint("F04 완료 주문 출고일 비우기 → delivered_date_locked", patch(owner, { delivered_date: null }), "delivered_date_locked");
  await expectHint("F04 완료 → 취소 직접 → status_locked", patch(owner, { status: "취소" }), "status_locked");
  await expectOk("reopen RPC", rpc(owner, "reopen_factory_order", { p_business: B, p_order: O }));
  r = await orderRow(O);
  check("재개 → 진행중 / 출고일 null", r.status === "진행중" && r.delivered_date === null, r);
  await expectOk("F04 진행중 → 취소 직접(구 앱 cancelFactoryOrder) 허용", patch(owner, { status: "취소" }));
  await expectHint("취소 → 접수 직접 → status_locked", patch(owner, { status: "접수" }), "status_locked");
  await expectHint("취소 주문 자재 소비 → order_cancelled", rpc(owner, "consume_material", { p_order: O, p_material: mat, p_qty: 1 }), "order_cancelled");

  // ── F28 가봉 사진 경로
  const O3 = (await expectOk("owner create order 2", rpc(owner, "create_factory_order", { p_business: B, p_customer: cust, p_type: "suit", p_supply: 1000 })))?.id;
  const fl = (c, paths) => c.schema("crm").from("fitting_logs").insert({ business_id: B, order_id: O3, notes: "v", photo_paths: paths }).select("id");
  await expectHint("F28 타 사업장 접두 → photo_path_invalid", fl(owner, [`${B2}/fitting/${O3}/a.png`]), "photo_path_invalid");
  await expectHint("F28 타 주문 접두 → photo_path_invalid", fl(owner, [`${B}/fitting/${O}/a.png`]), "photo_path_invalid");
  await expectHint("F28 `..` → photo_path_invalid", fl(owner, [`${B}/fitting/${O3}/../x.png`]), "photo_path_invalid");
  await expectHint("F28 접두만 → photo_path_invalid", fl(owner, [`${B}/fitting/${O3}/`]), "photo_path_invalid");
  for (const bad of ["%2e%2e/x.png", "/x.png", "a//b.png", "한글.png", "a b.png"])
    await expectHint(`R5 경로 변형 '${bad}' → photo_path_invalid`, fl(owner, [`${B}/fitting/${O3}/${bad}`]), "photo_path_invalid");
  const okLog = await expectOk("F28 새 접두 `{biz}/fitting/{order}/` 허용", fl(owner, [`${B}/fitting/${O3}/${crypto.randomUUID()}.png`]));
  await expectOk("F28 구 접두 `{biz}/factory-orders/{order}/` 허용", fl(owner, [`${B}/factory-orders/${O3}/fitting/1-a.png`]));
  await expectOk("F28 사진 없음 허용", fl(owner, []));
  // ── R1 service_role 이관 경로(가드 통과) + photo_paths 불변 UPDATE
  await expectOk("R1 service_role INSERT 완료 주문(migrate-legacy 형태)", A.from("factory_orders").insert({ business_id: B, order_no: TAG + "-L", type: "suit", status: "완료", delivered_date: "2026-01-20" }).select("id"));
  const legacyLog = (await expectOk("R1 service_role INSERT legacy 사진 경로", A.from("fitting_logs").insert({ business_id: B, order_id: O3, photo_paths: [`${B}/legacy/fitlog-1-0-0.jpg`] }).select("id").single()))?.id;
  await expectOk("R1 owner 메모만 수정(비규격 경로 행) 허용", owner.schema("crm").from("fitting_logs").update({ notes: "memo" }).eq("id", legacyLog).select("id"));
  await expectHint("R1 owner 비규격 경로 행의 photo_paths 변경 → photo_path_invalid", owner.schema("crm").from("fitting_logs").update({ photo_paths: [`${B}/legacy/other.jpg`] }).eq("id", legacyLog).select("id"), "photo_path_invalid");
  await expectOk("R1 owner 규격 경로 행 메모 수정", owner.schema("crm").from("fitting_logs").update({ notes: "m2" }).eq("id", okLog?.[0]?.id).select("id"));
} catch (e) {
  fail += 1; failures.push("실행 중 예외"); console.error("EXCEPTION", e);
} finally {
  // ── 정리: 자기 행만
  for (const b of made.businesses) {
    for (const t of ["fitting_logs", "factory_processes", "factory_order_items", "material_moves", "calendar_events", "factory_orders", "materials", "customers", "memberships", "audit_log", "businesses"]) {
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
