#!/usr/bin/env node
// 재발 방지 계약: lib/ 안의 Supabase UPDATE/DELETE 는 반드시 영향행을 검사한다.
//
// 배경: PostgREST 는 RLS 가 막은 UPDATE/DELETE 를 오류가 아니라 "0행 200" 으로 돌려준다.
// `const { error } = await sb...update(...)` 처럼 error 만 검사하면 권한이 없어 아무것도
// 안 바뀐 요청이 성공으로 보고된다("화면에서만 됐고 새로고침하면 되살아난다").
//
// 통과 조건(둘 중 하나) — 같은 문장(이전 ';' ~ 다음 ';') 안에:
//   1. lib/db/mustAffect.ts 의 `mustAffect(` 로 감쌌다.
//   2. `// affected-ok: <이유>` 주석으로 0행이 정상인 멱등 변이임을 선언했다(이유 필수).
//
// INSERT/UPSERT 는 검사하지 않는다 — RLS WITH CHECK 위반과 ON CONFLICT DO UPDATE 의 USING
// 위반은 Postgres 가 42501 오류로 던지므로 error 검사만으로 잡힌다.
// `.from(` 이 없는 문장(JS Set/Map/URLSearchParams 의 .delete) 은 Supabase 변이가 아니므로 제외한다.
//
// 실행: node scripts/verify-mutation-affected.mjs   (npm run verify:mutations)
// 위반이 있으면 파일:줄 을 출력하고 exit 1.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SCAN_DIR = join(ROOT, "lib");
const MUTATION_RE = /\.(update|delete)\(/g;
const GUARD_RE = /\bmustAffect(?:<[^>]*>)?\(/;
const EXEMPT_RE = /\/\/[ \t]*affected-ok:[ \t]*\S/; // 이유는 같은 줄에 있어야 한다(줄바꿈 뒤 코드가 이유로 오인되지 않게)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** 위치 idx 를 포함하는 "문장" = 이전 ';' 다음부터 다음 ';' 까지. 체인이 여러 줄이어도 한 덩어리로 본다. */
function statementAround(src, idx) {
  const start = src.lastIndexOf(";", idx) + 1;
  const endIdx = src.indexOf(";", idx);
  const end = endIdx === -1 ? src.length : endIdx;
  return src.slice(start, end);
}

function lineOf(src, idx) {
  let n = 1;
  for (let i = 0; i < idx; i += 1) if (src.charCodeAt(i) === 10) n += 1;
  return n;
}

export function findViolations(files) {
  const violations = [];
  let checked = 0;
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (rel === "lib/db/mustAffect.ts") continue; // 헬퍼 자신의 주석 예시는 대상이 아니다
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(MUTATION_RE)) {
      const stmt = statementAround(src, m.index);
      if (!stmt.includes(".from(")) continue; // Supabase 체인이 아니다(JS Set 등)
      checked += 1;
      if (GUARD_RE.test(stmt) || EXEMPT_RE.test(stmt)) continue;
      violations.push(`${rel}:${lineOf(src, m.index)}  .${m[1]}( 영향행 검사 없음`);
    }
  }
  return { violations, checked };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { violations, checked } = findViolations(walk(SCAN_DIR));
  if (violations.length > 0) {
    console.error(`FAIL  영향행 검사 없는 Supabase UPDATE/DELETE ${violations.length}건 (검사한 변이 ${checked}건)`);
    for (const v of violations) console.error(`  ${v}`);
    console.error("  → mustAffect(...) 로 감싸거나, 0행이 정상인 멱등 변이면 같은 문장에 `// affected-ok: <이유>` 를 남기세요.");
    process.exit(1);
  }
  if (checked === 0) {
    console.error("FAIL  검사한 변이가 0건 — 스캐너 패턴이 코드와 어긋났을 수 있습니다.");
    process.exit(1);
  }
  console.log(`PASS  Supabase UPDATE/DELETE ${checked}건 전부 영향행 검사(mustAffect) 또는 예외 선언 있음`);
}
