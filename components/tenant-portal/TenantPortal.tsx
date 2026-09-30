"use client";

/**
 * 입주자 셀프 조회(QR) 공개 화면 — 로그인 셸(WorkspaceShell) 밖. 계약: docs/building-tenant-portal-contract.md §4·§5.
 * 흐름: 건물(QR 토큰) → 동·호실·접속코드 → 요약(낼 돈·기한·남은 돈·계좌) → 12개월 목록 → 달별 상세 → PDF·문의 → 로그아웃.
 * 세션은 httpOnly 쿠키(nuri_tp)라 이 화면은 세션 값을 모른다. 서버 함수는 전부 server action 으로 부른다
 * (RSC 렌더 중에는 쿠키를 지울 수 없어서 — portalRpc 가 session_invalid·portal_off 때 쿠키를 지운다).
 * api prop 은 /ui-preview/tenant 가 모의 함수로 화면을 그려 보기 위한 것. 실제 페이지는 기본값(서버 함수)을 쓴다.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Alert, PILL, TEXTAREA } from "@/components/rental/listkit";
import { ArrowLeft, Building2, Copy, Download, LogOut, MessageSquare, Phone, Check, ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { won, fmtLocal } from "@/components/building-ops/format";
import { periodLabel } from "@/components/building/period";
import { basisText, METER_LABEL } from "@/lib/pdf/statement-text";
import { law14Table, TAX_LABEL } from "@/lib/pdf/statement-p0";
import { STD_CATEGORY_LABEL } from "@/lib/domain/building-types";
import {
  getPortalBill, getPortalBuilding, getPortalSummary, portalLogin, portalLogout, submitPortalDispute,
  type PortalBillDetail, type PortalBillSummary, type PortalBuilding, type PortalDisputeKind, type PortalResult, type PortalSummary,
} from "@/lib/domain/building-portal";

export interface TenantApi {
  getPortalBuilding: typeof getPortalBuilding;
  portalLogin: typeof portalLogin;
  getPortalSummary: typeof getPortalSummary;
  getPortalBill: typeof getPortalBill;
  submitPortalDispute: typeof submitPortalDispute;
  portalLogout: typeof portalLogout;
}
const SERVER_API: TenantApi = { getPortalBuilding, portalLogin, getPortalSummary, getPortalBill, submitPortalDispute, portalLogout };

type Fail = Extract<PortalResult, { ok: false }>;
const NETWORK_FAIL: Fail = { ok: false, hint: "unknown", message: "요청을 보내지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요." };
/** server action 이 던지면(네트워크 끊김 등) 계약 모양의 실패로 바꾼다. */
async function call<T>(fn: () => Promise<PortalResult<T>>): Promise<PortalResult<T>> {
  try { return await fn(); } catch { return NETWORK_FAIL; }
}
const TZ = "Asia/Seoul";
const hhmm = (iso: string) => fmtLocal(iso, TZ).slice(11);
const ymd = (iso: string) => fmtLocal(iso, TZ).slice(0, 10);
const unitText = (u: { dong: string | null; unit_no: string }) => [u.dong ? (/동$/.test(u.dong) ? u.dong : `${u.dong}동`) : "", /호$/.test(u.unit_no) ? u.unit_no : `${u.unit_no}호`].filter(Boolean).join(" ");
const billTitle = (b: Pick<PortalBillSummary, "period" | "bill_kind" | "revision">) => `${periodLabel(b.period)}${b.bill_kind === "correction" ? ` 고친 명세서(${b.revision}차)` : ""}`;

const KIND_INFO: Record<PortalDisputeKind, { label: string; desc: string }> = {
  dispute: { label: "금액 이의", desc: "금액이 틀렸다고 생각될 때(예: 전기요금이 너무 많이 나왔다)." },
  correction_request: { label: "고쳐 달라는 요청", desc: "이름·면적·호실 정보 등이 틀려 고쳐 주길 바랄 때." },
  info_request: { label: "정보 요청", desc: "14개 항목별 금액, 계산 근거, 영수증 사본 등 자료를 보여 달라고 할 때." },
};
const DISPUTE_STATUS: Record<"open" | "resolved" | "rejected", { label: string; kind: "warning" | "success" | "error" }> = {
  open: { label: "처리 중", kind: "warning" }, resolved: { label: "처리됨", kind: "success" }, rejected: { label: "받아들이지 않음", kind: "error" },
};
/** 서버 문구가 없거나 새로 생긴 hint 의 화면 문구(서버 수정 중 추가되는 코드 대비). 있으면 서버 message 보다 먼저 쓴다. */
const HINT_TEXT: Record<string, string> = {
  upcoming_contract: "아직 입주(계약 시작) 전이라 조회할 수 없습니다. 계약 시작일부터 볼 수 있습니다. 궁금하면 관리사무소에 문의해 주세요.",
};
const failText = (f: Fail) => HINT_TEXT[f.hint as string] ?? f.message;
const CORRECTION_NOTE = "확정된 명세서는 덮어쓰지 않습니다. 금액을 고치게 되면 '고친 명세서'가 목록에 새로 나옵니다.";

