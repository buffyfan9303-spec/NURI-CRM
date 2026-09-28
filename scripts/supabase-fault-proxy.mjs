// Supabase 앞단 계수/장애주입 프록시(로컬 검증 전용). http://127.0.0.1:3999 → .env.local 의 Supabase.
// 사용: node scripts/supabase-fault-proxy.mjs
//   서버:  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3999 NEXT_DIST_DIR=.next-3015 npx next build && npx next start -p 3015
//   e2e:   E2E_BASE_URL=http://localhost:3015 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3999 E2E_FAULT_PROXY_CTL=http://127.0.0.1:3999/__ctl npx playwright test e2e/auth-transient.spec.ts
// 제어: /__ctl?fail=1|0 (auth/v1/user·token 에 503)  /__ctl?reset=1  /__ctl?stats=1 (경로별 호출 수)
import http from "node:http";
import { readFileSync } from "node:fs";
const upstream = (process.env.SUPABASE_UPSTREAM_URL ?? readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? "").trim();
if (!upstream) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음(.env.local)");
let fail = false, stats = { total: 0, byPath: {} };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__ctl") {
    if (u.searchParams.has("fail")) fail = u.searchParams.get("fail") === "1";
    if (u.searchParams.has("reset")) stats = { total: 0, byPath: {} };
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ fail, ...stats }));
  }
  const key = `${req.method} ${u.pathname.replace(/\/rpc\/.*/, "/rpc/*")}`;
  stats.total++; stats.byPath[key] = (stats.byPath[key] ?? 0) + 1;
  if (fail && /^\/auth\/v1\/(user|token)/.test(u.pathname)) {
    res.writeHead(503, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: "injected 503" }));
  }
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = { ...req.headers }; delete headers.host; delete headers["content-length"]; delete headers.connection;
  try {
    const r = await fetch(upstream + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: "manual" });
    const h = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
    res.writeHead(r.status, h);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(502); res.end(String(e)); }
}).listen(3999, () => console.log("supabase-fault-proxy :3999 ->", upstream));
