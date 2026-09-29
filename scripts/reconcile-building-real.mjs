#!/usr/bin/env node
// 실데이터 사업장의 월별 초안 계산을 돌리고 원본 엑셀 월합계와 대조한다(승인하지 않는다). 건수·합계만 출력.
//   node scripts/reconcile-building-real.mjs --business <id> --as <owner 이메일>
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith("--") ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const env = (n) => process.env[n] ?? (existsSync(".env.local") ? readFileSync(".env.local", "utf8").match(new RegExp(`^${n}=(.+)$`, "m"))?.[1].trim() : undefined);
const URL = env("NEXT_PUBLIC_SUPABASE_URL"), ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), SR = env("SUPABASE_SERVICE_ROLE_KEY");
const EXPECTED = { "2026-06": 5913581, "2026-07": 6051665, "2026-08": 7405785 };
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const A = admin.schema("crm");
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.code} ${r.error.hint ?? ""} ${r.error.message}`); return r.data; };
const link = await admin.auth.admin.generateLink({ type: "magiclink", email: args.as }); if (link.error) throw link.error;
const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const v = await c.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" }); if (v.error) throw v.error;
const U = c.schema("crm");
const periods = must(await A.from("bld_periods").select("id,period").eq("business_id", args.business).order("period"), "periods");
console.log("월       청구건수  원본합계      DB청구합(당월)  차이   차단  경고");
for (const p of periods) {
  const r = must(await U.rpc("bld_calculate", { p_period: p.id, p_asof: null }), `calc ${p.period}`);
  const run = must(await A.from("bld_billing_runs").select("id,blocks,warnings,source_total,allocated_total").eq("period_id", p.id).order("calculated_at", { ascending: false }).limit(1).single(), "run");
  const bills = must(await A.from("bld_bills").select("current_charge").eq("run_id", run.id), "bills");
  const sum = bills.reduce((a, b) => a + Number(b.current_charge ?? 0), 0);
  const blocks = (r?.blocks ?? run.blocks ?? []).map((b) => b.code ?? b).join(",");
  console.log(`${p.period}  ${String(bills.length).padStart(6)}  ${EXPECTED[p.period]?.toLocaleString().padStart(10)}  ${sum.toLocaleString().padStart(12)}  ${String(sum - (EXPECTED[p.period] ?? 0)).padStart(5)}  ${(r?.blocks ?? run.blocks ?? []).length}${blocks ? `(${blocks})` : ""}  ${(r?.warnings ?? run.warnings ?? []).length}  원천${run.source_total}-배분${run.allocated_total}`);
}
