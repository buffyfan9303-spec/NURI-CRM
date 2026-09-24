#!/usr/bin/env node
/**
 * 차트 범주형 팔레트 회귀 검증.
 *
 * 왜 필요한가: 레퍼런스 명세 §7이 준 차트 5색은 **눈으로는 충분히 달라 보였지만**
 * 실제로는 `#098658`(녹색) ↔ `#0b9599`(청록) 의 정상시각 ΔE 가 9.7 로 기준 15 미달이었다.
 * 색맹이 아닌 사람도 도넛 조각을 구분하기 어려운 조합이었다.
 * → 색은 눈이 아니라 계산으로 판정한다. 이 검사가 그 판정을 고정한다.
 *
 * 검사 항목(dataviz 6-checks 중 이 프로젝트에 필요한 것):
 *   1. 명도 밴드   — 표면 대비 읽히는 범위 안에 있는가
 *   2. 채도 하한   — 회색으로 읽히지 않는가
 *   3. 인접쌍 분리 — 정상시각 ΔE >= 15, CVD(deutan/protan) ΔE >= 8
 *
 * 실행: node scripts/test-chart-palette.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let pass = 0;
const ok = (n) => { pass++; console.log("  OK ", n); };

/* ── OKLab 변환 (dataviz 검증기와 같은 공간) ───────────────── */
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

const chroma = (c) => Math.hypot(c.a, c.b);
const dE = (x, y) => Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b) * 100;

/** 색각 이상 시뮬레이션(Brettel 근사) — 인접쌍이 CVD 에서도 구분되는지 보기 위함. */
function simulate(hex, type) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
  const M = {
    deutan: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    protan: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  }[type];
  const out = M.map((row) => row[0] * r + row[1] * g + row[2] * b);
  const toHex = (v) => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, s)) * 255).toString(16).padStart(2, "0");
  };
  return "#" + out.map(toHex).join("");
}

/* ── globals.css 에서 실제 토큰을 읽는다(리터럴 복제 금지) ── */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function readChart(marker) {
  const start = css.indexOf(marker);
  assert.ok(start > -1, `블록을 찾지 못함: ${marker}`);
  const block = css.slice(start, css.indexOf("\n}", start));
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const m = block.match(new RegExp(`--ch-${i}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `--ch-${i} 을 찾지 못함 (${marker})`);
    out.push(m[1].toLowerCase());
  }
  return out;
}

const LIGHT = readChart(":root {");
const DARK = readChart('body.dk,\n:root[data-theme="dark"] {');

ok(`라이트 차트색 5개 추출: ${LIGHT.join(" ")}`);
ok(`다크 차트색 5개 추출: ${DARK.join(" ")}`);

/* ── 검사 ──────────────────────────────────────────────── */
const BANDS = { light: [0.43, 0.77], dark: [0.48, 0.67] };
const CHROMA_FLOOR = 0.1;
const NORMAL_FLOOR = 15;
const CVD_FLOOR = 8;

for (const [mode, palette] of [["light", LIGHT], ["dark", DARK]]) {
  const [lo, hi] = BANDS[mode];
  const labs = palette.map(hexToOklab);

  for (let i = 0; i < palette.length; i++) {
    assert.ok(
      labs[i].L >= lo && labs[i].L <= hi,
      `${mode} ${palette[i]} 명도 ${labs[i].L.toFixed(3)} 가 밴드 ${lo}~${hi} 밖 — 표면에서 읽히지 않는다`
    );
    assert.ok(
      chroma(labs[i]) >= CHROMA_FLOOR,
      `${mode} ${palette[i]} 채도 ${chroma(labs[i]).toFixed(3)} < ${CHROMA_FLOOR} — 회색으로 읽힌다`
    );
  }
  ok(`${mode}: 5색 전부 명도 밴드(${lo}~${hi}) · 채도 하한 통과`);

  // 인접쌍 = 도넛/막대에서 실제로 맞닿는 조합
  let worstNormal = Infinity, worstCvd = Infinity, worstPair = "";
  for (let i = 1; i < palette.length; i++) {
    const d = dE(labs[i - 1], labs[i]);
    if (d < worstNormal) { worstNormal = d; worstPair = `${palette[i - 1]}↔${palette[i]}`; }
    for (const t of ["deutan", "protan"]) {
      const c = dE(hexToOklab(simulate(palette[i - 1], t)), hexToOklab(simulate(palette[i], t)));
      if (c < worstCvd) worstCvd = c;
    }
  }
  assert.ok(
    worstNormal >= NORMAL_FLOOR,
    `${mode} 정상시각 인접쌍 ΔE ${worstNormal.toFixed(1)} < ${NORMAL_FLOOR} (${worstPair}) — ` +
      `색각이 정상인 사람도 구분하기 어렵다. 순서를 바꾸거나 색을 교체하라.`
  );
  assert.ok(
    worstCvd >= CVD_FLOOR,
    `${mode} CVD 인접쌍 ΔE ${worstCvd.toFixed(1)} < ${CVD_FLOOR} — 색각 이상에서 구분 불가`
  );
  ok(`${mode}: 인접쌍 정상 ΔE ${worstNormal.toFixed(1)} · CVD ΔE ${worstCvd.toFixed(1)} 통과`);
}

/* ── 계열 수를 늘리지 못하게 막는다 ───────────────────────── */
assert.doesNotMatch(css, /--ch-6:/, "6번째 차트색이 생겼다 — 9색까지 늘리지 말고 '기타'로 묶거나 분할하라");
ok("차트 계열이 5개를 넘지 않는다");

console.log(`\n총 ${pass}건 · 모두 PASS`);
