#!/usr/bin/env node
/**
 * 색 토큰 계약 회귀 검증 (§5.3).
 *
 * 실제로 났던 결함 2건을 잡는다:
 *  1. CSS 변수 토큰에 opacity modifier(`bg-sf2/40`)를 쓰면 **빈 규칙으로 사라짐**
 *     → tailwind.config.ts 가 `var(--x)` 문자열이 아니라 알파를 합성하는 함수를 써야 한다.
 *  2. globals.css 의 토큰과 tailwind.config.ts 의 노출 목록이 어긋남
 *     → 화면에서 `bg-nav` 같은 클래스가 아무 일도 안 하게 된다.
 *
 * 실행: node scripts/test-tokens.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const ok = (n) => { pass++; console.log("  OK ", n); };

const root = new URL("..", import.meta.url);
const css = readFileSync(new URL("app/globals.css", root), "utf8").replace(/\r\n/g, "\n");
const twSrc = readFileSync(new URL("tailwind.config.ts", root), "utf8");

/* ── 1. tailwind 가 알파를 합성할 수 있는 형태인가 ────────── */
assert.match(
  twSrc,
  /opacityValue/,
  "tailwind.config.ts 가 opacityValue 를 다루지 않는다 — bg-x/NN 이 무효가 된다"
);
ok("tailwind 색 토큰이 opacity modifier 를 처리한다");

assert.doesNotMatch(
  twSrc.replace(/\/\*[\s\S]*?\*\//g, ""),
  /:\s*"var\(--[\w-]+\)"/,
  "아직 `var(--x)` 문자열로 정의된 색 토큰이 남아 있다 — 그 토큰은 /NN 이 무효다"
);
ok("모든 색 토큰이 문자열이 아닌 합성 함수로 정의돼 있다");

/* ── 2. globals.css 토큰 ↔ tailwind 노출 목록 일치 ────────── */
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
const declared = new Set([...rootBlock.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));

// 화면에서 실제로 쓰는 핵심 의미 토큰은 반드시 양쪽에 다 있어야 한다.
const REQUIRED = [
  "bg", "nav", "sf", "sf2", "sf3", "sel", "bd", "bd2",
  "t", "t2", "t3",
  "accent", "accent-strong", "accent-hover", "accent-contrast", "accent-ink", "accent-soft",
  "focus", "okb", "okt", "wb", "wt", "eb", "et", "ib", "it",
];
for (const name of REQUIRED) {
  assert.ok(declared.has(name), `globals.css 에 --${name} 이 없다`);
  assert.ok(
    twSrc.includes(`tok("${name}")`),
    `tailwind.config.ts 가 --${name} 을 노출하지 않는다 (화면 클래스가 무효가 된다)`
  );
}
ok(`핵심 의미 토큰 ${REQUIRED.length}개가 globals.css 와 tailwind 양쪽에 있다`);

/* ── 3. 브랜드가 하나로 수렴했는가 ────────────────────────── */
assert.match(
  rootBlock,
  /--acc:\s*var\(--accent-strong\)/,
  "--acc 가 --accent-strong 별칭이 아니다 — 네이비/인디고가 다시 경쟁한다"
);
ok("--acc 가 --accent-strong 별칭이다 (브랜드 수렴)");

/* ── 4. 실제로 CSS 가 생성되는가 (가장 확실한 검사) ───────── */
const dir = mkdtempSync(join(tmpdir(), "nuri-tok-"));
const probe = join(dir, "probe.html");
// modifier 있는 것과 **없는 것**을 둘 다 넣는다 — 없는 쪽이 NaN% 버그가 났던 경로다.
writeFileSync(
  probe,
  `<div class="bg-sf2/40 border-et/30 bg-sf bg-nav text-t text-accent-ink bg-sel"></div>`
);
const out = join(dir, "out.css");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tailwindcss", "-i", "app/globals.css", "-o", out, "--content", probe],
  { cwd: fileURLToPath(root), stdio: "ignore", shell: process.platform === "win32" }
);
const generated = readFileSync(out, "utf8");

assert.match(generated, /color-mix/, "opacity modifier 가 CSS 를 만들지 못했다 (빈 규칙)");
ok("bg-sf2/40 · border-et/30 이 실제 color-mix CSS 를 생성한다");

/* ── 4-b. 생성된 값이 **유효한가** ──────────────────────────
   예전 이 검사는 "color-mix 문자열이 있는가"만 봤고, 그래서 초록불인데 앱이 깨져 있었다:
   Tailwind 는 modifier 없는 클래스(`bg-sf`)에도 opacityValue 로 문자열
   `"var(--tw-bg-opacity)"` 를 넘기는데, tok() 이 그걸 Number() 로 바꿔 `NaN%` 를 만들었다.
   CSS 파서는 `NaN%` 가 든 선언을 통째로 버리므로 bg-sf·bg-nav·text-t 가 **아무 색도 칠하지 않았다.**
   → 문자열 존재가 아니라 **값의 유효성**을 본다. */
assert.doesNotMatch(
  generated,
  /NaN/,
  "생성된 CSS 에 NaN 이 있다 — 그 선언은 브라우저가 통째로 버려서 색이 칠해지지 않는다"
);
ok("생성된 CSS 에 NaN 이 없다 (선언이 버려지지 않는다)");

// modifier 없는 클래스는 color-mix 가 아니라 var() 를 그대로 써야 한다.
const plain = generated.match(/\.bg-sf\s*\{[^}]*\}/);
assert.ok(plain, ".bg-sf 규칙이 생성되지 않았다");
assert.match(
  plain[0],
  /var\(--sf\)/,
  `.bg-sf 가 var(--sf) 를 쓰지 않는다 — modifier 없는 클래스에 색이 안 들어간다: ${plain[0]}`
);
ok("modifier 없는 클래스(bg-sf)가 var(--sf) 를 그대로 쓴다");

// 퍼센트가 실제 숫자인지 — `${NaN}%` 같은 값이 다시 들어오면 잡는다.
for (const m of generated.matchAll(/color-mix\(in srgb,[^)]*?\s([\d.]+|\S+)%/g)) {
  assert.ok(
    Number.isFinite(Number(m[1])),
    `color-mix 퍼센트가 숫자가 아니다: "${m[1]}" — 선언이 무효화된다`
  );
}
ok("모든 color-mix 퍼센트가 유효한 숫자다");

for (const cls of ["bg-nav", "text-accent-ink", "bg-sel"]) {
  const esc = cls.replace(/([.\\/])/g, "\\$1");
  assert.ok(
    new RegExp(`\\.${esc}\\b`).test(generated),
    `${cls} 클래스가 CSS 에 생성되지 않았다`
  );
}
ok("신규 의미 토큰 클래스(bg-nav / text-accent-ink / bg-sel)가 생성된다");

console.log(`\n총 ${pass}건 · 모두 PASS`);
