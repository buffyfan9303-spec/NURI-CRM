#!/usr/bin/env node
// 0031_building_cam.sql 원격 반례 검증 — 원격 적용 후 메인이 실행한다(작성만 했고 실행 안 함: 원격 미적용).
//   node scripts/verify-0031.mjs        (nuri-crm-next 에서, .env.local 의 SUPABASE_SERVICE_ROLE_KEY 필요)
// 하는 일
//   1. 임시 격리 사업장 2개(__verify_0031_<ts> building / _other)와 임시 계정 5개(owner·manager·accountant·viewer·타사업장 owner)를 만든다.
//   2. RPC·조회는 전부 **실제 사용자 세션**(magiclink → verifyOtp)으로 한다 — service_role 성공은 권한 검증이 아니다.
//   3. 반례: viewer 금액 열 42501·뷰 null, 타 사업장 격리·forbidden·anon 거부, 계산(원천−배분 0)·계산자≠승인자·차단·inputs_changed·
//      확정 후 UPDATE 거부·정정 revision·부분납·선납·역분개·중복 거래·연체 미승인·세무 차단 사유·파일생성≠발행·가져오기 확정·취소.
//   4. 자기가 만든 행만 정리하고 시작·끝의 운영 테이블 행 수가 같은지 확인한다(v4 public 테이블·기존 5사업장 불변).
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
const TAG = `__verify_0031_${Date.now()}`;
let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; failures.push(name); console.log(`FAIL  ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}` : ""}`); }
}
const fmt = (e) => `${e.code ?? ""} ${e.hint ?? ""} ${e.message ?? ""}`.trim();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${fmt(r.error)}`); return r.data; };
const hintOf = (e) => e?.hint ?? /^([a-z_]+):/.exec(e?.message ?? "")?.[1] ?? e?.code ?? "";
async function expectHint(name, p, hint) {
  const { error } = await p;
  check(name, !!error && (hintOf(error) === hint || (error.message ?? "").includes(hint) || error.code === hint), error ? fmt(error) : "오류가 나지 않았다");
}

const SNAP_TABLES = ["businesses", "memberships", "audit_log", "bld_buildings", "bld_units", "bld_parties", "bld_contracts", "bld_charge_types", "bld_periods", "bld_billing_runs", "bld_bills", "bld_receivables", "bld_payments", "bld_tax_targets", "bld_import_batches"];
async function snapshot() {
  const out = {};
  for (const t of SNAP_TABLES) { const { count, error } = await A.from(t).select("*", { count: "exact", head: true }); if (error) throw error; out[t] = count; }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  out.auth_users = users?.users?.length ?? -1;
  // v4 public 테이블 불변(2/26/3): app_state·crm_staff 등 public 스키마 행 수는 건드리지 않는다
  const pub = await admin.from("app_state").select("*", { count: "exact", head: true });
  out.public_app_state = pub.error ? "n/a" : pub.count;
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
  return { c, id: data.user.id, crm: c.schema("crm") };
}

