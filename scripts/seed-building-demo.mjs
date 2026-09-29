#!/usr/bin/env node
// 가명 시드 "누리 빌딩(가명)" — 0031 원격 적용 후 메인이 사용자 확인 하에 실행한다(작성만, 실행 안 함).
//   node scripts/seed-building-demo.mjs --business <building 업종 사업장 id> [--dry]
//   .env.local 의 SUPABASE_SERVICE_ROLE_KEY 로 기준정보·원천만 넣는다. 계산·승인은 실제 사용자 세션(magiclink)으로 bld_calculate/bld_approve 를 부른다:
//   --calc-as <manager 이메일> --approve-as <accountant/owner 이메일>  (없으면 원천까지만 넣고 끝)
// 내용: 27호실(101~127), 가명 임차인 27(사업자번호는 체크섬 통과 가짜), 항목 7(일반관리비 rate·승강기/청소/경비/보험 expense·전기/수도 meter), 7월 승인·일부 수납, 8월 초안, 연체 조건 3계약만 승인.
// PII 없음(전부 가명). 운영 5사업장 테이블은 건드리지 않는다.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]] : []).filter((x) => x.length));
function env(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  return readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.+)$`, "m"))?.[1].trim();
}
const URL = env("NEXT_PUBLIC_SUPABASE_URL"), ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), SR = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !ANON || !SR) { console.error("SKIP  환경변수 없음"); process.exit(2); }
if (!args.business) { console.error("사용: --business <사업장 id> [--dry] [--calc-as <email>] [--approve-as <email>]"); process.exit(2); }
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const A = admin.schema("crm");
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.code} ${r.error.hint ?? ""} ${r.error.message}`); return r.data; };

// 체크섬 통과 가짜 사업자번호(국세청 가중치) — 실제 사업자와 무관
function fakeBizNo(i) {
  const d = [1, 2, 4, 8, 1, ...String(10000 + i).slice(-4)].map(Number);
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const s = d.reduce((a, x, k) => a + x * w[k], 0) + Math.floor((d[8] * 5) / 10);
  return d.join("") + String((10 - (s % 10)) % 10);
}
const B = args.business;
const biz = must(await A.from("businesses").select("id,industry,name").eq("id", B).single(), "business");
if (biz.industry !== "building") { console.error(`사업장 ${biz.name} 은 building 업종이 아닙니다`); process.exit(2); }
if (args.dry) { console.log("DRY: 누리 빌딩(가명) 27호실·항목 7·7월/8월 원천을 넣을 예정. 실제 쓰기 없음."); process.exit(0); }
const exists = await A.from("bld_buildings").select("id").eq("business_id", B).eq("name", "누리 빌딩(가명)").maybeSingle();
if (exists.data) { console.error("이미 시드가 있습니다:", exists.data.id); process.exit(1); }

