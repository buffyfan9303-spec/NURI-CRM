// 운영(또는 로컬) 스모크: 5업종 주요 24화면 × 390/1440 × (마스터·admin 계정). magiclink 세션, 비밀번호 입력 없음.
// 사용: node scripts/live-smoke.cjs   (로컬: SMOKE_BASE_URL=http://localhost:3001 — 쿠키 도메인 자동)
// 결과: test-results/live-smoke/live-report.txt (OK/FAIL 줄). 키는 .env.local 의 SUPABASE_SERVICE_ROLE_KEY.
// 운영 스모크: stdin=api-keys json. 계정별 magiclink 세션 → nuricrm.co.kr 주요 화면 × 390/1440
const { chromium } = require("playwright-core");
const fs = require("fs");
const OUT = require("path").join(__dirname, "../test-results/live-smoke");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.SMOKE_BASE_URL || "https://www.nuricrm.co.kr";
const HOST = new URL(BASE).hostname;
const SBURL = "https://vnyjzdzaapyzqjsunhae.supabase.co", ANON = "sb_publishable_ZiQjd-f2c4FcUpFwscMIBQ_v02XIegq";
const NM = "";
const B = { factory: "2f96b056-54e1-4ab0-a2e5-d90b4badf60c", rental: "68dfe12a-6e47-47dd-a830-3ccce507e4ac", academy: "b78820ad-98f5-476f-9686-39a2d9bf1460", salon: "a60ac76d-9468-465c-9d06-96702f5903c6", unmanned: "d26e357e-94ea-486d-89ce-232db1f43f90" };
const PAGES = [["/select"], ...Object.entries({
  factory: ["", "/orders", "/production", "/calendar"],
  rental: ["", "/reservations", "/catalog", "/settlement", "/customers"],
  academy: ["", "/students", "/attendance", "/tuition", "/consultations"],
  salon: ["", "/services", "/settlement", "/stock"],
  unmanned: ["", "/products", "/stock", "/tasks", "/sales"],
}).flatMap(([k, ps]) => ps.map((p) => [`/w/${B[k]}${p}`, k]))];
async function session(admin, email) {
  const { createServerClient } = require(NM + "@supabase/ssr");
  const { data: l, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (e1) throw e1;
  const jar = {};
  const sb = createServerClient(SBURL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => { jar[c.name] = c.value; }) } });
  const { error } = await sb.auth.verifyOtp({ token_hash: l.properties.hashed_token, type: "magiclink" });
  if (error) throw error;
  return Object.entries(jar).map(([name, value]) => ({ name, value, domain: HOST, path: "/", secure: BASE.startsWith("https"), sameSite: "Lax" }));
}
(async () => {
  const SR = (process.env.SUPABASE_SERVICE_ROLE_KEY || fs.readFileSync(require("path").join(__dirname, "../.env.local"), "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1] || "").trim();
  if (!SR) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음(.env.local)");
  const { createClient } = require(NM + "@supabase/supabase-js");
  const admin = createClient(SBURL, SR, { auth: { persistSession: false } });
  const browser = await chromium.launch({ headless: true });
  const out = [];
  // 비로그인: 로그인 화면
  for (const w of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 } });
    const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
    const r = await pg.goto(BASE + "/", { waitUntil: "networkidle" });
    const m = await pg.evaluate(() => ({ url: location.pathname, ov: document.documentElement.scrollWidth - innerWidth, h1: document.querySelectorAll("h1").length, ribbon: !!document.querySelector('[fill^="url(#f-rbBody"]') }));
    await pg.screenshot({ path: `${OUT}/login-${w}.png` });
    out.push(`anon / ${w}: ${r.status()} → ${m.url} ov=${m.ov} h1=${m.h1} ribbon=${m.ribbon} err=${errs.length}`);
    await ctx.close();
  }
  for (const email of ["buffyfan9303@gmail.com", "admin@nuricrm.com"]) {
    const cookies = await session(admin, email);
    for (const w of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, hasTouch: w < 600 });
      await ctx.addCookies(cookies);
      const pg = await ctx.newPage(); let errs = []; pg.on("pageerror", (e) => errs.push(e.message));
      for (const [p, k] of PAGES) {
        errs = [];
        const r = await pg.goto(BASE + p, { waitUntil: "networkidle" }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 60) }));
        const m = await pg.evaluate(() => ({ url: location.pathname, ov: document.documentElement.scrollWidth - innerWidth, h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim().slice(0, 20)), bad: /Application error|서버 오류|오류가 발생|permission denied|권한이 필요/.test(document.body.innerText) ? (document.body.innerText.match(/.{0,30}(Application error|서버 오류|오류가 발생|permission denied|권한이 필요).{0,30}/) || [""])[0] : "" }));
        const ok = r.status() === 200 && m.ov <= 0 && !m.bad && errs.length === 0 && m.url === p.split("?")[0];
        out.push(`${ok ? "OK  " : "FAIL"} ${email.split("@")[0]} ${w} ${k || ""}${p.replace(/\/w\/[^/]+/, "")} ${r.status()} ov=${m.ov} h1=${JSON.stringify(m.h1)} ${m.url !== p ? "→" + m.url : ""} ${m.bad} ${errs.join("|").slice(0, 120)}`);
        if (w === 390 && (p.endsWith(B.rental) || p.endsWith(B.academy) || p === "/select")) await pg.screenshot({ path: `${OUT}/${email.split("@")[0]}-${k || "select"}-${w}.png` });
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(OUT + "/live-report.txt", out.join("\n"));
  console.log(out.join("\n"));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