const before = await snapshot();
try {
  const B = must(await A.from("businesses").insert({ name: TAG, industry: "building" }).select("id").single(), "biz").id; made.businesses.push(B);
  const B2 = must(await A.from("businesses").insert({ name: TAG + "_other", industry: "building" }).select("id").single(), "biz2").id; made.businesses.push(B2);
  const owner = await makeUser("owner", B), manager = await makeUser("manager", B), acct = await makeUser("accountant", B), viewer = await makeUser("viewer", B), other = await makeUser("owner", B2);
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } }).schema("crm");

  // ── 기준정보(service_role 로 픽스처만)
  const P = must(await A.from("bld_parties").insert([
    { business_id: B, kind: "corp", name: `${TAG} 공급자`, biz_reg_no: "1248100998", ceo_name: "대표", phone: "0200000001" },
    { business_id: B, kind: "corp", name: `${TAG} 임차1`, biz_reg_no: "2208162517", ceo_name: "임차", phone: "01000000002" },
    { business_id: B, kind: "person", name: `${TAG} 임차2(번호없음)`, phone: "01000000003" },
  ], { defaultToNull: false }).select("id"), "parties").map((x) => x.id);
  const BLD = must(await A.from("bld_buildings").insert({ business_id: B, name: `${TAG} 빌딩`, supplier_party_id: P[0], due_day: 25 }).select("id").single(), "bld").id;
  const BLD2 = must(await A.from("bld_buildings").insert({ business_id: B2, name: `${TAG} 타사 빌딩`, due_day: 25 }).select("id").single(), "bld2").id;
  const U = must(await A.from("bld_units").insert([
    { business_id: B, building_id: BLD, unit_no: "101", area_exclusive: 33.72, valid: "[2026-01-01,)" },
    { business_id: B, building_id: BLD, unit_no: "102", area_exclusive: 56.99, valid: "[2026-01-01,)" },
    { business_id: B, building_id: BLD, unit_no: "103", area_exclusive: 10.5, valid: "[2026-01-01,)" },
  ], { defaultToNull: false }).select("id,unit_no").order("unit_no"), "units");
  const uid = Object.fromEntries(U.map((u) => [u.unit_no, u.id]));
  // PostgREST 다행 insert 는 행마다 빠진 열을 기본값이 아니라 null 로 채운다 → 모든 행에 같은 키를 준다.
  const C = must(await A.from("bld_contracts").insert([
    { business_id: B, building_id: BLD, unit_id: uid["101"], tenant_party_id: P[1], period: "[2026-01-01,)", late_rate: 3, late_rate_unit: "monthly", late_method: "simple", late_grace_days: 0, late_basis: "principal", late_partial_order: "oldest_first", late_cap_none: true, created_by: manager.id },
    { business_id: B, building_id: BLD, unit_id: uid["102"], tenant_party_id: P[2], period: "[2026-01-01,)", late_cap_none: false, created_by: manager.id },
    { business_id: B, building_id: BLD, unit_id: uid["103"], tenant_party_id: P[1], period: "[2026-01-01,)", late_cap_none: false, created_by: manager.id },
  ], { defaultToNull: false }).select("id,unit_id"), "contracts");
  const cid = Object.fromEntries(C.map((c) => [c.unit_id, c.id]));
  const CT = must(await A.from("bld_charge_types").insert([
    { business_id: B, building_id: BLD, name: "일반관리비", std_category: "general", source_kind: "rate", alloc_method: "area", tax_treatment: "taxable", unit_rate: 3471, rate_includes_vat: true, sort_order: 1, valid: "[2026-01-01,)", created_by: manager.id },
    { business_id: B, building_id: BLD, name: "승강기유지비", std_category: "elevator", source_kind: "expense", alloc_method: "area", tax_treatment: "exempt", sort_order: 2, valid: "[2026-01-01,)", created_by: manager.id },
  ], { defaultToNull: false }).select("id,name"), "charge types");
  const ct = Object.fromEntries(CT.map((c) => [c.name, c.id]));
  must(await A.from("bld_expenses").insert({ business_id: B, building_id: BLD, period: "2026-08", charge_type_id: ct["승강기유지비"], supply: 100000, vat: 0 }), "expense");
  const PER = must(await A.from("bld_periods").insert({ business_id: B, building_id: BLD, period: "2026-08" }).select("id").single(), "period").id;

  // ── 제약(EXCLUDE·CHECK)
  await expectHint("제약: 활성 호실 번호 기간 중복 거부", A.from("bld_units").insert({ business_id: B, building_id: BLD, unit_no: "101", valid: "[2026-06-01,)" }), "23P01");
  await expectHint("제약: 계약 기간 겹침 거부", A.from("bld_contracts").insert({ business_id: B, building_id: BLD, unit_id: uid["101"], tenant_party_id: P[2], period: "[2026-06-01,2026-12-31)" }), "23P01");
  await expectHint("제약: 사업자번호 체크섬", A.from("bld_parties").insert({ business_id: B, name: "x", biz_reg_no: "1248100999" }), "23514");

  // ── viewer: 열 게이트·RPC forbidden
  await expectHint("viewer: bld_contracts.rent 직접 조회 42501", viewer.crm.from("bld_contracts").select("rent").eq("building_id", BLD), "42501");
  await expectHint("viewer: bld_parties.phone 직접 조회 42501", viewer.crm.from("bld_parties").select("phone").eq("business_id", B), "42501");
  { const { data } = await viewer.crm.from("v_bld_parties").select("name,phone").eq("id", P[1]).maybeSingle(); check("viewer: 마스킹 뷰 전화번호 null·이름 보임", data?.phone === null && typeof data?.name === "string", data); }
  { const { data } = await viewer.crm.from("bld_units").select("id").eq("building_id", BLD); check("viewer: 소속 호실 3개", data?.length === 3, data); }
  await expectHint("viewer: 계산 forbidden", viewer.crm.rpc("bld_calculate", { p_period: PER }), "forbidden");
  await expectHint("viewer: 비용 INSERT 거부", viewer.crm.from("bld_expenses").insert({ business_id: B, building_id: BLD, period: "2026-08", charge_type_id: ct["승강기유지비"], supply: 1 }), "42501");
  await expectHint("원장 테이블 클라이언트 INSERT 불가(bld_bills)", owner.crm.from("bld_bills").insert({ business_id: B, run_id: crypto.randomUUID(), building_id: BLD, period: "2026-08", unit_id: uid["101"] }), "42501");
  // ── 타 사업장·anon
  { const { data } = await other.crm.from("bld_units").select("id").eq("building_id", BLD); check("타 사업장 owner: A 호실 0", data?.length === 0, data); }
  await expectHint("타 사업장 owner: A 계산 forbidden", other.crm.rpc("bld_calculate", { p_period: PER }), "forbidden");
  await expectHint("타 사업장 owner: A 건물 호실 생성 forbidden", other.crm.rpc("bld_units_bulk", { p_building: BLD, p_rows: [{ unit_no: "999" }], p_dry_run: false }), "forbidden");
  await expectHint("타 사업장 owner: A 할 일 조회 forbidden", other.crm.rpc("bld_todo", { p_building: BLD, p_period: "2026-08" }), "forbidden");
  await expectHint("anon: bld_units 조회 거부", anon.from("bld_units").select("id"), "42501");
  await expectHint("anon: 계산 RPC 거부", anon.rpc("bld_calculate", { p_period: PER }), "42501");

  // ── 승인자 분리
  await expectHint("연체 조건 비면 승인 불가", owner.crm.rpc("bld_approve_late_terms", { p_contract: cid[uid["102"]] }), "late_terms_incomplete");
  check("owner: 연체 조건 승인(입력자 manager ≠ 승인자)", !(await owner.crm.rpc("bld_approve_late_terms", { p_contract: cid[uid["101"]] })).error);
  await expectHint("연체 승인 열 직접 UPDATE 거부(트리거)", owner.crm.from("bld_contracts").update({ late_approved_at: new Date().toISOString() }).eq("id", cid[uid["102"]]).select("id"), "late_approval_via_rpc");
  await expectHint("manager: 항목 세무 승인 forbidden(tax.issue 없음)", manager.crm.rpc("bld_approve_charge_type_tax", { p_charge_type: ct["일반관리비"] }), "forbidden");
  check("accountant: 과세 항목 세무 승인", !(await acct.crm.rpc("bld_approve_charge_type_tax", { p_charge_type: ct["일반관리비"] })).error);

  // ── 계산(manager) → 원천−배분 0 → 승인(accountant) → 잠금 → 정정
  const r1 = must(await manager.crm.rpc("bld_calculate", { p_period: PER }), "calc");
  check("계산: 원천 − 배분 = 0, 차단 0, 청구 3", r1.diff === 0 && r1.block_count === 0 && r1.bills === 3, r1);
  const r1b = must(await manager.crm.rpc("bld_calculate", { p_period: PER }), "calc again");
  check("계산: 같은 입력 재사용(해시)", r1b.reused === true && r1b.run_id === r1.run_id, r1b);
  await expectHint("manager: 승인 forbidden", manager.crm.rpc("bld_approve", { p_run: r1.run_id }), "forbidden");
  await expectHint("manager: 세무 발행 대상 forbidden", manager.crm.rpc("bld_build_tax_targets", { p_run: r1.run_id }), "forbidden");
  must(await A.from("bld_expenses").insert({ business_id: B, building_id: BLD, period: "2026-08", charge_type_id: ct["승강기유지비"], supply: 1, vat: 0 }), "expense2");
  await expectHint("승인: 계산 뒤 입력 변경 → inputs_changed", acct.crm.rpc("bld_approve", { p_run: r1.run_id }), "inputs_changed");
  const r2 = must(await manager.crm.rpc("bld_calculate", { p_period: PER }), "calc2");
  check("재계산: revision 2", r2.revision === 2 && r2.diff === 0, r2);
  const ap = must(await acct.crm.rpc("bld_approve", { p_run: r2.run_id }), "approve");
  check("accountant: 승인(계산자 ≠ 승인자)", ap.status === "approved", ap);
  { const { data } = await acct.crm.from("v_bld_receivables").select("id,amount,paid,unit_id").eq("building_id", BLD).eq("period", "2026-08"); check("승인: 채권 3건·금액 보임(revenue.read)", data?.length === 3 && data.every((x) => typeof x.amount === "number"), data); }
  await expectHint("확정 청구 UPDATE 는 service_role 도 거부(bill_frozen)", A.from("bld_bills").update({ amount_due: 1 }).eq("run_id", r2.run_id).select("id"), "bill_frozen");
  await expectHint("승인된 청구월 재계산 거부(period_locked)", manager.crm.rpc("bld_calculate", { p_period: PER }), "period_locked");
  const bill101 = must(await acct.crm.from("v_bld_bills").select("id,amount_due,current_charge").eq("run_id", r2.run_id).eq("unit_id", uid["101"]).single(), "bill101");
  check("네 숫자: 미납·연체·선납 없으면 납부요청액 = 당월 부과액", bill101.amount_due === bill101.current_charge, bill101);
  const corr = must(await acct.crm.rpc("bld_correct_bill", { p_bill: bill101.id, p_lines: [{ std_category: "other", name: "정정", supply: 0, vat: 0, exempt: -1000 }], p_reason: "검증 정정" }), "correct");
  check("정정: 음수 차액 → 새 revision + 크레딧", corr.delta === -1000 && corr.correction_bill_id, corr);
  await expectHint("정정: 사유 없으면 거부", acct.crm.rpc("bld_correct_bill", { p_bill: bill101.id, p_lines: [{ std_category: "other", name: "x", supply: 0, vat: 0, exempt: 5 }], p_reason: "" }), "reason_required");

  // ── 수납
  const pay = must(await acct.crm.rpc("bld_record_payment", { p_building: BLD, p_amount: 50000, p_paid_at: new Date().toISOString(), p_method: "transfer", p_payer_name: "입금자", p_external_key: `${TAG}-TX1`, p_unit: uid["102"], p_memo: null, p_auto_allocate: true }), "pay");
  check("수납: 부분납 50,000 배정", pay.allocated?.[0]?.amount === 50000, pay);
  await expectHint("수납: 외부 거래키 중복 거부", acct.crm.rpc("bld_record_payment", { p_building: BLD, p_amount: 50000, p_paid_at: new Date().toISOString(), p_method: "transfer", p_payer_name: "입금자", p_external_key: `${TAG}-TX1`, p_unit: uid["102"], p_memo: null, p_auto_allocate: true }), "duplicate_payment");
  const over = must(await acct.crm.rpc("bld_record_payment", { p_building: BLD, p_amount: 9000000, p_paid_at: new Date().toISOString(), p_method: "transfer", p_payer_name: "입금자", p_external_key: `${TAG}-TX2`, p_unit: uid["103"], p_memo: null, p_auto_allocate: true }), "over");
  check("수납: 초과 입금 → 선납 크레딧", over.credit_amount > 0, over);
  await expectHint("viewer: 수납 forbidden", viewer.crm.rpc("bld_record_payment", { p_building: BLD, p_amount: 1, p_paid_at: new Date().toISOString(), p_method: "cash", p_payer_name: null, p_external_key: null, p_unit: null, p_memo: null, p_auto_allocate: false }), "forbidden");
  check("역분개", !(await acct.crm.rpc("bld_reverse_payment", { p_payment: pay.payment_id, p_reason: "검증 취소" })).error);
  { const { data } = await acct.crm.from("v_bld_receivables").select("paid").eq("unit_id", uid["102"]).eq("period", "2026-08").single(); check("역분개 후 paid 0", data?.paid === 0, data); }
  await expectHint("역분개 중복 거부", acct.crm.rpc("bld_reverse_payment", { p_payment: pay.payment_id, p_reason: "again" }), "already_reversed");
  // ── 연체(기능 꺼짐 → 켬 → 승인 계약만)
  const rec101 = must(await acct.crm.from("v_bld_receivables").select("id,due_date").eq("unit_id", uid["101"]).eq("kind", "bill").single(), "rec101");
  await expectHint("연체: 기능 꺼짐 feature_off", acct.crm.rpc("bld_late_fee_preview", { p_receivable: rec101.id, p_asof: "2027-01-01" }), "feature_off");
  await expectHint("viewer: 기능 토글 forbidden(staff.manage)", viewer.crm.rpc("set_business_feature", { p_business: B, p_key: "late_fee", p_enabled: true }), "forbidden");
  await expectHint("owner: 모르는 기능 키 거부", owner.crm.rpc("set_business_feature", { p_business: B, p_key: "nope", p_enabled: true }), "unknown_feature");
  check("owner: late_fee 켜기", !(await owner.crm.rpc("set_business_feature", { p_business: B, p_key: "late_fee", p_enabled: true })).error);
  { const { data } = await acct.crm.rpc("bld_late_fee_preview", { p_receivable: rec101.id, p_asof: (() => { const d = new Date(rec101.due_date); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })() }); check("연체: 승인 계약(101호) 30일", data?.days === 30, data); }
  const rec103 = must(await acct.crm.from("v_bld_receivables").select("id").eq("unit_id", uid["103"]).eq("kind", "bill").single(), "rec103");
  await expectHint("연체: 미승인 계약(103호) late_terms_unapproved", acct.crm.rpc("bld_late_fee_preview", { p_receivable: rec103.id, p_asof: "2027-01-01" }), "late_terms_unapproved");
  { const { data } = await owner.crm.rpc("bld_feature_status", { p_business: B, p_key: "alimtalk" }); check("기능 상태: alimtalk 끔(off)", data === "off", data); }
  check("owner: alimtalk 켜기", !(await owner.crm.rpc("set_business_feature", { p_business: B, p_key: "alimtalk", p_enabled: true })).error);
  { const { data } = await owner.crm.rpc("bld_feature_status", { p_business: B, p_key: "alimtalk" }); check("기능 상태: 외부 계약 필요(external_contract_required)", data === "external_contract_required", data); }
  // ── 세무
  await expectHint("세무: 기능 꺼짐 feature_off", acct.crm.rpc("bld_build_tax_targets", { p_run: r2.run_id }), "feature_off");
  check("owner: tax_invoice 켜기", !(await owner.crm.rpc("set_business_feature", { p_business: B, p_key: "tax_invoice", p_enabled: true })).error);
  const tx = must(await acct.crm.rpc("bld_build_tax_targets", { p_run: r2.run_id }), "tax targets");
  check("세무: ready ≥1·blocked ≥1(번호 공란 수신자)", tx.ready >= 1 && tx.blocked >= 1, tx);
  const targets = must(await acct.crm.from("v_bld_tax_targets").select("id,issue_status,receiver_party_id,kind,block_reasons,snapshot").eq("run_id", r2.run_id), "targets");
  const ready = targets.find((t) => t.issue_status === "ready" && t.kind === "tax_invoice"), blocked = targets.find((t) => t.issue_status === "blocked");
  check("세무: 차단 사유 문구 포함", Array.isArray(blocked?.block_reasons) && blocked.block_reasons.some((x) => /receiver_bizno_missing/.test(x)), blocked?.block_reasons);
  check("세무: ready 스냅샷이 HometaxRow 형태(writeDate 8자리·supplier.bizNo·items)", /^\d{8}$/.test(ready?.snapshot?.writeDate ?? "") && ready?.snapshot?.supplier?.bizNo === "1248100998" && Array.isArray(ready?.snapshot?.items), ready?.snapshot);
  { const { data } = await viewer.crm.from("v_bld_tax_targets").select("id,snapshot").eq("run_id", r2.run_id); check("viewer: 세무 스냅샷 null(revenue.read 없음)", data?.length >= 1 && data.every((t) => t.snapshot === null), data); }
  const fg = must(await acct.crm.rpc("bld_mark_tax_file_generated", { p_ids: [ready.id], p_file_name: "test.xls" }), "file gen");
  check("세무: 파일 생성 ≠ 발행(file_generated)", fg.status === "file_generated" && fg.updated === 1, fg);
  await expectHint("세무: 승인번호 없이 발행 완료 불가", acct.crm.rpc("bld_mark_tax_issued", { p_id: ready.id, p_nts_approval_no: "", p_issued_at: new Date().toISOString() }), "approval_no_required");
  check("세무: 승인번호 입력 → issued", (await acct.crm.rpc("bld_mark_tax_issued", { p_id: ready.id, p_nts_approval_no: "20260930410000012345678", p_issued_at: new Date().toISOString() })).data?.issue_status === "issued");
  // ── 가져오기
  const st = must(await manager.crm.rpc("bld_import_stage", { p_building: BLD, p_source_kind: "meter", p_file_name: "m.xlsx", p_file_hash: `${TAG}-h1`, p_period: "2026-09", p_mapping: { fingerprint: "f1" }, p_rows: [
    { sourceKind: "meter", period: "2026-09", roomKey: "101", roomMatchType: "exact", fields: { prevReading: 100, currReading: 150, unit: "kWh" }, hasError: false, hasWarning: false, issues: [] },
    { sourceKind: "meter", period: "2026-09", roomKey: "999", roomMatchType: "none", fields: { prevReading: 1, currReading: 2 }, hasError: false, hasWarning: false, issues: [] },
  ], p_charge_type: null, p_meter_kind: "electric", p_total: null }), "stage");
  check("가져오기: 스테이징 2행·미매칭 1(오류)", st.rows === 2 && st.unmatched === 1 && st.errors === 1, st);
  await expectHint("가져오기: 오류 행 있으면 확정 거부", manager.crm.rpc("bld_import_commit", { p_batch: st.batch_id }), "has_errors");
  await expectHint("가져오기: 같은 파일 해시 중복 거부", manager.crm.rpc("bld_import_stage", { p_building: BLD, p_source_kind: "meter", p_file_name: "m.xlsx", p_file_hash: `${TAG}-h1`, p_period: "2026-09", p_mapping: {}, p_rows: [], p_charge_type: null, p_meter_kind: "electric", p_total: null }), "duplicate_import");
  const st2 = must(await manager.crm.rpc("bld_import_stage", { p_building: BLD, p_source_kind: "meter", p_file_name: "m2.xlsx", p_file_hash: `${TAG}-h2`, p_period: "2026-09", p_mapping: {}, p_rows: [
    { sourceKind: "meter", period: "2026-09", roomKey: "101호", roomMatchType: "exact", fields: { prevReading: 100, currReading: 150, unit: "kWh" }, hasError: false, hasWarning: false, issues: [] },
  ], p_charge_type: null, p_meter_kind: "electric", p_total: null }), "stage2");
  const cm = must(await manager.crm.rpc("bld_import_commit", { p_batch: st2.batch_id }), "commit");
  check("가져오기: 확정 → 검침 1건(계량기 자동 생성)", cm.committed === 1, cm);
  { const { data } = await manager.crm.from("bld_meter_readings").select("id").eq("import_batch_id", st2.batch_id); check("가져오기: 검침 행 생성", data?.length === 1, data); }
  const cc = must(await manager.crm.rpc("bld_import_cancel", { p_batch: st2.batch_id, p_reason: "검증" }), "cancel");
  check("가져오기: 취소 → 검침 되돌림", cc.reverted === 1, cc);
  await expectHint("가져오기: 타 사업장 owner 스테이징 forbidden", other.crm.rpc("bld_import_stage", { p_building: BLD, p_source_kind: "bank", p_file_name: "b", p_file_hash: `${TAG}-h3`, p_period: null, p_mapping: {}, p_rows: [], p_charge_type: null, p_meter_kind: null, p_total: null }), "forbidden");
  // ── 보고서
  { const { data, error } = await acct.crm.rpc("bld_report_categories", { p_building: BLD, p_period: "2026-08" }); check("보고서: 14분류 집계", !error && Array.isArray(data?.categories) && data.total > 0, error ? fmt(error) : data); }
  { const { data, error } = await acct.crm.rpc("bld_aging", { p_building: BLD, p_asof: "2027-01-01" }); check("보고서: 미수 연령", !error && typeof data?.buckets?.total === "number", error ? fmt(error) : data); }
  { const { data, error } = await viewer.crm.rpc("bld_todo", { p_building: BLD, p_period: "2026-08" }); check("할 일: viewer 는 unpaid_total null(금액 가림)", !error && data?.unpaid_total === null && data?.units === 3, error ? fmt(error) : data); }
  await expectHint("보고서: viewer 14분류 forbidden(revenue.read)", viewer.crm.rpc("bld_report_categories", { p_building: BLD, p_period: "2026-08" }), "forbidden");
  await expectHint("타 사업장 건물 원장 forbidden", other.crm.rpc("bld_ledger_rows", { p_building: BLD, p_period: "2026-08" }), "forbidden");
  // ── 권한 회수: viewer 를 revoked 로 → 즉시 0
  must(await A.from("memberships").update({ status: "revoked" }).eq("user_id", viewer.id).eq("business_id", B), "revoke");
  { const { data } = await viewer.crm.from("bld_units").select("id").eq("building_id", BLD); check("권한 회수 후 호실 0(JWT 재발급 없이 즉시)", data?.length === 0, data); }
  void BLD2;
} catch (e) {
  fail += 1; failures.push("실행 중 예외"); console.error("EXCEPTION", e);
} finally {
  for (const b of made.businesses) {
    // 확정 청구는 트리거가 삭제를 막으므로 run 을 void 로 바꾼 뒤 지운다(검증 행만).
    await A.from("bld_billing_runs").update({ status: "void" }).eq("business_id", b);
    for (const t of ["bld_deliveries", "bld_dunning", "bld_disputes", "bld_late_fee_calcs", "bld_payment_allocations", "bld_credits", "bld_payments", "bld_tax_targets", "bld_receivables", "bld_bill_lines", "bld_bills", "bld_billing_runs", "bld_import_rows", "bld_import_batches", "bld_import_mappings", "bld_meter_readings", "bld_meters", "bld_direct_charges", "bld_expenses", "bld_periods", "bld_charge_types", "bld_contracts", "bld_units", "bld_work_orders", "bld_repair_fund", "bld_budgets", "bld_disclosure_requests", "bld_buildings", "bld_parties", "memberships", "audit_log", "businesses"]) {
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