const supplier = must(await A.from("bld_parties").insert({ business_id: B, kind: "corp", name: "누리빌딩관리단(가명)", biz_reg_no: fakeBizNo(1), ceo_name: "관리인(가명)", address: "서울 어딘가(가명)" }, { defaultToNull: false }).select("id").single(), "supplier").id;
const bld = must(await A.from("bld_buildings").insert({ business_id: B, name: "누리 빌딩(가명)", kind: "commercial", supplier_party_id: supplier, due_day: 25, bank_name: "가명은행", bank_account: "000-0000-0000", bank_holder: "누리빌딩관리단(가명)", office_name: "관리사무소(가명)", office_phone: "02-000-0000", office_hours: "평일 9~18시" }, { defaultToNull: false }).select("id").single(), "building").id;
const units = must(await A.from("bld_units").insert(Array.from({ length: 27 }, (_, i) => ({ business_id: B, building_id: bld, floor: String(1 + Math.floor(i / 9)), unit_no: String(101 + i + Math.floor(i / 9) * 91), area_exclusive: 20 + ((i * 7) % 60) + 0.5, weight: 1, valid: "[2026-01-01,)" })), { defaultToNull: false }).select("id,unit_no").order("unit_no"), "units");
const tenants = must(await A.from("bld_parties").insert(units.map((u, i) => ({ business_id: B, kind: i % 5 === 4 ? "person" : "corp", name: `가명상사 ${u.unit_no}`, biz_reg_no: i % 5 === 4 ? null : fakeBizNo(100 + i), ceo_name: `대표${i + 1}(가명)`, phone: `010-0000-${String(i).padStart(4, "0")}` })), { defaultToNull: false }).select("id"), "tenants").map((x) => x.id);
const contracts = must(await A.from("bld_contracts").insert(units.map((u, i) => ({
  business_id: B, building_id: bld, unit_id: u.id, tenant_party_id: tenants[i], period: "[2026-01-01,)", rent: 500000 + i * 10000, deposit: 5000000,
  ...(i < 3 ? { late_rate: 3, late_rate_unit: "monthly", late_method: "simple", late_grace_days: 5, late_basis: "principal", late_partial_order: "oldest_first", late_cap_pct: 20, late_cap_none: false } : {}),
})), { defaultToNull: false }).select("id"), "contracts").map((x) => x.id);
const cts = must(await A.from("bld_charge_types").insert([
  { business_id: B, building_id: bld, name: "일반관리비", std_category: "general", source_kind: "rate", alloc_method: "area", tax_treatment: "taxable", unit_rate: 3000, rate_includes_vat: false, sort_order: 1, valid: "[2026-01-01,)" },
  { business_id: B, building_id: bld, name: "승강기유지비", std_category: "elevator", source_kind: "expense", alloc_method: "area", tax_treatment: "exempt", sort_order: 2, valid: "[2026-01-01,)" },
  { business_id: B, building_id: bld, name: "청소비", std_category: "cleaning", source_kind: "expense", alloc_method: "area", tax_treatment: "taxable", sort_order: 3, valid: "[2026-01-01,)" },
  { business_id: B, building_id: bld, name: "경비비", std_category: "security", source_kind: "expense", alloc_method: "equal", tax_treatment: "exempt", sort_order: 4, valid: "[2026-01-01,)" },
  { business_id: B, building_id: bld, name: "건물보험료", std_category: "insurance", source_kind: "expense", alloc_method: "area", tax_treatment: "non_taxable", sort_order: 5, valid: "[2026-01-01,)" },
  { business_id: B, building_id: bld, name: "전기료", std_category: "electric", source_kind: "expense", alloc_method: "meter_usage", meter_kind: "electric", tax_treatment: "pass_through", sort_order: 6, valid: "[2026-01-01,)" },
  { business_id: B, building_id: bld, name: "수도료", std_category: "water", source_kind: "expense", alloc_method: "meter_usage", meter_kind: "water", tax_treatment: "pass_through", sort_order: 7, valid: "[2026-01-01,)" },
], { defaultToNull: false }).select("id,name"), "charge types");
const ct = Object.fromEntries(cts.map((c) => [c.name, c.id]));
const meters = must(await A.from("bld_meters").insert(units.flatMap((u) => [{ business_id: B, building_id: bld, unit_id: u.id, kind: "electric", unit_label: "kWh" }, { business_id: B, building_id: bld, unit_id: u.id, kind: "water", unit_label: "㎥" }]), { defaultToNull: false }).select("id,kind,unit_id"), "meters");
for (const [k, period] of [["2026-07", 0], ["2026-08", 1]].map(([p], i) => [i, p])) {
  must(await A.from("bld_periods").insert({ business_id: B, building_id: bld, period, notice: k === 0 ? "7월분 명세서입니다(가명 시드)" : "8월분 초안(가명 시드)" }, { defaultToNull: false }), "period");
  must(await A.from("bld_expenses").insert([
    { business_id: B, building_id: bld, period, charge_type_id: ct["승강기유지비"], supply: 450000 + k * 10000, vat: 0, vendor: "가명승강기" },
    { business_id: B, building_id: bld, period, charge_type_id: ct["청소비"], supply: 900000, vat: 90000, vendor: "가명클린" },
    { business_id: B, building_id: bld, period, charge_type_id: ct["경비비"], supply: 1200000, vat: 0, vendor: "가명경비" },
    { business_id: B, building_id: bld, period, charge_type_id: ct["건물보험료"], supply: 300000, vat: 0, vendor: "가명보험" },
    { business_id: B, building_id: bld, period, charge_type_id: ct["전기료"], supply: 2500000 + k * 300000, vat: 250000 + k * 30000, vendor: "한전(가명)" },
    { business_id: B, building_id: bld, period, charge_type_id: ct["수도료"], supply: 400000, vat: 0, vendor: "수도(가명)" },
  ], { defaultToNull: false }), "expenses");
  must(await A.from("bld_meter_readings").insert(meters.map((m, i) => { const base = m.kind === "electric" ? 10000 + i * 37 : 500 + i * 3; const use = m.kind === "electric" ? 80 + (i * 13) % 200 : 5 + (i % 9); return { business_id: B, meter_id: m.id, period, prev_reading: base + k * use, curr_reading: base + (k + 1) * use }; }), { defaultToNull: false }), "readings");
}
console.log(`seeded: building ${bld}, units ${units.length}, contracts ${contracts.length}, charge types ${cts.length}, meters ${meters.length}, periods 2 (2026-07, 2026-08)`);