// ═══ 최상위 ═══
export function TenantPortal({ token, api = SERVER_API }: { token: string; api?: TenantApi }) {
  const [building, setBuilding] = React.useState<{ state: "loading" } | { state: "error"; fail: Fail } | { state: "ok"; data: PortalBuilding }>({ state: "loading" });
  const [summary, setSummary] = React.useState<PortalSummary | null>(null);
  const [view, setView] = React.useState<"checking" | "login" | "home">("checking");
  const [notice, setNotice] = React.useState<string | null>(null);

  // 모달은 body 포털이라 <html> 에도 청록 강조를 건다(WorkspaceShell 과 같은 방식).
  React.useEffect(() => {
    const el = document.documentElement, prev = el.getAttribute("data-accent");
    el.setAttribute("data-accent", "teal");
    return () => { if (prev) el.setAttribute("data-accent", prev); else el.removeAttribute("data-accent"); };
  }, []);

  const load = React.useCallback(async () => {
    setBuilding({ state: "loading" });
    const [b, s] = await Promise.all([call(() => api.getPortalBuilding(token)), call(() => api.getPortalSummary())]);
    if (!b.ok) { setBuilding({ state: "error", fail: b }); return; }
    setBuilding({ state: "ok", data: b.data });
    // 다른 건물 QR 로 연 세션이면 그 건물 화면을 보여 주지 않는다(건물 이름으로만 구분 가능).
    if (s.ok && s.data.building.name === b.data.building_name) { setSummary(s.data); setView("home"); }
    else setView("login");
  }, [api, token]);
  React.useEffect(() => { void load(); }, [load]);

  const lost = React.useCallback((f: Fail) => {
    setSummary(null);
    if (f.hint === "portal_off" || f.hint === "link_invalid") { setBuilding({ state: "error", fail: f }); return; }
    setNotice(failText(f));
    setView("login");
  }, []);
  const refresh = React.useCallback(async () => {
    const s = await call(() => api.getPortalSummary());
    if (s.ok) setSummary(s.data);
    else if (s.hint === "session_invalid" || s.hint === "portal_off") lost(s);
    return s;
  }, [api, lost]);

  return (
    <div data-accent="teal" className="min-h-dvh bg-bg text-t">
      <header className="sticky top-0 z-20 border-b border-[var(--bd)] bg-sf/95 backdrop-blur supports-[backdrop-filter]:bg-sf/85">
        <div className="mx-auto flex h-[56px] max-w-[1080px] items-center gap-3 px-4 sm:px-6">
          <Building2 size={20} className="shrink-0 text-[var(--accent-ink)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">{building.state === "ok" ? building.data.building_name : "관리비 조회"}</p>
            <p className="truncate text-[length:var(--fs-meta)] text-t2">{summary ? `${unitText(summary.unit)} 관리비 조회` : "입주자 관리비 조회"}</p>
          </div>
          {view === "home" && summary && <LogoutButton api={api} onDone={() => { setSummary(null); setNotice("조회를 끝냈습니다. 다시 보려면 호실과 접속코드를 넣어 주세요."); setView("login"); }} />}
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
        {building.state === "error" ? (
          <Card className="mx-auto max-w-[520px]">
            <ErrorState
              title={building.fail.hint === "portal_off" ? "지금은 조회할 수 없습니다" : building.fail.hint === "link_invalid" ? "QR 주소를 확인해 주세요" : "화면을 열지 못했습니다"}
              description={failText(building.fail)}
              onRetry={building.fail.hint === "unknown" ? () => void load() : undefined}
            />
          </Card>
        ) : building.state === "loading" || view === "checking" ? (
          <Card><LoadingState label="관리비 조회 화면을 여는 중…" /></Card>
        ) : view === "login" || !summary ? (
          <LoginView token={token} building={building.data} api={api} notice={notice} onLoggedIn={async () => { setNotice(null); const s = await refresh(); if (s.ok) setView("home"); else setNotice(s.message); }} />
        ) : (
          <HomeRouter summary={summary} building={building.data} api={api} onLost={lost} onRefresh={refresh} />
        )}
      </main>
    </div>
  );
}

function LogoutButton({ api, onDone }: { api: TenantApi; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button variant="secondary" size="sm" loading={busy} className="[@media(pointer:coarse)]:min-h-[44px]" onClick={async () => { setBusy(true); await call(() => api.portalLogout()); setBusy(false); onDone(); }}>
      {!busy && <LogOut size={15} aria-hidden />}
      <span>조회 끝내기</span>
    </Button>
  );
}

