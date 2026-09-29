#!/usr/bin/env node
/**
 * 12px 미만 글자 금지 회귀 검증(UI 실측 D13~D17·D21, 리더 결정 2026-09-29).
 * 업종 화면 폴더에 `text-[9~11(.n)px]` 리터럴이 다시 생기면 실패한다 — 토큰(`text-[length:var(--fs-meta)]`)을 쓴다.
 * 셸·캘린더·ui 프리미티브·globals.css 는 다른 소유자 범위라 여기서는 보지 않는다.
 * 실행: node scripts/test-min-font.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// 전체(components/**, app/**)를 본다. 아래 동결된 기존 공장·MTM 화면(레이아웃 변경 금지, 사용자 지시)만 제외 — 새 폴더는 자동으로 검사 대상이다.
const DIRS = ["components", "app"];
const FROZEN_LEGACY = [
  "components/accounting/", "components/admin/", "components/common/", "components/customer/", "components/dashboard/", "components/delivery/",
  "components/layout/", "components/mtm/", "components/order/", "components/production/", "components/style/", "components/vendor/", "app/(app)/",
];
const RE = /text-\[(9|10|11)(\.\d)?px\]/;

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
});
const bad = [];
for (const f of DIRS.flatMap((d) => walk(join(root, d)))) {
  const rel = f.slice(root.length).replaceAll("\\", "/").replace(/^\//, "");
  if (FROZEN_LEGACY.some((p) => rel.startsWith(p))) continue;
  readFileSync(f, "utf8").split(/\r?\n/).forEach((l, i) => { if (RE.test(l)) bad.push(`${rel}:${i + 1}`); });
}
assert.deepEqual(bad, [], "12px 미만 글자 리터럴:\n" + bad.join("\n"));
console.log("  OK  components/**·app/** (동결 레거시 제외)에 12px 미만 글자 리터럴 0건");
