#!/usr/bin/env node
// 실제 로컬 DB → v_materials → mapMaterialRow → resolveSwatch 까지 한 번에 흘려 본다.
// 지금까지는 각 조각만 검증했고, "실제 행이 미리보기 색으로 바뀌는가"는 확인한 적이 없다.
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mapMaterialRow } from "../lib/domain/factory-materials.ts";
import * as fabric from "../lib/garment/fabric.ts";

// 자격 증명은 루트 scripts/verify-*.mjs 와 같은 방식으로 얻는다 —
// .env.local 에는 anon 키만 있고 service_role 키는 로컬 스택이 들고 있다.
let url, service;
try {
  const out = execSync("npx --yes supabase@2.117.0 status -o json", {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  url = j.API_URL;
  service = j.SERVICE_ROLE_KEY;
} catch {
  // 다른 순수 검사와 달리 이건 **로컬 Docker 스택이 떠 있어야** 돈다.
  // 스택이 없을 때 빨간불을 내면 "검사가 깨졌다"로 오해하니 건너뛴다고 분명히 말한다.
  console.log("SKIP: 로컬 Supabase 스택이 없다 → supabase start 후 다시 실행하라.");
  process.exit(0);
}
const sb = createClient(url, service, { auth: { persistSession: false } });

// crm.materials 를 직접 읽는다. v_materials 는 WHERE 에 crm.is_member() 가 있어서
// service_role 로는 **0행**이 나온다 — 그게 게이팅이 동작한다는 뜻이고, 실제 세션으로 뷰를
// 읽는 검증은 scripts/verify-domain.mjs 케이스 17 이 이미 한다(색은 보이고 unit_cost 는 안 보임).
// 여기서 보려는 건 "실제 DB 행이 미리보기 색/무늬까지 도달하는가" 한 가지다.
const { data, error } = await sb.schema("crm").from("materials").select("*").limit(40);
if (error) { console.error("조회 실패:", error.message); process.exit(1); }
console.log(`crm.materials ${data.length}행`);

let withColor = 0, calibrated = 0, registered = 0;
for (const row of data) {
  const m = mapMaterialRow(row);
  const sw = fabric.resolveSwatch(m, m.kind === "button" ? "button" : m.kind === "lining" ? "lining" : "fabric", m.id);
  if (m.colorHex) withColor++;
  if (m.repeatCalibrated) calibrated++;
  if (sw.registered) registered++;
  if (m.colorHex || m.patternKind) {
    console.log(`  ${m.code.padEnd(10)} ${m.name.padEnd(26)} color=${m.colorHex ?? "-"} pattern=${m.patternKind ?? "-"} repeat=${m.repeatMm ? m.repeatMm.w + "x" + m.repeatMm.h : "-"} → registered=${sw.registered} badge=${sw.noteBadge ?? "-"}`);
  }
}
console.log(`\n색 있는 자재 ${withColor} · 반복치수 실측 ${calibrated} · 미리보기 등록 판정 ${registered}`);
if (withColor === 0) { console.error("\n실패: 색을 가진 자재가 0건이다 — 픽스처(--materials)가 안 들어갔거나 매핑이 여전히 끊겨 있다."); process.exit(1); }
console.log("PASS: 실제 DB 행이 미리보기 색/무늬까지 도달한다.");
