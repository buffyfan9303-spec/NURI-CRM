#!/usr/bin/env node
// lib/domain/factory-options.ts 자체 검증 — 정장 옵션 41항목 누락 방지 회귀 체크리스트.
// 근거: docs/crm-baseline-inventory.md §C, docs/crm-migration-map.md §2.
// 실행: node scripts/test-factory-options.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as opts from "../lib/domain/factory-options.ts";
import * as spec from "../lib/garment/spec.ts";
import * as fabric from "../lib/garment/fabric.ts";
import * as materials from "../lib/domain/factory-materials.ts";

const {
  FACTORY_OPTION_FIELDS,
  FACTORY_QTY_FIELDS,
  FACTORY_OPTION_GROUPS,
  defaultFactoryOptions,
  defaultFactoryQty,
  validateFactoryOptions,
  fieldsByGroup,
} = opts;

let count = 0;
function check(name, fn) {
  fn();
  count += 1;
  console.log(`PASS  ${name}`);
}

const EXPECTED_GROUP_COUNTS = {
  "일정/수량": 4, // qty(jsonb) 4개
  "상의": 16,
  "패턴 수정": 2,
  "하의": 10,
  "조끼": 5,
  "기타": 4,
};

check("총 41항목(qty 4 + options 37)", () => {
  assert.equal(FACTORY_QTY_FIELDS.length, 4);
  assert.equal(FACTORY_OPTION_FIELDS.length, 37);
  assert.equal(FACTORY_QTY_FIELDS.length + FACTORY_OPTION_FIELDS.length, 41);
});

check("그룹별 개수가 기준본 표와 일치", () => {
  assert.equal(FACTORY_QTY_FIELDS.length, EXPECTED_GROUP_COUNTS["일정/수량"]);
  for (const g of FACTORY_OPTION_GROUPS) {
    if (g === "일정/수량") continue;
    const n = fieldsByGroup(g).length;
    assert.equal(n, EXPECTED_GROUP_COUNTS[g], `그룹 "${g}" 개수 불일치: ${n}`);
  }
});

check("키 중복 없음(qty+options 합쳐서도)", () => {
  const keys = [...FACTORY_QTY_FIELDS, ...FACTORY_OPTION_FIELDS].map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "중복 키 발견");
});

check("모든 항목에 기본값이 있고, select는 기본값이 선택지 목록 안에 있다", () => {
  for (const f of [...FACTORY_QTY_FIELDS, ...FACTORY_OPTION_FIELDS]) {
    assert.notEqual(f.default, undefined, `${f.key}: 기본값 없음`);
    if (f.kind === "select") {
      assert.ok(f.choices.length > 0, `${f.key}: 선택지 없음`);
      assert.ok(f.choices.includes(f.default), `${f.key}: 기본값 "${f.default}"이 선택지 밖`);
    }
    if (f.kind === "number") {
      assert.equal(typeof f.default, "number", `${f.key}: 기본값이 숫자가 아님`);
    }
    if (f.kind === "pad") {
      assert.equal(typeof f.default.L, "number");
      assert.equal(typeof f.default.R, "number");
    }
  }
});