// 계산·승인은 실제 사용자 세션으로만(2인 분리): --calc-as / --approve-as
async function session(email) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (link.error) throw link.error;
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const v = await c.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" }); if (v.error) throw v.error;
  return c.schema("crm");
}
if (args["calc-as"] && args["approve-as"]) {
  const calc = await session(String(args["calc-as"])), appr = await session(String(args["approve-as"]));
  for (const cid of contracts.slice(0, 3)) must(await appr.rpc("bld_approve_late_terms", { p_contract: cid, p_reason: null }), "late terms approve");
  for (const c of cts) if (["taxable", "exempt"].includes(c.name === "일반관리비" || c.name === "청소비" ? "taxable" : "exempt")) await appr.rpc("bld_approve_charge_type_tax", { p_charge_type: c.id, p_reason: null });
  const p7 = must(await A.from("bld_periods").select("id").eq("building_id", bld).eq("period", "2026-07").single(), "p7").id;
  const r7 = must(await calc.rpc("bld_calculate", { p_period: p7, p_asof: null }), "calc 7월");
  console.log("7월 계산:", r7.block_count, "blocks,", r7.warning_count, "warnings, diff", r7.diff);
  if (r7.block_count === 0) {
    must(await appr.rpc("bld_approve", { p_run: r7.run_id, p_reason: null }), "approve 7월");
    for (const [i, u] of units.slice(0, 20).entries()) {
      const rec = await A.from("bld_receivables").select("amount").eq("unit_id", u.id).eq("period", "2026-07").single();
      const amt = i % 4 === 3 ? Math.floor((rec.data?.amount ?? 0) / 2) : rec.data?.amount ?? 0;   // 4호실 중 1은 부분납
      if (amt > 0) must(await appr.rpc("bld_record_payment", { p_building: bld, p_amount: amt, p_paid_at: "2026-07-27T03:00:00Z", p_method: "transfer", p_payer_name: `가명상사 ${u.unit_no}`, p_external_key: `seed-7-${u.unit_no}`, p_unit: u.id, p_memo: "시드 입금", p_auto_allocate: true }), "pay");
    }
    console.log("7월 승인·수납 20호실(부분납 5) 완료");
  }
  const p8 = must(await A.from("bld_periods").select("id").eq("building_id", bld).eq("period", "2026-08").single(), "p8").id;
  const r8 = must(await calc.rpc("bld_calculate", { p_period: p8, p_asof: null }), "calc 8월");
  console.log("8월 초안:", r8.block_count, "blocks,", r8.warning_count, "warnings, bills", r8.bills);
} else {
  console.log("계산·승인은 --calc-as <manager 이메일> --approve-as <승인자 이메일> 로 실제 사용자 세션에서 실행한다(2인 분리).");
}
