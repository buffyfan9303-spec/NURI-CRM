#!/usr/bin/env node
/**
 * 스캔 기능 회귀 검증. assert 기반, 실패하면 exit code 1.
 *
 * 핵심 목적: "QR만 되는데 세 형식 다 된다고 주장"하는 것을 막는다 — 그래서 1부는 실제 이미지를
 * 인코딩(zxing-wasm/writer)해 만들고, 그 이미지를 다시 디코딩(zxing-wasm/reader)해서 원문과
 * 비교한다. 이 zxing-wasm은 앱이 브라우저에서 실제로 쓰는 `barcode-detector/ponyfill`
 * (@yudiel/react-qr-scanner의 내부 의존성, lib/scan/detector.ts가 폴백으로 쓰는 바로 그 엔진)이
 * 내부적으로 사용하는 것과 동일한 WASM 리더다 — 즉 "브라우저에서 실제로 디코딩되는 엔진"을
 * Node에서 그대로 실행해 증명한다(카메라·DOM 불필요, node_modules/zxing-wasm 실측으로 Node
 * 실행 가능 확인 완료).
 *
 * 2부는 lib/scan/validate.ts의 판정 로직을 그대로 옮겨 재검증한다(TS 파일을 별도 빌드 없이
 * .mjs에서 직접 import할 수 없어 복제함 — 값이 달라지면 두 파일을 함께 고쳐야 한다는 뜻의
 * 주석을 양쪽에 남겨둔다).
 */
import { readBarcodes, writeBarcode } from "zxing-wasm/full";
import assert from "node:assert/strict";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  OK  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  OK  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

// ── 1부: 실제 인코딩→디코딩 왕복 (QR·Code128·EAN13) ─────────────────────
console.log("[1/3] 바코드 인코딩→디코딩 왕복 (zxing-wasm — 앱이 쓰는 것과 동일한 디코딩 엔진)");

const CASES = [
  { zxingFormat: "QRCode", ourFormat: "qr_code", text: "NURI-SCAN-SELFTEST" },
  { zxingFormat: "Code128", ourFormat: "code_128", text: "ORD-2026-000123" },
  { zxingFormat: "EAN13", ourFormat: "ean_13", text: "4006381333931" },
];

for (const c of CASES) {
  await checkAsync(`${c.zxingFormat}(${c.ourFormat}) 인코딩→디코딩 왕복 = "${c.text}"`, async () => {
    const written = await writeBarcode(c.text, { format: c.zxingFormat });
    assert.ok(written.image, `writeBarcode 실패: ${written.error}`);
    const results = await readBarcodes(written.image, { formats: [c.zxingFormat] });
    assert.ok(results.length > 0, "디코딩 결과 0건 — 이 형식은 실제로 디코딩되지 않는다");
    assert.equal(results[0].text, c.text, `디코딩된 텍스트 불일치: got "${results[0].text}"`);
    assert.equal(results[0].format, c.zxingFormat, `형식 불일치: got "${results[0].format}"`);
  });
}

// 서로 다른 형식을 요청 형식 목록에 없는 상태로 디코딩하면 안 걸려야 한다(형식 필터링 자체 검증).
await checkAsync("formats 필터 — EAN13 이미지에 QRCode만 요청하면 검출되지 않는다", async () => {
  const written = await writeBarcode("4006381333931", { format: "EAN13" });
  const results = await readBarcodes(written.image, { formats: ["QRCode"] });
  assert.equal(results.length, 0, "필터링이 안 되고 있다 — formats 옵션이 무시되고 있을 수 있다");
});

// ── 2부: 클라이언트 검증 로직 (lib/scan/validate.ts 미러) ─────────────────
console.log("\n[2/2] 클라이언트 검증 로직 (lib/scan/validate.ts와 동일 로직 — 값을 바꾸면 양쪽 다 고칠 것)");

