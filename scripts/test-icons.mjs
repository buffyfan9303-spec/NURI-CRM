#!/usr/bin/env node
/**
 * 아이콘 계약 회귀 검증.
 *
 * 왜 필요한가: lucide-react 는 export 가 6284개라 **없는 이름을 쓰기 쉽다**.
 * 존재하지 않는 이름은 `undefined` 로 import 되어 **런타임에 React 가 터진다**
 * (빌드는 통과할 수 있다 — 그래서 타입체크만으로는 못 잡는다).
 * 실측: `Hanger` 는 lucide 에 없다. 이런 걸 미리 잡는 게 이 검사다.
 *
 * 실행: node scripts/test-icons.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as lucide from "lucide-react";

let pass = 0;
const ok = (n) => { pass++; console.log("  OK ", n); };

const EXPORTS = new Set(Object.keys(lucide));
const src = readFileSync(new URL("../lib/icons.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* ── 1. lib/icons.ts 가 import 하는 이름이 전부 실존하는가 ── */
const importBlock = src.slice(src.indexOf('import {'), src.indexOf('} from "lucide-react"'));
const imported = [...importBlock.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*),/gm)].map((m) => m[1]);

assert.ok(imported.length > 20, `import 목록이 너무 적다(${imported.length}) — 파싱이 틀렸을 수 있다`);

const missing = imported.filter((n) => !EXPORTS.has(n));
assert.deepEqual(
  missing,
  [],
  `lucide-react 에 없는 아이콘 이름: ${missing.join(", ")} — import 하면 undefined 가 되어 런타임에 깨진다`
);
ok(`lib/icons.ts 의 ${imported.length}개 아이콘이 전부 lucide-react 에 실존한다`);

/* ── 2. 실제 컴포넌트인가 (undefined 나 문자열이 아닌가) ── */
for (const n of imported) {
  const v = lucide[n];
  assert.ok(
    typeof v === "function" || (v && typeof v === "object"),
    `${n} 이 렌더 가능한 컴포넌트가 아니다 (typeof=${typeof v})`
  );
}
ok("전부 렌더 가능한 컴포넌트다");

/* ── 3. 업종 5종이 모두 매핑돼 있는가 ── */
const configSrc = readFileSync(new URL("../lib/industry/config.ts", import.meta.url), "utf8");
const industries = [...configSrc.matchAll(/^\s{2}(\w+): \{\n\s{4}key: "(\w+)"/gm)].map((m) => m[2]);
const uniqueIndustries = [...new Set(industries)];
assert.ok(uniqueIndustries.length >= 5, `업종을 ${uniqueIndustries.length}개만 찾았다 — 파싱 확인 필요`);

for (const ind of uniqueIndustries) {
  assert.match(
    src,
    new RegExp(`^\\s{2}${ind}: `, "m"),
    `INDUSTRY_ICON 에 '${ind}' 가 없다 — 업종 아이콘이 비어 렌더된다`
  );
}
ok(`업종 ${uniqueIndustries.length}종이 INDUSTRY_ICON 에 전부 매핑돼 있다`);

/* ── 4. 모든 nav key 가 매핑돼 있는가 ── */
const navKeys = [...new Set([...configSrc.matchAll(/\{ key: "([\w-]+)", path:/g)].map((m) => m[1]))];
assert.ok(navKeys.length > 10, `nav key 를 ${navKeys.length}개만 찾았다 — 파싱 확인 필요`);

const unmapped = navKeys.filter((k) => !new RegExp(`^\\s{2}"?${k}"?:`, "m").test(src));
assert.deepEqual(
  unmapped,
  [],
  `NAV_ICON 에 없는 메뉴 key: ${unmapped.join(", ")} — CircleDot 로 떨어져 의미 없는 아이콘이 뜬다`
);
ok(`메뉴 key ${navKeys.length}개가 전부 NAV_ICON 에 매핑돼 있다`);

/* ── 5. 신규 화면이 Tabler 를 쓰지 않는가 (동결본은 예외) ── */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** rg/grep 에 의존하지 않는다 — 이 환경에서 rg 실행이 실패해 검사가 조용히 SKIP 됐었다. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // 없는 디렉터리는 건너뛴다
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
  return out;
}
const NEW_SCREEN_DIRS = [
  "app/w",
  "app/login",
  "app/select",
  "app/signup",
  "app/reset",
  "components/shell",
  "components/auth",
  "components/home",
  "components/charts",
  "components/garment",
];

const scanned = NEW_SCREEN_DIRS.flatMap((d) => walk(join(root, d)));
assert.ok(scanned.length > 20, `신규 화면 파일을 ${scanned.length}개만 찾았다 — 경로 확인 필요`);

const tablerHits = scanned
  .filter((p) => readFileSync(p, "utf8").includes("@tabler/icons-react"))
  .map((p) => p.slice(root.length).replace(/\\/g, "/"));

assert.deepEqual(
  tablerHits,
  [],
  `신규 화면 ${tablerHits.length}개가 아직 @tabler/icons-react 를 쓴다:\n  ${tablerHits.join("\n  ")}\n` +
    `→ lib/icons.ts 로 바꿔라. (구 시제품 app/(app)/** 는 동결본이므로 그대로 둔다)`
);
ok(`신규 화면 ${scanned.length}개가 Tabler 를 쓰지 않는다`);

console.log(`\n총 ${pass}건 · 모두 PASS`);
