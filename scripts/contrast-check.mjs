#!/usr/bin/env node
/**
 * WCAG 2.x 대비비 검증 (§5.3 색상표 / §11-8).
 *
 * **토큰 값을 복사해 두지 않는다.** `app/globals.css` 를 직접 파싱한다 —
 * 예전 버전은 리터럴을 복제해 둬서 토큰을 바꾸면 검사와 실제 화면이 조용히 어긋났다.
 *
 * 기준: 본문 4.5:1 / 큰 텍스트(18.66px+ 또는 14px+bold) 3:1 / 비텍스트(테두리·아이콘) 3:1.
 * 이건 **토큰 계산**이다. 실제 화면의 computed style 검사(§11-8)를 대체하지 않는다.
 *
 * 실행: node scripts/contrast-check.mjs   (하나라도 미달이면 exit 1)
 */
import { readFileSync } from "node:fs";

/* ── 색 유틸 ─────────────────────────────────────────────── */

function toRgb(color, backdrop = [255, 255, 255]) {
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    if (hex.length !== 6) throw new Error(`unsupported hex: ${color}`);
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\)/);
  if (!m) throw new Error(`unparsable color: ${color}`);
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  return [+m[1], +m[2], +m[3]].map((c, i) => c * a + backdrop[i] * (1 - a));
}

const relLum = ([r, g, b]) =>
  [r, g, b]
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);

function ratio(fg, bg) {
  const [a, b] = [relLum(toRgb(fg, toRgb(bg))), relLum(toRgb(bg))];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── globals.css 에서 토큰 읽기 ──────────────────────────── */

// CRLF 로 저장돼 있어도 동작해야 하므로 개행을 정규화한 뒤 찾는다.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function block(startMarker) {
  const i = css.indexOf(startMarker);
  if (i < 0) throw new Error(`블록을 찾지 못함: ${startMarker}`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

function parseTokens(text) {
  const out = {};
  for (const m of text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  // var(--x) 별칭 해소
  for (const k of Object.keys(out)) {
    let guard = 0;
    while (out[k].startsWith("var(--") && guard++ < 10) {
      const ref = out[k].slice(6, out[k].indexOf(")"));
      out[k] = out[ref] ?? out[k];
    }
  }
  return out;
}

const L = parseTokens(block(":root {"));
// 다크 블록은 :root 를 **덮어쓰는** 것이라, 다크가 재정의하지 않은 토큰(아트 색 등)은
// 라이트 값을 그대로 상속한다. 그 CSS 의미를 반영해야 "토큰 없음" 오탐이 안 난다.
const D = { ...L, ...parseTokens(block('body.dk,\n:root[data-theme="dark"] {')) };

/* ── 검사 조합 (§11-8) ───────────────────────────────────── */

/** [설명, 전경키, 배경키, 종류] — 종류: text | large | nontext */
const CASES = [
  ["본문 글자 / 업무 표면", "t", "sf", "text"],
  ["본문 글자 / 전체 배경", "t", "bg", "text"],
  ["본문 글자 / 표 머리글", "t", "sf2", "text"],
  ["본문 글자 / 행 hover", "t", "sf3", "text"],
  ["본문 글자 / 선택 행", "t", "sel", "text"],
  ["보조 글자 / 업무 표면", "t2", "sf", "text"],
  ["보조 글자 / 표 머리글", "t2", "sf2", "text"],
  ["작은 메타 / 업무 표면", "t3", "sf", "text"],
  ["작은 메타 / 전체 배경", "t3", "bg", "text"],
  ["작은 메타 / 선택 행", "t3", "sel", "text"],
  ["메뉴 글자 / 메뉴 배경", "sbt", "nav", "text"],
  ["메뉴 보조글자 / 메뉴 배경", "sbt2", "nav", "text"],
  ["메뉴 활성 글자 / 선택 배경", "t", "sel", "text"],
  ["링크·활성 글자 / 업무 표면", "accent-ink", "sf", "text"],
  ["링크·활성 글자 / 전체 배경", "accent-ink", "bg", "text"],
  ["주요버튼 글자 / 주요버튼", "accent-contrast", "accent-strong", "text"],
  ["주요버튼 글자 / 버튼 hover", "accent-contrast", "accent-hover", "text"],
  ["완료 배지", "okt", "okb", "text"],
  ["주의 배지", "wt", "wb", "text"],
  ["오류 배지", "et", "eb", "text"],
  ["정보 배지", "it", "ib", "text"],
  ["입력 테두리 / 업무 표면", "bd2", "sf", "nontext"],
  ["입력 테두리 / 전체 배경", "bd2", "bg", "nontext"],
  ["포커스링 / 업무 표면", "focus", "sf", "nontext"],
  ["포커스링 / 전체 배경", "focus", "bg", "nontext"],
  ["주요버튼 면 / 업무 표면", "accent-strong", "sf", "nontext"],
  ["달력 칩 글자 / 정보 배경", "it", "ib", "text"],
  ["달력 칩 글자 / 완료 배경", "okt", "okb", "text"],

  /* 인증 세계(reference-03 §9.1). 업무 화면과 팔레트가 완전히 분리돼 있어 따로 검사한다.
     실제 화면 캡처 픽셀 측정과도 대조했다(양 테마 전 항목 통과). */
  ["인증 제목 / 프레임", "auth-tx", "auth-frame", "text"],
  ["인증 보조글자 / 프레임", "auth-tx2", "auth-frame", "text"],
  ["인증 보조글자 / 입력면", "auth-tx2", "auth-field", "text"],
  ["인증 링크 / 프레임", "auth-accent", "auth-frame", "text"],
  ["인증 오류 / 프레임", "auth-error", "auth-frame", "text"],
  ["인증 CTA 글자 / CTA", "auth-cta-tx", "auth-cta", "text"],
  ["인증 CTA 글자 / CTA hover", "auth-cta-tx", "auth-cta-hover", "text"],
  ["인증 입력 경계 / 입력면", "auth-input-bd", "auth-field", "nontext"],
  ["인증 입력 경계 / 프레임", "auth-input-bd", "auth-frame", "nontext"],
  ["인증 CTA 면 / 프레임", "auth-cta", "auth-frame", "nontext"],
  ["아트 큰제목 / 아트 바탕", "auth-art-tx", "auth-art", "large"],
  ["아트 설명 / 아트 바탕", "auth-art-tx2", "auth-art", "text"],
];

const MIN = { text: 4.5, large: 3, nontext: 3 };

let pass = 0;
const fails = [];
const rows = [];

for (const [theme, tok] of [["light", L], ["dark", D]]) {
  for (const [label, fgK, bgK, kind] of CASES) {
    const fg = tok[fgK];
    const bg = tok[bgK];
    if (!fg || !bg) {
      fails.push(`${theme} ${label}: 토큰 없음 (--${fgK} / --${bgK})`);
      continue;
    }
    const r = ratio(fg, bg);
    const need = MIN[kind];
    const ok = r >= need;
    ok ? pass++ : fails.push(`${theme} ${label}: ${r.toFixed(2)} < ${need} (${fg} on ${bg})`);
    rows.push(
      `${theme.padEnd(5)} ${label.padEnd(30)} ${fgK}/${bgK}`.padEnd(62) +
        `${kind.padEnd(8)} ${r.toFixed(2).padStart(6)}  ${String(need).padStart(3)}  ${ok ? "PASS" : "FAIL"}`
    );
  }
}

console.log(rows.join("\n"));
console.log(`\n${pass}/${pass + fails.length} passed, ${fails.length} failed.`);
if (fails.length) {
  console.log("\n미달 항목:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
