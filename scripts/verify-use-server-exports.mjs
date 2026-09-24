// "use server" 파일은 async 함수만 export 할 수 있다. 상수·객체를 export 하면 next build 는 통과하지만
// 런타임에 모듈 전체가 로드 거부돼 그 파일의 모든 서버 액션이 500 이 된다(2026-09-25 QA2-S01 미용실 전멸).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["app", "lib", "components"];
const bad = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== ".next") walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(n)) continue;
    const src = readFileSync(p, "utf8");
    if (!/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(src)) continue;
    src.split("\n").forEach((line, i) => {
      if (/^export\s+(const|let|var|class|enum)\b/.test(line) && !/=\s*async\b/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`);
      if (/^export\s+default\s+(?!async\s+function)/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`);
    });
  }
};
roots.forEach(walk);
if (bad.length) { console.error("FAIL \"use server\" 파일에 async 함수가 아닌 export:\n" + bad.join("\n")); process.exit(1); }
console.log("PASS \"use server\" 파일 export 는 전부 async 함수(또는 type)");
