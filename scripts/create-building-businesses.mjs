#!/usr/bin/env node
// 건물 관리비 업종 사업장 2곳을 만든다(없을 때만). service_role 로 businesses + memberships 만 insert.
//   node scripts/create-building-businesses.mjs
// - "건물 관리비(실데이터)": owner = 마스터만. 실제 입주자 정보가 들어가므로 체험 계정(admin@nuricrm.com)을 넣지 않는다.
// - "누리 빌딩(체험)": owner = 마스터, manager = admin@nuricrm.com. 가명 시드 전용.
// 출력: 두 사업장 id(JSON). 이미 있으면 기존 id 를 돌려준다.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function env(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  return readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.+)$`, "m"))?.[1].trim();
}
const URL = env("NEXT_PUBLIC_SUPABASE_URL"), SR = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !SR) { console.error("SKIP  환경변수 없음"); process.exit(2); }
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const A = admin.schema("crm");
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.code} ${r.error.message}`); return r.data; };

const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) throw error;
const uid = (email) => list.users.find((u) => u.email === email)?.id ?? (() => { throw new Error(`사용자 없음: ${email}`); })();
const MASTER = uid("buffyfan9303@gmail.com"), DEMO = uid("admin@nuricrm.com");

async function ensure(name, members) {
  const found = must(await A.from("businesses").select("id").eq("name", name).eq("industry", "building").maybeSingle(), "find");
  const id = found?.id ?? must(await A.from("businesses").insert({ name, industry: "building" }).select("id").single(), "insert").id;
  for (const [user_id, role] of members) {
    const has = must(await A.from("memberships").select("id").eq("business_id", id).eq("user_id", user_id).maybeSingle(), "mem find");
    if (!has) must(await A.from("memberships").insert({ business_id: id, user_id, role }), "mem insert");
  }
  return id;
}
const real = await ensure("건물 관리비(실데이터)", [[MASTER, "owner"]]);
const demo = await ensure("누리 빌딩(체험)", [[MASTER, "owner"], [DEMO, "manager"]]);
console.log(JSON.stringify({ real, demo, master: MASTER, demo_user: DEMO }));
