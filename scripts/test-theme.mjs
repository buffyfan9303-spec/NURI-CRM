/**
 * 테마 계약 회귀 검증 (docs/crm-contract.md §6).
 *
 * 실제로 났던 회귀 2건을 잡는다:
 *  1. 런타임 토글이 body.dk 만 바꾸고 data-theme·theme-color 를 안 바꿔 신호가 어긋남
 *  2. ThemeProvider 가 복원 전 초기값(false)으로 스토어에 써서 저장된 dark 를 덮어씀
 *
 * 실행: node scripts/test-theme.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let pass = 0;
const ok = (name) => {
  pass++;
  console.log("  OK ", name);
};

const store = readFileSync(new URL("../lib/stores/themeStore.ts", import.meta.url), "utf8");
/** 주석을 지운다 — 주석에 적힌 설명(예: "setDark(false) 같은 쓰기를 하면")을 코드로 오인하지 않기 위해. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const provider = stripComments(
  readFileSync(new URL("../components/providers/ThemeProvider.tsx", import.meta.url), "utf8")
);
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/* ── 1. 세 신호를 한 함수에서 함께 갱신하는가 ─────────────── */
const applyBody = store.slice(store.indexOf("export function applyTheme"));
const applyFn = applyBody.slice(0, applyBody.indexOf("\n}\n") + 2);

assert.match(applyFn, /setAttribute\(\s*["']data-theme["']/, "applyTheme 이 data-theme 을 쓰지 않는다");
ok("applyTheme 이 <html data-theme> 를 갱신한다");

assert.match(applyFn, /classList\.toggle\(\s*["']dk["']/, "applyTheme 이 body.dk 를 쓰지 않는다");
ok("applyTheme 이 body.dk 를 갱신한다 (레거시 셀렉터 호환)");

assert.match(applyFn, /theme-color/, "applyTheme 이 theme-color 를 쓰지 않는다");
ok("applyTheme 이 theme-color meta 를 갱신한다");

/* ── 2. 모든 토글 경로가 applyTheme 하나를 지나가는가 ────── */
const directDomWrites = [...store.matchAll(/document\.(body|documentElement)\./g)].length;
const insideApply = [...applyFn.matchAll(/document\.(body|documentElement)\./g)].length;
assert.equal(
  directDomWrites,
  insideApply,
  "applyTheme 밖에서 DOM 을 직접 건드리는 코드가 있다 — 신호가 어긋난다"
);
ok("themeStore 의 DOM 쓰기가 applyTheme 안에만 있다");

for (const action of ["toggle", "setDark"]) {
  // 인터페이스 선언(`toggle: () => void;`)이 아니라 **구현부**를 봐야 하므로 마지막 등장을 쓴다.
  const at = store.lastIndexOf(`${action}:`);
  assert.ok(at > -1, `${action} 구현을 찾지 못했다`);
  const seg = store.slice(at, at + 260);
  assert.match(seg, /applyTheme\(/, `${action} 이 applyTheme 을 부르지 않는다`);
}
ok("toggle / setDark 모두 applyTheme 을 지나간다");

/* ── 3. ThemeProvider 가 스토어에 쓰지 않는가 (회귀 #6) ───── */
assert.doesNotMatch(
  provider,
  /setDark\(|\.setState\(|useThemeStore\.getState\(\)\.(toggle|setDark)/,
  "ThemeProvider 가 스토어에 쓴다 — 복원 전 초기값으로 저장된 dark 를 덮어쓸 수 있다"
);
ok("ThemeProvider 가 스토어에 쓰지 않는다 (저장값 덮어쓰기 방지)");

assert.match(
  provider,
  /hasHydrated\(\)|onFinishHydration/,
  "ThemeProvider 가 persist 복원 신호를 쓰지 않는다 — 복원 전에 실행될 수 있다"
);
ok("ThemeProvider 가 persist 복원 신호(hasHydrated/onFinishHydration)를 쓴다");

/* ── 4. 부트스트랩이 light 로 폴백하는가 ──────────────────── */
const boot = layout.slice(layout.indexOf("THEME_BOOTSTRAP_SCRIPT"));
const bootScript = boot.slice(0, boot.indexOf("`;") + 2);
assert.match(bootScript, /try\{|try \{/, "부트스트랩에 try/catch 가 없다");
assert.match(bootScript, /catch[\s\S]{0,120}['"]light['"]/, "부트스트랩 catch 가 light 로 폴백하지 않는다");
ok("부트스트랩이 저장값 손상·localStorage 접근 실패 시 light 로 폴백한다");

assert.ok(
  bootScript.indexOf("'dark'") > -1 || bootScript.indexOf('"dark"') > -1,
  "부트스트랩이 dark 를 복원하지 않는다"
);
ok("부트스트랩이 명시적으로 저장된 dark 는 복원한다");

/* ── 5. theme-color 값이 layout 과 store 에서 일치하는가 ──── */
const layoutColors = [...layout.matchAll(/color:\s*"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]);
const storeColors = [...store.matchAll(/(?:light|dark):\s*"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]);
assert.ok(storeColors.length >= 2, "store 에 THEME_COLOR 상수가 없다");
for (const c of storeColors) {
  assert.ok(
    layoutColors.includes(c),
    `store 의 theme-color ${c} 가 layout.tsx 의 viewport.themeColor 에 없다 — 두 곳이 어긋났다`
  );
}
ok("theme-color 값이 layout.tsx 와 themeStore 에서 일치한다");

/* ── 6. CSS 가 두 셀렉터를 모두 매칭하는가 ────────────────── */
assert.match(css, /\[data-theme="dark"\]/, "globals.css 가 data-theme 을 매칭하지 않는다");
assert.match(css, /body\.dk/, "globals.css 가 레거시 body.dk 를 매칭하지 않는다");
ok("globals.css 가 data-theme 과 body.dk 를 모두 매칭한다");

assert.match(css, /color-scheme:\s*light/, "color-scheme: light 선언이 없다");
assert.match(css, /color-scheme:\s*dark/, "color-scheme: dark 선언이 없다");
ok("color-scheme 이 light/dark 각각 선언되어 있다");

console.log(`\n총 ${pass}건 · 모두 PASS`);