check("기준본 §C 표의 상의 16종 키가 전부 존재", () => {
  const expected = [
    "bond", "design", "btnN", "lapel", "lapelSize", "lapelDet", "lining",
    "vent", "hak", "frontPocket", "shldSew", "cuff", "pad", "amf", "sweatPad", "ticketP",
  ];
  const actual = fieldsByGroup("상의").map((f) => f.key);
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

check("기준본 §C 표의 하의 10종 키가 전부 존재", () => {
  const expected = [
    "botSew", "botTuck", "obi", "botFrontP", "botBackP",
    "botHem", "sas", "taping", "beltLoop", "vCut",
  ];
  const actual = fieldsByGroup("하의").map((f) => f.key);
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

check("기준본 §C 표의 조끼 5종 키가 전부 존재", () => {
  const expected = ["vestFasten", "vestBtnN", "vestPocketN", "vestBack", "vestLapel"];
  const actual = fieldsByGroup("조끼").map((f) => f.key);
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

check("패턴 수정 2종(shldFix/postFix) 존재, 보정치 라벨 형식 유지", () => {
  const shldFix = FACTORY_OPTION_FIELDS.find((f) => f.key === "shldFix");
  const postFix = FACTORY_OPTION_FIELDS.find((f) => f.key === "postFix");
  assert.ok(shldFix && postFix);
  assert.equal(shldFix.choices.length, 7);
  assert.equal(postFix.choices.length, 7);
});

check("goji/btnext/vest(통합)/fitYn 4종 — '기타' 그룹에서 누락되지 않음", () => {
  const keys = fieldsByGroup("기타").map((f) => f.key).sort();
  assert.deepEqual(keys, ["btnext", "fitYn", "goji", "vest"]);
});

check("defaultFactoryOptions()/defaultFactoryQty() 가 정확히 37/4개 키를 채운다", () => {
  assert.equal(Object.keys(defaultFactoryOptions()).length, 37);
  assert.equal(Object.keys(defaultFactoryQty()).length, 4);
});

check("defaultFactoryOptions() 는 그대로 validateFactoryOptions()를 통과한다", () => {
  const r = validateFactoryOptions(defaultFactoryOptions());
  assert.equal(r.ok, true, r.ok ? "" : r.errors.join(" / "));
});

check("validateFactoryOptions()는 허용되지 않은 select 값을 잡아낸다", () => {
  const bad = defaultFactoryOptions();
  bad.bond = "존재하지않는값";
  const r = validateFactoryOptions(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("접착")));
});

check("코트는 옵션 세트가 없다는 플래그가 존재(기준본: 패턴 선택만으로 사이즈 자동 반영)", () => {
  assert.equal(opts.COAT_HAS_NO_OPTIONS, true);
});

// ── 여기부터 요청 §4/§완료기준 1 추가: 41항목 시각 반영 검증 ──────────────────
// "시각 반영"을 "렌더러(buildGarmentSpec)가 그 키를 실제로 읽어 결과에 반영하는가"로
// 정의한다. 모든 선택지가 서로 달라야 한다는 뜻은 아니다(예: 41항목 표의 hak×frontPocket처럼
// 두 키가 같은 부위를 다른 각도로 표현해 일부 조합이 겹칠 수 있다) — "이 키를 바꿨을 때
// 결과가 단 한 번도 안 바뀌면 죽은 키"라는 존재 검증(existential)이 실제 요구에 맞다.
check("qty 4 + options 37 = 41항목 전부가 buildGarmentSpec()에서 실제로 소비된다(죽은 키 0개)", () => {
  const baseOptions = defaultFactoryOptions();
  const baseQty = defaultFactoryQty();
  const baseline = JSON.stringify(spec.buildGarmentSpec(baseOptions, baseQty));
  const dead = [];

  for (const f of FACTORY_OPTION_FIELDS) {
    let changed = false;
    if (f.kind === "select") {
      for (const c of f.choices) {
        if (c === f.default) continue;
        const out = JSON.stringify(spec.buildGarmentSpec({ ...baseOptions, [f.key]: c }, baseQty));
        if (out !== baseline) { changed = true; break; }
      }
    } else if (f.kind === "number") {
      const out = JSON.stringify(spec.buildGarmentSpec({ ...baseOptions, [f.key]: f.default + 1 }, baseQty));
      changed = out !== baseline;
    } else {
      const out = JSON.stringify(spec.buildGarmentSpec({ ...baseOptions, [f.key]: { L: f.default.L + 1, R: f.default.R + 1 } }, baseQty));
      changed = out !== baseline;
    }
    if (!changed) dead.push(f.key);
  }
  for (const f of FACTORY_QTY_FIELDS) {
    const out = JSON.stringify(spec.buildGarmentSpec(baseOptions, { ...baseQty, [f.key]: f.default + 1 }));
    if (out === baseline) dead.push(f.key);
  }
  assert.deepEqual(dead, [], `렌더러가 소비하지 않는 키(죽은 키): ${dead.join(", ")}`);
});

check("41항목 시각 반영 계약표(CONSUMED_OPTION_KEYS)가 options 37개 키와 정확히 일치", () => {
  const expected = [...FACTORY_OPTION_FIELDS.map((f) => f.key)].sort();
  const actual = [...spec.CONSUMED_OPTION_KEYS].sort();
  assert.deepEqual(actual, expected);
});

check("여밈↔단추 조합 보정: 더블+홀수 → 짝수로, 싱글+짝수(4/6) → 3으로", () => {
  const r1 = spec.resolveComboCorrections({ ...defaultFactoryOptions(), design: "더블", btnN: "1" });
  assert.equal(r1.options.btnN, "2");
  assert.equal(r1.changes.length, 1);
  const r2 = spec.resolveComboCorrections({ ...defaultFactoryOptions(), design: "더블", btnN: "3" });
  assert.equal(r2.options.btnN, "4");
  const r3 = spec.resolveComboCorrections({ ...defaultFactoryOptions(), design: "싱글", btnN: "6" });
  assert.equal(r3.options.btnN, "3");
  const r4 = spec.resolveComboCorrections({ ...defaultFactoryOptions(), design: "더블", btnN: "6" });
  assert.equal(r4.changes.length, 0, "이미 유효한 조합은 건드리지 않는다");
});

check("조끼 여밈↔단추 보정: 더블+5개 → 4개로", () => {
  const r = spec.resolveComboCorrections({ ...defaultFactoryOptions(), vestFasten: "더블", vestBtnN: "5" });
  assert.equal(r.options.vestBtnN, "4");
});

check("재킷 버그 수정 확인: 여밈·단추수가 실제 단추 좌표 개수를 바꾼다(과거 2개 고정 버그)", () => {
  const j1 = spec.buildJacketSpec({ ...defaultFactoryOptions(), design: "싱글", btnN: "1" });
  const j3 = spec.buildJacketSpec({ ...defaultFactoryOptions(), design: "싱글", btnN: "3" });
  assert.equal(j1.buttons.length, 1);
  assert.equal(j3.buttons.length, 3);
  const jDouble = spec.buildJacketSpec({ ...defaultFactoryOptions(), design: "더블", btnN: "6" });
  assert.equal(jDouble.buttons.length, 6);
  assert.equal(jDouble.doubleOverlap, true);
  const xs = new Set(jDouble.buttons.map((b) => b.x));
  assert.ok(xs.size >= 2, "더블은 좌우 두 열이어야 한다");
});

check("조끼 버그 수정 확인: 단추/주머니 개수가 실제로 반영된다(과거 3개/on-off 고정 버그)", () => {
  const v4 = spec.buildVestSpec({ ...defaultFactoryOptions(), vestBtnN: "4" });
  const v6 = spec.buildVestSpec({ ...defaultFactoryOptions(), vestBtnN: "6" });
  assert.equal(v4.buttons.length, 4);
  assert.equal(v6.buttons.length, 6);
  const p2 = spec.buildVestSpec({ ...defaultFactoryOptions(), vestPocketN: "2" });
  const p4 = spec.buildVestSpec({ ...defaultFactoryOptions(), vestPocketN: "4" });
  assert.equal(p2.pockets.length, 2);
  assert.equal(p4.pockets.length, 4);
});

check("동명 키 함정 회귀: vestBack은 벨트가 아니라 제원단/안감(등판 재질)이다", () => {
  const back1 = spec.buildVestSpec({ ...defaultFactoryOptions(), vestBack: "제원단" }).back;
  const back2 = spec.buildVestSpec({ ...defaultFactoryOptions(), vestBack: "안감" }).back;
  assert.equal(back1, "제원단");
  assert.equal(back2, "안감");
  // 과거 스튜디오의 '벨트' 값은 현재 선택지에 없다(41항목 정의를 벗어난 값은 기본값으로 떨어진다).
  const fallback = spec.buildVestSpec({ ...defaultFactoryOptions(), vestBack: "벨트" }).back;
  assert.equal(fallback, "제원단");
});

/* ── 공장 계약 동결 ─────────────────────────────────────────
   사용자 지시: "공장 CRM 있는 부분은 기능 및 안에 있는 단어나 입력칸들의 순서 이런 건
   바꾸지 말고 디자인 및 레이아웃만 변경시켜줘".

   디자인 작업은 JSX 를 옮기는 일이라 입력 순서가 조용히 바뀌기 쉽다. 그래서 주문서에서
   **보이는 라벨과 그 순서**를 여기에 못 박는다. 아래 13개는 재설계 시작 직전(0270cdd)에서
   추출한 실제 값이고, 재설계 후에도 그대로다 — 이 검사는 앞으로의 드리프트를 막는 장치다.
   className·레이아웃·아이콘은 검사하지 않는다. 그건 바꿔도 되는 부분이다. */
const ORDER_FORM_LABELS = [
  "고객", "종류", "주문일", "가봉일", "납기", "공급가(원)",
  "부가세(미리보기)", "합계(미리보기)",
  "원단", "안감", "단추",
  "수량", "메모",
];

check("주문서 입력칸 라벨 13개와 그 순서가 재설계 전과 같다", () => {
  const src = readFileSync(new URL("../components/factory/OrderForm.tsx", import.meta.url), "utf8");
  const labels = [...src.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    labels,
    ORDER_FORM_LABELS,
    `주문서 입력칸 라벨/순서가 바뀌었다.
  기대: ${ORDER_FORM_LABELS.join(" → ")}
  실제: ${labels.join(" → ")}
` +
      "→ 공장은 디자인만 바꾸라는 지시다. 되돌리거나 사용자에게 먼저 물어라."
  );
});

check("선택 자재(_materials)는 41항목 검증에 영향을 주지 않고 왕복 저장된다", () => {
  const sel = { fabricId: "f1", fabricLabel: "F-001 · 네이비 원단", liningId: null, liningLabel: null, buttonId: "b1", buttonLabel: "BT-01 · 4구" };
  const withMat = materials.writeMaterialSelection(defaultFactoryOptions(), sel);
  const v = validateFactoryOptions(withMat);
  assert.equal(v.ok, true, v.ok ? "" : v.errors.join(" / "));
  const roundTrip = materials.readMaterialSelection(withMat);
  assert.deepEqual(roundTrip, sel);
  assert.deepEqual(materials.readMaterialSelection({}), materials.EMPTY_MATERIAL_SELECTION);
});

/* v_materials 의 컬럼명을 앱 매핑에 못 박는다.
   실제로 났던 결함: 앱이 repeat_width_mm/repeat_height_mm/image_url 을 읽는데 DB 컬럼은
   repeat_w_mm/repeat_h_mm/swatch_path 였다. 값이 늘 undefined 인데 `?? null` 이 삼켜서
   **에러 없이 조용히 비어** 있었고, 미리보기는 "원단 사진 미등록"만 계속 띄웠다.
   타입 검사로는 못 잡는다(row 가 Record<string, unknown>). 그래서 실제 행 모양을 고정한다. */
check("v_materials 컬럼명: 실제 행 모양이 MaterialOption 으로 온전히 매핑된다", () => {
  // 0019_material_assets.sql 의 v_materials 가 내보내는 컬럼 그대로
  const row = {
    id: "m-1", business_id: "b-1", kind: "fabric", code: "F-001", name: "네이비 원단",
    unit: "m", stock: 12, min_stock: 3, vendor: "VBC", active: true,
    color_hex: "#22447a", pattern_kind: "stripe",
    repeat_w_mm: "10.5", repeat_h_mm: "12", // numeric → supabase-js 가 문자열로 줄 수 있다
    grain_direction: "lengthwise",
    swatch_path: "b-1/materials/m-1/swatch.png", texture_path: null,
  };
  const m = materials.mapMaterialRow(row);
  assert.equal(m.colorHex, "#22447a", "color_hex 가 안 실렸다 — 컬럼명 확인");
  assert.equal(m.patternKind, "stripe");
  assert.deepEqual(m.repeatMm, { w: 10.5, h: 12 }, "repeat_w_mm/repeat_h_mm 이 숫자로 안 왔다");
  assert.equal(m.repeatCalibrated, true, "반복 치수가 둘 다 있으면 실측으로 본다");
  assert.equal(m.swatchPath, "b-1/materials/m-1/swatch.png");
  assert.equal(m.texturePath, null);
  assert.equal(m.imageUrl, null, "경로→서명 URL 변환이 아직 없다. 사진이 있는 척하면 안 된다");

  // 메타가 비어 있는 자재는 전부 null 로 떨어지고 calibrated 는 false 여야 한다
  const bare = materials.mapMaterialRow({
    id: "m-2", kind: "button", code: "BT-1", name: "단추", unit: "개", stock: 0, min_stock: 0,
    vendor: null, color_hex: null, pattern_kind: null, repeat_w_mm: null, repeat_h_mm: null,
    grain_direction: null, swatch_path: null, texture_path: null,
  });
  assert.equal(bare.colorHex, null);
  assert.equal(bare.repeatMm, null);
  assert.equal(bare.repeatCalibrated, false);

  // 한쪽만 있으면 미보정이다(0019 CHECK 도 둘 다 or 둘 다 없음만 허용한다)
  const half = materials.mapMaterialRow({ id: "m-3", repeat_w_mm: 10, repeat_h_mm: null });
  assert.equal(half.repeatMm, null);
  assert.equal(half.repeatCalibrated, false);
});

check("원단 사진 미등록 정직성 규칙: 색상 데이터 없는 자재는 항상 '원단 사진 미등록'", () => {
  const noData = fabric.resolveSwatch({ id: "m1", kind: "fabric", code: "F-1", name: "이름만", unit: "m", stock: 1, minStock: 0, vendor: null, colorHex: null, patternKind: null, repeatMm: null, repeatCalibrated: false, swatchPath: null, texturePath: null, imageUrl: null, imageVersion: null }, "fabric", "p1");
  assert.equal(noData.registered, false);
  assert.equal(noData.noteBadge, "원단 사진 미등록");
  const withColor = fabric.resolveSwatch({ id: "m2", kind: "fabric", code: "F-2", name: "스트라이프 원단", unit: "m", stock: 1, minStock: 0, vendor: null, colorHex: "#22447a", patternKind: "stripe", repeatMm: { w: 10, h: 10 }, repeatCalibrated: true, swatchPath: null, texturePath: null, imageUrl: null, imageVersion: null }, "fabric", "p2");
  assert.equal(withColor.registered, true);
  assert.equal(withColor.calibrated, true);
});

check("원단 A→B→C 최신 선택만 반영: 토큰 비교가 늦은 응답을 걸러낸다", () => {
  assert.equal(fabric.isLatestToken(3, 3), true);
  assert.equal(fabric.isLatestToken(1, 3), false, "A 요청이 C 이후 도착해도 무시되어야 한다");
});

console.log(`\n총 ${count}건 · 모두 PASS`);