function OfficeContact({ b, className }: { b: { office_name: string | null; office_phone: string | null; office_hours: string | null }; className?: string }) {
  if (!b.office_name && !b.office_phone) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-body)] text-t2", className)}>
      <span className="font-medium text-t">{b.office_name ?? "관리사무소"}</span>
      {b.office_phone && (
        <a href={`tel:${b.office_phone.replace(/[^0-9+]/g, "")}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <Phone size={15} aria-hidden />{b.office_phone}
        </a>
      )}
      {b.office_hours && <span>{b.office_hours}</span>}
    </div>
  );
}

// ═══ 로그인 ═══
function formatCode(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

function LoginView({ token, building, api, notice, onLoggedIn }: { token: string; building: PortalBuilding; api: TenantApi; notice: string | null; onLoggedIn: () => Promise<void> }) {
  const [dong, setDong] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<Fail | null>(null);
  const [lockedUntil, setLockedUntil] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => { const n = Date.now(); setNow(n); if (n >= lockedUntil) { setLockedUntil(null); setErr(null); } }, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);
  const leftSec = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = leftSec > 0;
  const fieldErr = err?.hint === "invalid_input" || err?.hint === "invalid_credentials";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    if (!unit.trim() || code.replace(/-/g, "").length < 8 || (building.has_dong && !dong.trim())) {
      setErr({ ok: false, hint: "invalid_input", message: building.has_dong ? "동·호실과 8자리 접속코드를 모두 넣어 주세요." : "호실과 8자리 접속코드를 모두 넣어 주세요." });
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await call(() => api.portalLogin({ token, unitNo: unit.trim(), code, dong: building.has_dong ? dong.trim() : null }));
    setBusy(false);
    if (r.ok) { await onLoggedIn(); return; }
    setErr(r);
    if (r.hint === "locked" && r.retryAfterSec) { setNow(Date.now()); setLockedUntil(Date.now() + r.retryAfterSec * 1000); }
  };
  const mins = Math.floor(leftSec / 60), secs = leftSec % 60;
  const errText = !err ? null
    : err.hint === "locked" ? (locked ? `여러 번 틀려 잠시 잠겼습니다. ${mins > 0 ? `${mins}분 ` : ""}${secs}초 뒤에 다시 넣을 수 있습니다.` : err.message)
    : err.hint === "invalid_credentials" && err.remainingAttempts != null ? `${err.message} 남은 시도 ${err.remainingAttempts}번(모두 틀리면 잠시 잠깁니다).`
    : failText(err);

  return (
    <div className="mx-auto grid max-w-[960px] gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-start md:gap-8">
      <section className="md:pt-4">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px]">내 관리비 보기</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-t2">
          관리사무소에서 받은 <strong className="font-semibold text-t">호실 접속코드</strong>를 넣으면 우리 호실의 확정된 관리비 명세서를 볼 수 있습니다.
          다른 호실의 금액은 볼 수 없습니다.
        </p>
        <ul className="mt-4 space-y-1.5 text-[length:var(--fs-body)] text-t2">
          <li>· 접속코드는 영문 대문자·숫자 8자리입니다(예: ABCD-2345).</li>
          <li>· 한 번 들어오면 30분 동안 조회할 수 있습니다.</li>
          <li>· 코드를 잃어버렸으면 관리사무소에 새 코드를 요청하세요.</li>
        </ul>
        <OfficeContact b={building} className="mt-4" />
      </section>
      <Card className="p-5 sm:p-6">
        {notice && <Alert kind="warning" className="mb-4">{notice}</Alert>}
        <form onSubmit={submit} noValidate aria-describedby="login-status">
          <div className={cn("grid gap-x-3", building.has_dong && "grid-cols-2")}>
            {building.has_dong && (
              <Input label="동" value={dong} onChange={(e) => setDong(e.target.value)} required maxLength={30} autoComplete="off" placeholder="예: A" aria-invalid={fieldErr || undefined} />
            )}
            <Input label="호실" value={unit} onChange={(e) => setUnit(e.target.value)} required maxLength={30} autoComplete="off" inputMode="text" placeholder="예: 101" aria-invalid={fieldErr || undefined} />
          </div>
          <Input
            label="접속코드" value={code} onChange={(e) => setCode(formatCode(e.target.value))} required maxLength={9}
            autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX"
            className="font-mono tracking-[0.12em]" hint="대소문자·하이픈은 신경 쓰지 않아도 됩니다." aria-invalid={fieldErr || undefined}
          />
          <div id="login-status" aria-live="polite" className="min-h-0">
            {errText && <Alert kind="error" className="mb-4">{errText}</Alert>}
          </div>
          <Button type="submit" size="lg" loading={busy} disabled={locked} className="w-full">
            {locked ? `잠김 · ${mins}:${String(secs).padStart(2, "0")} 뒤 다시` : "관리비 보기"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ═══ 로그인 뒤: 목록 ↔ 상세(?bill=) ═══
function HomeRouter({ summary, building, api, onLost, onRefresh }: { summary: PortalSummary; building: PortalBuilding; api: TenantApi; onLost: (f: Fail) => void; onRefresh: () => Promise<PortalResult<PortalSummary>> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const billId = sp.get("bill");
  const pushed = React.useRef(false);
  const [listNotice, setListNotice] = React.useState<string | null>(null);
  const open = (id: string) => { pushed.current = true; setListNotice(null); router.push(`${pathname}?bill=${id}`); };
  const back = (msg?: string) => {
    setListNotice(msg ?? null);
    if (pushed.current) { pushed.current = false; router.back(); } else router.replace(pathname);
  };
  if (billId) return <BillDetailView key={billId} billId={billId} summary={summary} api={api} onBack={back} onLost={onLost} onRefresh={onRefresh} />;
  return <HomeView summary={summary} building={building} onOpen={open} notice={listNotice} />;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = React.useState<"idle" | "ok" | "fail">("idle");
  React.useEffect(() => { if (state === "idle") return; const t = setTimeout(() => setState("idle"), 2500); return () => clearTimeout(t); }, [state]);
  return (
    <>
      <Button variant="secondary" size="sm" className="[@media(pointer:coarse)]:min-h-[44px]" onClick={async () => { try { await navigator.clipboard.writeText(text); setState("ok"); } catch { setState("fail"); } }} aria-label={label}>
        {state === "ok" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
        {state === "ok" ? "복사함" : "복사"}
      </Button>
      <span className="sr-only" aria-live="polite">{state === "ok" ? "계좌번호를 복사했습니다." : state === "fail" ? "복사하지 못했습니다. 계좌번호를 길게 눌러 복사하세요." : ""}</span>
      {state === "fail" && <span className="text-[length:var(--fs-meta)] text-et" aria-hidden>복사하지 못했습니다. 길게 눌러 복사하세요.</span>}
    </>
  );
}

function PayStatus({ b }: { b: PortalBillSummary }) {
  if (b.paid) return <Badge kind="success">납부 완료</Badge>;
  if (b.remaining != null && b.remaining > 0) return <Badge kind="warning">남은 돈 {won(b.remaining)}</Badge>;
  if (b.remaining != null && b.remaining <= 0) return <Badge kind="success">낼 돈 없음</Badge>;
  return null;
}

function HomeView({ summary: s, building, onOpen, notice }: { summary: PortalSummary; building: PortalBuilding; onOpen: (id: string) => void; notice: string | null }) {
  // 지금 낼 돈 = 이 계약의 열린 채권 잔액 합계(밀린 돈·연체료·고친 명세서 포함), 기한 = 가장 이른 남은 기한(계약 r2 §5).
  // 달별 명세 금액은 아래 목록에 그대로 둔다.
  const latest = s.bills[0] ?? null;
  const due = s.next_due_date ?? null;
  // 미리 낸 돈(선납) 잔액 — 서버 r3 선택 필드. 없거나 0 이면 숨긴다.
  const credit = s.credit_balance ?? 0;
  const overdue = !!due && s.outstanding > 0 && due < fmtLocal(new Date().toISOString(), TZ).slice(0, 10);
  const bd = s.building;
  const account = bd.bank_account ? [bd.bank_name, bd.bank_account].filter(Boolean).join(" ") : null;
  const maxDue = Math.max(1, ...s.bills.map((b) => Math.abs(b.amount_due)));
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="space-y-5">
        {notice && <Alert kind="warning">{notice}</Alert>}
        {/* 맨 위: 이번 달 낼 돈 — 가장 큰 글씨. */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--bd)] bg-[var(--accent-soft)] px-5 py-4">
            <p className="text-[length:var(--fs-body)] font-medium text-t2">지금 낼 돈</p>
            <p className="mt-1 text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums sm:text-[40px]">{won(s.outstanding)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {s.outstanding > 0 ? (overdue ? <Badge kind="error">기한 지남</Badge> : <Badge kind="warning">아직 안 냄</Badge>) : <Badge kind="success">낼 돈 없음</Badge>}
              {due && s.outstanding > 0 && <span className="text-[length:var(--fs-body)] text-t2">납부기한 <strong className="font-semibold text-t tabular-nums">{due}</strong></span>}
            </div>
            <p className="mt-2 text-[length:var(--fs-meta)] text-t2">
              {latest ? "밀린 돈·연체료·고친 명세서까지 합친 금액입니다. 달별 금액은 아래 명세서 목록에 있습니다." : "아직 확정된 관리비 명세서가 없습니다. 관리사무소가 금액을 확정하면 여기에 나옵니다."}
            </p>
          </div>
          <dl className="divide-y divide-[var(--bd)] px-5">
            {credit > 0 && (
              <div className="flex items-baseline justify-between gap-3 py-3">
                <dt className="text-[length:var(--fs-body)] text-t2">미리 낸 돈(다음 관리비에서 뺍니다)</dt>
                <dd className="text-[16px] font-semibold tabular-nums text-[var(--accent-ink)]">{won(credit)}</dd>
              </div>
            )}
            <div className="py-3">
              <dt className="text-[length:var(--fs-body)] text-t2">입금 계좌</dt>
              {account ? (
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="select-all text-[16px] font-semibold tabular-nums">{account}</span>
                  {bd.bank_holder && <span className="text-[length:var(--fs-body)] text-t2">예금주 {bd.bank_holder}</span>}
                  <CopyButton text={bd.bank_account!.replace(/[^0-9]/g, "") || bd.bank_account!} label="계좌번호 복사" />
                </dd>
              ) : (
                <dd className="mt-1 text-[length:var(--fs-body)] text-t2">관리사무소에 입금 계좌를 물어보세요.</dd>
              )}
              <p className="mt-2 text-[length:var(--fs-meta)] text-t3">입금은 관리사무소가 확인한 뒤 이 화면에 &lsquo;납부 완료&rsquo;로 바뀝니다. 바로 바뀌지 않을 수 있습니다.</p>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">관리사무소</h2>
          <OfficeContact b={building} className="mt-1" />
          <p className="mt-2 text-[length:var(--fs-meta)] text-t2">{s.payer_name ? `${s.payer_name} · ` : ""}{unitText(s.unit)} · 조회는 {hhmm(s.expires_at)}까지 열려 있습니다.</p>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-0">
          <div className="px-5 pb-2 pt-4">
            <h2 className="text-[16px] font-semibold">최근 12개월 명세서</h2>
            <p className="mt-0.5 text-[length:var(--fs-meta)] text-t2">누르면 항목별 금액과 계산 근거를 볼 수 있습니다.</p>
          </div>
          {s.bills.length === 0 ? (
            <EmptyState title="확정된 명세서가 없습니다." description="관리사무소가 금액을 확정하면 달마다 여기에 쌓입니다." />
          ) : (
            <ul className="divide-y divide-[var(--bd)] border-t border-[var(--bd)]">
              {s.bills.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => onOpen(b.id)} className="flex min-h-[60px] w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-1 hover:bg-sf2 focus-visible:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[15px] font-medium">{periodLabel(b.period)}</span>
                        {b.bill_kind === "correction" && <span className={PILL}>고친 명세서 {b.revision}차</span>}
                      </span>
                      <span className="mt-1.5 block h-[4px] rounded-full bg-sf2" aria-hidden>
                        <span className="block h-full rounded-full bg-[var(--accent)] opacity-60" style={{ width: `${Math.round((Math.abs(b.amount_due) / maxDue) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[15px] font-semibold tabular-nums">{won(b.amount_due)}</span>
                      <PayStatus b={b} />
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-t3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-[var(--bd)] px-5 py-3 text-[length:var(--fs-meta)] text-t2">{CORRECTION_NOTE}</p>
        </Card>
        <MyDisputes summary={s} />
      </div>
    </div>
  );
}

function MyDisputes({ summary: s, billId }: { summary: PortalSummary; billId?: string }) {
  const rows = billId ? s.disputes.filter((d) => d.bill_id === billId) : s.disputes;
  if (billId && rows.length === 0) return null;
  return (
    <Card className="p-0">
      <div className="px-5 pb-3 pt-4">
        <h2 className="text-[16px] font-semibold">{billId ? "이 명세서로 낸 문의·이의" : "내가 낸 문의·이의"}</h2>
        <p className="mt-0.5 text-[length:var(--fs-meta)] text-t2">관리사무소가 처리하면 답변이 여기에 나옵니다. 문의는 명세서를 열고 남길 수 있습니다.</p>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-[var(--bd)] px-5 py-6 text-center text-[length:var(--fs-body)] text-t2">아직 남긴 문의·이의가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--bd)] border-t border-[var(--bd)]">
          {rows.map((d) => {
            const st = DISPUTE_STATUS[d.status];
            return (
              <li key={d.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge kind={st.kind}>{st.label}</Badge>
                  <span className="text-[length:var(--fs-body)] font-medium">{KIND_INFO[d.kind]?.label ?? d.kind}</span>
                  <span className="text-[length:var(--fs-meta)] text-t2">{periodLabel(d.period)} · 접수번호 <span className="font-mono">{d.receipt_no}</span> · {ymd(d.created_at)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[length:var(--fs-body)] text-t">{d.note}</p>
                {d.resolution && (
                  <div className="mt-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3 py-2">
                    <p className="text-[length:var(--fs-meta)] font-semibold text-t2">관리사무소 답변{d.resolved_at ? ` · ${ymd(d.resolved_at)}` : ""}</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[length:var(--fs-body)]">{d.resolution}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ═══ 달별 상세 ═══
function BillDetailView({ billId, summary, api, onBack, onLost, onRefresh }: { billId: string; summary: PortalSummary; api: TenantApi; onBack: (msg?: string) => void; onLost: (f: Fail) => void; onRefresh: () => Promise<PortalResult<PortalSummary>> }) {
  const [state, setState] = React.useState<{ s: "loading" } | { s: "error"; fail: Fail } | { s: "ok"; d: PortalBillDetail }>({ s: "loading" });
  const [disputeOpen, setDisputeOpen] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const load = React.useCallback(async () => {
    setState({ s: "loading" });
    const r = await call(() => api.getPortalBill(billId));
    if (r.ok) { setState({ s: "ok", d: r.data }); return; }
    if (r.hint === "session_invalid" || r.hint === "portal_off") { onLost(r); return; }
    if (r.hint === "bill_not_found") { onBack("그 명세서를 찾을 수 없습니다. 목록에서 다시 골라 주세요."); return; }
    setState({ s: "error", fail: r });
  }, [api, billId, onBack, onLost]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { if (state.s === "ok") headingRef.current?.focus(); }, [state.s]);

  const backBtn = (
    <button type="button" onClick={() => onBack()} className="-ml-2 mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-body)] font-medium text-t2 hover:bg-sf2 hover:text-t focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <ArrowLeft size={16} aria-hidden />목록으로
    </button>
  );
  if (state.s === "loading") return <div className="mx-auto max-w-[860px]">{backBtn}<Card><LoadingState label="명세서를 불러오는 중…" rows={6} /></Card></div>;
  if (state.s === "error") return <div className="mx-auto max-w-[860px]">{backBtn}<Card><ErrorState title="명세서를 불러오지 못했습니다" description={state.fail.message} onRetry={() => void load()} /></Card></div>;

  const d = state.d, b = d.bill;
  const commercial = d.building.kind === "commercial";
  const l14 = commercial ? law14Table(d.lines) : null;
  const quotaLeft = Math.max(0, summary.dispute_quota.limit - summary.dispute_quota.used_today);
  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div>
        {backBtn}
        <h1 ref={headingRef} tabIndex={-1} className="text-[22px] font-bold leading-tight outline-none sm:text-[26px]">{billTitle(b)} 관리비</h1>
        <p className="mt-1 text-[length:var(--fs-body)] text-t2">
          {unitText(d.unit)}{d.payer_name ? ` · ${d.payer_name}` : ""}{d.period.usage_from && d.period.usage_to ? ` · 사용 기간 ${d.period.usage_from} ~ ${d.period.usage_to}` : ""}
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[length:var(--fs-body)] text-t2">이 명세서로 낼 돈</p>
            <p className="text-[30px] font-bold leading-tight tabular-nums">{won(b.amount_due)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><PayStatus b={b} />{b.due_date && <span className="text-[length:var(--fs-body)] text-t2">납부기한 <strong className="text-t tabular-nums">{b.due_date}</strong></span>}</div>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-[var(--bd)] pt-3 text-[length:var(--fs-body)] sm:grid-cols-2">
          <Row label="이번 달 관리비" value={won(b.current_charge)} />
          {b.prior_unpaid !== 0 && <Row label="지난달까지 밀린 돈" value={won(b.prior_unpaid)} />}
          {d.features.late_fee && b.late_fee != null && b.late_fee !== 0 && <Row label="연체료" value={won(b.late_fee)} />}
          {b.credit !== 0 && <Row label="미리 낸 돈에서 뺀 금액" value={won(-Math.abs(b.credit))} />}
          <Row label="공급가액" value={won(b.supply)} muted />
          <Row label="부가세" value={won(b.vat)} muted />
          {b.exempt !== 0 && <Row label="부가세 없는 금액" value={won(b.exempt)} muted />}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/tenant/pdf/${b.id}?download=1`}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--bd-strong)] bg-sf px-4 text-[13.5px] font-medium text-t shadow-card hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <Download size={16} aria-hidden />명세서 PDF 받기
          </a>
          <Button onClick={() => setDisputeOpen(true)}><MessageSquare size={16} aria-hidden />문의·이의 남기기</Button>
        </div>
        <p className="mt-3 text-[length:var(--fs-meta)] text-t2">{CORRECTION_NOTE}</p>
      </Card>

      <Card className="p-0">
        <div className="px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-semibold">항목별 금액</h2>
          <p className="mt-0.5 text-[length:var(--fs-meta)] text-t2">항목을 누르면 계산 근거가 펼쳐집니다. 증감은 지난달 확정 명세서와 비교한 값입니다.</p>
        </div>
        {d.lines.length === 0 ? (
          <p className="border-t border-[var(--bd)] px-5 py-6 text-center text-t2">항목이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[var(--bd)] border-t border-[var(--bd)]">
            {d.lines.map((l, i) => {
              const prev = d.prev_lines && l.charge_type_id ? d.prev_lines[l.charge_type_id] : undefined;
              const diff = prev != null ? l.amount - prev : null;
              const basis = basisText(l.basis);
              return (
                <li key={`${l.charge_type_id ?? "x"}-${i}`}>
                  <details className="group">
                    <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-5 py-2.5 hover:bg-sf2 focus-visible:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] [&::-webkit-details-marker]:hidden">
                      <ChevronRight size={15} className="shrink-0 text-t3 transition-transform duration-1 group-open:rotate-90" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">{l.name}</span>
                        {STD_CATEGORY_LABEL[l.std_category] && STD_CATEGORY_LABEL[l.std_category] !== l.name && <span className="block text-[length:var(--fs-meta)] text-t2">{STD_CATEGORY_LABEL[l.std_category]}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[15px] font-semibold tabular-nums">{won(l.amount)}</span>
                        <span className={cn("block text-[length:var(--fs-meta)] tabular-nums", diff == null ? "text-t3" : diff > 0 ? "text-et" : diff < 0 ? "text-[var(--accent-ink)]" : "text-t2")}>
                          {diff == null ? "지난달 없음" : diff === 0 ? "지난달과 같음" : `지난달보다 ${diff > 0 ? "+" : "−"}${won(Math.abs(diff))}`}
                        </span>
                      </span>
                    </summary>
                    <dl className="grid gap-x-6 gap-y-1.5 bg-sf2/60 px-5 py-3 pl-12 text-[length:var(--fs-body)] sm:grid-cols-2">
                      <Row label="계산 근거" value={basis || "관리사무소가 정한 금액"} />
                      {prev != null && <Row label="지난달 금액" value={won(prev)} />}
                      <Row label="공급가액" value={won(l.supply)} muted />
                      <Row label="부가세" value={won(l.vat)} muted />
                      {l.exempt !== 0 && <Row label="부가세 없는 금액" value={won(l.exempt)} muted />}
                      {l.tax_treatment && <Row label="부가세 구분" value={TAX_LABEL[l.tax_treatment] ?? ""} muted />}
                    </dl>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {l14 && (
        <Card className="p-0">
          <div className="px-5 pb-2 pt-4">
            <h2 className="text-[16px] font-semibold">관리비 14개 항목(상가건물 임대차보호법)</h2>
            <p className="mt-0.5 text-[length:var(--fs-meta)] text-t2">
              {l14.amountsHidden ? "월 관리비가 10만 원 미만이라 법에 따라 포함된 항목만 표시합니다. 금액이 궁금하면 '정보 요청'을 남기세요." : "법이 정한 14개 항목으로 다시 묶은 금액입니다."}
            </p>
          </div>
          <ol className="grid border-t border-[var(--bd)] sm:grid-cols-2">
            {l14.rows.map((r) => (
              <li key={r.no} className="flex items-center justify-between gap-3 border-b border-[var(--bd)] px-5 py-2 text-[length:var(--fs-body)] sm:odd:border-r">
                <span className={cn(!r.included && "text-t3")}><span className="mr-1.5 tabular-nums text-t3">{r.no}.</span>{r.label}</span>
                <span className={cn("tabular-nums", r.included ? "font-medium" : "text-t3")}>{r.included ? (l14.amountsHidden ? "포함" : won(r.amount)) : "없음"}</span>
              </li>
            ))}
          </ol>
          {l14.outside.length > 0 && (
            <ul className="px-5 py-2 text-[length:var(--fs-body)]">
              {l14.outside.map((o) => <li key={o.kind} className="flex justify-between gap-3 py-1 text-t2"><span>{o.label}</span><span className="tabular-nums">{won(o.amount)}</span></li>)}
            </ul>
          )}
        </Card>
      )}

      {d.meters.length > 0 && (
        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">검침(계량기 숫자)</h2>
          <ul className="mt-2 divide-y divide-[var(--bd)]">
            {d.meters.map((m, i) => (
              <li key={`${m.kind}-${m.serial ?? i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-[length:var(--fs-body)]">
                <span className="font-medium">{METER_LABEL[m.kind] ?? m.kind}{m.serial ? ` ${m.serial}` : ""}</span>
                <span className="tabular-nums text-t2">지난달 {m.prev.toLocaleString("ko-KR")} → 이번 달 {m.curr.toLocaleString("ko-KR")}{m.multiplier !== 1 ? ` (×${m.multiplier})` : ""}</span>
                <span className="font-semibold tabular-nums">사용 {m.usage.toLocaleString("ko-KR")}{m.unit_label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.prior.length > 0 && (
        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">밀린 돈(달별)</h2>
          <ul className="mt-2 divide-y divide-[var(--bd)] text-[length:var(--fs-body)]">
            {d.prior.map((p, i) => (
              <li key={`${p.period}-${p.kind}-${i}`} className="flex justify-between gap-3 py-2">
                <span>{periodLabel(p.period)} {p.kind === "late_fee" ? "연체료" : p.kind === "correction" ? "고친 명세서" : "관리비"}{p.due_date ? <span className="text-t2"> · 기한 {p.due_date}</span> : null}</span>
                <span className="font-medium tabular-nums">{won(p.amount - p.paid - p.credit_applied)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.period.notice && (
        <Card className="p-5">
          <h2 className="text-[16px] font-semibold">관리사무소 알림</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-[length:var(--fs-body)] text-t2">{d.period.notice}</p>
        </Card>
      )}

      <MyDisputes summary={summary} billId={b.id} />

      <DisputeModal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        detail={d}
        quotaLeft={quotaLeft}
        api={api}
        onLost={(f) => { setDisputeOpen(false); onLost(f); }}
        onSubmitted={() => void onRefresh()}
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-t2">{label}</dt>
      <dd className={cn("text-right tabular-nums", muted ? "text-t2" : "font-medium text-t")}>{value}</dd>
    </div>
  );
}

// ═══ 문의·이의 남기기 ═══
function DisputeModal({ open, onClose, detail, quotaLeft, api, onLost, onSubmitted }: {
  open: boolean; onClose: () => void; detail: PortalBillDetail; quotaLeft: number; api: TenantApi; onLost: (f: Fail) => void; onSubmitted: () => void;
}) {
  const [kind, setKind] = React.useState<PortalDisputeKind | "">("");
  const [item, setItem] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<Fail | null>(null);
  const [done, setDone] = React.useState<{ receiptNo: string; remainingToday: number } | null>(null);
  const kindId = React.useId(), itemId = React.useId(), noteId = React.useId();
  React.useEffect(() => { if (open) { setKind(""); setItem(""); setContact(""); setNote(""); setErr(null); setDone(null); } }, [open]);
  const items = detail.lines.filter((l) => l.charge_type_id);
  const blocked = quotaLeft <= 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) { setErr({ ok: false, hint: "invalid_kind", message: "종류를 골라 주세요." }); return; }
    if (!note.trim()) { setErr({ ok: false, hint: "invalid_note", message: "내용을 적어 주세요(1000자 이내)." }); return; }
    setBusy(true); setErr(null);
    const r = await call(() => api.submitPortalDispute({ billId: detail.bill.id, kind, note: note.trim(), contact: contact.trim() || null, chargeTypeId: item || null }));
    setBusy(false);
    if (r.ok) { setDone(r.data); onSubmitted(); return; }
    if (r.hint === "session_invalid" || r.hint === "portal_off") { onLost(r); return; }
    setErr(r);
  };
  const fe = (h: string) => (err?.hint === h ? err.message : undefined);

  return (
    <Modal open={open} onClose={onClose} title={done ? "접수했습니다" : "문의·이의 남기기"} className="sm:max-w-[560px]"
      footer={done ? <Button onClick={onClose}>닫기</Button> : (
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" form="tenant-dispute-form" loading={busy} disabled={blocked}>보내기</Button>
        </>
      )}
    >
      {done ? (
        <div role="status" className="space-y-3 py-2 text-[length:var(--fs-body)]">
          <p className="text-[15px]">관리사무소에 전달했습니다. 처리되면 &lsquo;내가 낸 문의·이의&rsquo;에 답변이 나옵니다.</p>
          <div className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-4 py-3">
            <p className="text-t2">접수번호</p>
            <p className="font-mono text-[22px] font-bold tracking-[0.08em]">{done.receiptNo}</p>
          </div>
          <p className="text-t2">오늘 더 남길 수 있는 건수: {done.remainingToday}건. {CORRECTION_NOTE}</p>
        </div>
      ) : (
        <form id="tenant-dispute-form" onSubmit={submit} noValidate>
          <p className="mb-3 text-[length:var(--fs-body)] text-t2">{billTitle(detail.bill)} 명세서에 대해 남깁니다. 오늘 더 남길 수 있는 건수: {quotaLeft}건.</p>
          {blocked && <Alert kind="warning" className="mb-3">오늘은 더 남길 수 없습니다. 급한 일은 관리사무소로 전화해 주세요.</Alert>}
          <fieldset className="mb-4" aria-describedby={fe("invalid_kind") ? `${kindId}-err` : undefined}>
            <legend className="mb-1.5 text-[length:var(--fs-body)] font-medium text-t2">종류<span className="ml-0.5 text-et" aria-hidden>*</span><span className="sr-only"> (필수)</span></legend>
            <div className="space-y-2">
              {(Object.keys(KIND_INFO) as PortalDisputeKind[]).map((k) => (
                <label key={k} className={cn("flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--r-md)] border px-3 py-2.5 transition-colors duration-1", kind === k ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--bd2)] hover:border-t2")}>
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => { setKind(k); if (err?.hint === "invalid_kind") setErr(null); }} disabled={blocked} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[var(--accent)]" />
                  <span><span className="block text-[15px] font-medium text-t">{KIND_INFO[k].label}</span><span className="block text-[length:var(--fs-meta)] text-t2">{KIND_INFO[k].desc}</span></span>
                </label>
              ))}
            </div>
            {fe("invalid_kind") && <p id={`${kindId}-err`} className="mt-1.5 text-[length:var(--fs-meta)] text-et">{fe("invalid_kind")}</p>}
          </fieldset>
          <div className="mb-4">
            <label htmlFor={itemId} className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">어느 항목인가요? (선택)</label>
            <select id={itemId} value={item} onChange={(e) => setItem(e.target.value)} disabled={blocked} aria-invalid={!!fe("invalid_charge_type") || undefined}
              className="h-[44px] w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-[16px] text-t outline-none hover:border-t2 focus:border-[var(--accent)] focus:shadow-ring sm:text-[13.5px]">
              <option value="">전체 또는 잘 모르겠음</option>
              {items.map((l) => <option key={l.charge_type_id!} value={l.charge_type_id!}>{l.name} ({won(l.amount)})</option>)}
            </select>
            {fe("invalid_charge_type") && <p className="mt-1.5 text-[length:var(--fs-meta)] text-et">{fe("invalid_charge_type")}</p>}
          </div>
          <div className="mb-4">
            <label htmlFor={noteId} className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">내용<span className="ml-0.5 text-et" aria-hidden>*</span><span className="sr-only"> (필수)</span></label>
            <textarea id={noteId} value={note} onChange={(e) => { setNote(e.target.value); if (err?.hint === "invalid_note") setErr(null); }} maxLength={1000} rows={5} disabled={blocked} required
              aria-invalid={!!fe("invalid_note") || undefined} aria-describedby={`${noteId}-count`}
              className={cn(TEXTAREA, "min-h-[120px]")} placeholder="예: 이번 달 전기요금이 지난달의 두 배입니다. 계량기 숫자를 다시 확인해 주세요." />
            <p id={`${noteId}-count`} className={cn("mt-1 text-right text-[length:var(--fs-meta)] tabular-nums", fe("invalid_note") ? "text-et" : "text-t3")}>{fe("invalid_note") ?? `${note.length} / 1000자`}</p>
          </div>
          <Input label="답을 받을 연락처 (선택)" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={40} disabled={blocked} autoComplete="tel" inputMode="tel"
            hint="비워 두면 이 화면에서만 답을 확인합니다. 관리사무소 담당자만 봅니다." error={fe("invalid_contact")} />
          <div aria-live="polite">
            {err && !["invalid_kind", "invalid_note", "invalid_contact", "invalid_charge_type"].includes(err.hint) && <Alert kind="error">{err.message}</Alert>}
          </div>
        </form>
      )}
    </Modal>
  );
}