const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const URL_SCHEME_RE = /^\s*(https?|ftp|javascript|data|file)\s*:/i;
function isValidScanCode(raw) {
  if (raw == null) return false;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 256) return false;
  return !CONTROL_CHAR_RE.test(raw);
}
function isUrlLikeCode(raw) {
  return URL_SCHEME_RE.test(raw);
}
function isValidEan13(raw) {
  const code = raw.trim();
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const chk = digits.pop();
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === chk;
}
check("EAN13 체크섬 유효 — 4006381333931", () => assert.equal(isValidEan13("4006381333931"), true));
check("EAN13 체크섬 무효 — 마지막 자리 변조", () => assert.equal(isValidEan13("4006381333930"), false));
check("EAN13 자릿수 부족은 무효", () => assert.equal(isValidEan13("123456789012"), false));
check("빈 문자열은 무효 코드", () => assert.equal(isValidScanCode(""), false));
check("공백만 있는 문자열은 무효", () => assert.equal(isValidScanCode("   "), false));
check("null은 무효 코드", () => assert.equal(isValidScanCode(null), false));
check("257자는 무효(길이 초과)", () => assert.equal(isValidScanCode("A".repeat(257)), false));
check("256자는 유효(경계)", () => assert.equal(isValidScanCode("A".repeat(256)), true));
check("제어문자(NUL) 포함 시 거부", () => assert.equal(isValidScanCode("ABC\x00DEF"), false));
check("제어문자(DEL) 포함 시 거부", () => assert.equal(isValidScanCode("ABC\x7FDEF"), false));
check("탭·개행은 허용(서버 규칙과 동일)", () => assert.equal(isValidScanCode("ABC\tDEF\n"), true));
check("일반 개체코드는 유효", () => assert.equal(isValidScanCode("RENT-0001"), true));

check("http:// URL은 URL로 판별(자동 실행 금지 대상)", () => assert.equal(isUrlLikeCode("http://evil.example/x"), true));
check("javascript: 스킴도 URL로 판별", () => assert.equal(isUrlLikeCode("javascript:alert(1)"), true));
check("일반 코드는 URL이 아님", () => assert.equal(isUrlLikeCode("RENT-0001"), false));

// ── 3부: lib/scan/validate.ts 실제 소스 import(Node 22.18+ 타입 스트립) — D3·D4·D9 회귀 ──────────
console.log("\n[3/3] lib/scan/validate.ts 실제 소스 — 카메라 연속 인식·세션 키 폴백·정규화");
const v = await import("../lib/scan/validate.ts");

check("카메라 연속 인식(D3) — 처음 fresh → 0.2초 간격 continuous → 1.5초 이상 안 보이면 reappeared", () => {
  const seen = new Map();
  assert.equal(v.noteCameraSighting(seen, "C", 1000, 1500), "fresh");
  assert.equal(v.noteCameraSighting(seen, "C", 1220, 1500), "continuous");
  assert.equal(v.noteCameraSighting(seen, "C", 1440, 1500), "continuous");
  // 3초 넘게 계속 비춰도(이전 창 3000ms) 프레임 간격이 짧으면 계속 continuous — 수량 부풀림 없음
  let t = 1440; for (let i = 0; i < 20; i++) { t += 220; assert.equal(v.noteCameraSighting(seen, "C", t, 1500), "continuous"); }
  assert.equal(v.noteCameraSighting(seen, "C", t + 1600, 1500), "reappeared");
  assert.equal(v.noteCameraSighting(seen, "D", t + 1600, 1500), "fresh");
});
check("정규화(D9) — 앞뒤 공백만 제거, 대소문자·NURI: 접두사 보존", () => {
  assert.equal(v.normalizeScanCode("  QA-R-0001 \n"), "QA-R-0001");
  assert.equal(v.normalizeScanCode("qa-r-0001"), "qa-r-0001");
  assert.equal(v.normalizeScanCode("NURI:F900001"), "NURI:F900001");
});
check("EAN13 체크섬 오류(D9) — 13자리 숫자만 판정, 그 외는 false", () => {
  assert.equal(v.isEan13ChecksumError("4006381333930"), true);
  assert.equal(v.isEan13ChecksumError("4006381333931"), false);
  assert.equal(v.isEan13ChecksumError("QA-R-0001"), false);
});
check("세션 키(D4) — randomUUID 있으면 uuid, 없으면 getRandomValues 폴백도 uuid v4 형식", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(v.newSessionKey(), UUID);
  const orig = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(crypto), "randomUUID") ?? Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const k = v.newSessionKey();
    assert.match(k, UUID);
    assert.notEqual(k, v.newSessionKey());
  } finally {
    delete crypto.randomUUID;
    if (orig && !Object.getPrototypeOf(crypto).randomUUID) Object.defineProperty(crypto, "randomUUID", orig);
  }
  assert.equal(typeof crypto.randomUUID, "function", "테스트 후 randomUUID 복원");
});

console.log(failed === 0 ? "\n모두 통과." : `\n${failed}건 실패.`);
process.exit(failed === 0 ? 0 : 1);
