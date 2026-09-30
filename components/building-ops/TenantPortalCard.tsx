"use client";

/**
 * 관리자: 입주자 조회(QR) 카드 — 건물 QR 발급·폐기, 호실 접속코드 발급·폐기, 코드 안내문(A4) 인쇄, 열람 기록.
 * 계약: docs/building-tenant-portal-contract.md §4·§5-3. 권한: 상태·발급·폐기 = write(코드 발급은 + revenue.read), 열람 기록 = view.
 * QR 토큰과 접속코드 원문은 발급 응답에서 한 번만 온다 — 이 카드의 메모리에만 두고 저장하지 않는다(새로고침하면 사라진다).
 * api prop 은 /ui-preview/tenant 의 모의 렌더용. 실제 화면은 기본값(서버 함수).
 */
import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/toast";
import { Alert, CardHead, PILL, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { Copy, Download, MessageSquare, Printer, QrCode } from "@/lib/icons";
import { smsHref } from "@/lib/domain/messages";
import { fmtLocal } from "./format";
import {
  getPortalStatus, issuePortalCodes, issuePortalLink, listPortalViews, revokePortalCode, revokePortalLink,
  type PortalIssuedCodes, type PortalResult, type PortalStatus, type PortalViewRow,
} from "@/lib/domain/building-portal";
import type { BuildingFeatureStatus } from "@/lib/domain/building-types";

export interface PortalAdminApi {
  getPortalStatus: typeof getPortalStatus; issuePortalLink: typeof issuePortalLink; revokePortalLink: typeof revokePortalLink;
  issuePortalCodes: typeof issuePortalCodes; revokePortalCode: typeof revokePortalCode; listPortalViews: typeof listPortalViews;
}
const SERVER_API: PortalAdminApi = { getPortalStatus, issuePortalLink, revokePortalLink, issuePortalCodes, revokePortalCode, listPortalViews };

export interface TenantPortalCardProps {
  businessId: string;
  building: { id: string; name: string; office_name: string | null; office_phone: string | null; office_hours: string | null };
  feature: BuildingFeatureStatus;
  canWrite: boolean;
  /** 코드 발급은 청구받는 사람 이름이 나오므로 revenue.read 도 필요. */
  canBilling: boolean;
  /** 선택 기능 스위치(설정 화면)를 켤 수 있는가 = staff.manage. 없으면 설정 링크 대신 대표에게 요청하라는 안내. */
  canManage?: boolean;
  tz: string;
  unitNames: Record<string, string>;
  api?: PortalAdminApi;
}

type Fail = Extract<PortalResult, { ok: false }>;
async function call<T>(fn: () => Promise<PortalResult<T>>): Promise<PortalResult<T>> {
  try { return await fn(); } catch { return { ok: false, hint: "unknown", message: "요청을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요." }; }
}
const FEATURE_TEXT: Record<Exclude<BuildingFeatureStatus, "on">, string> = {
  off: "입주자 조회 기능이 꺼져 있습니다. 설정 → 건물 선택 기능 → '입주자 포털'을 켜면 건물 QR 과 호실 접속코드를 발급할 수 있습니다.",
  external_contract_required: "입주자 조회는 외부 계약 확인이 끝나야 켤 수 있습니다.",
  forbidden: "입주자 조회 설정을 볼 권한이 없습니다.",
  unknown: "입주자 조회 기능 상태를 확인하지 못했습니다. 잠시 뒤 다시 열어 주세요.",
};
const ACTION: Record<PortalViewRow["action"], string> = { login: "들어옴", summary: "요약 봄", bill: "명세서 봄", pdf: "PDF 받음", dispute: "문의·이의 남김" };
// upcoming_contract(r2): 입주 예정 계약이 있어 기본 발급에서 빠진 호실. 모르는 사유가 와도 원문을 보이도록 string 키.
const SKIP: Record<string, string> = { no_active_contract: "지금 계약이 없음", inactive_unit: "쓰지 않는 호실", upcoming_contract: "입주 예정 계약 있음 — 지금 입주자와 예정 입주자 중 누구에게 줄지 골라 주세요" };
const fmtCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
// 문자·복사: 발송 업체 없이 관리자 휴대폰 문자앱을 연다(StatementsBoard 와 같은 방식). 번호는 서버가 pii.read 있을 때만 issued[].phone 으로 준다(r3, 없으면 번호 없이 앱만 연다).
const platform = (): "ios" | "android" | "unknown" => (typeof navigator === "undefined" ? "unknown" : /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "unknown");
const openSms = (phone: string | null | undefined, body: string) => {
  const pf = platform();
  window.location.href = smsHref(phone, body, pf) ?? `sms:${pf === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`;
};
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 폴백 */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.setAttribute("readonly", "");
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
}
const codeText = (buildingName: string, c: { dong: string | null; unit_no: string; code: string }, url: string | null) => [
  `[${buildingName}] 관리비 조회 안내`,
  `${unitOf(c)} 접속코드: ${fmtCode(c.code)}`,
  url ? `조회 주소: ${url}` : "건물 입구·게시판의 '관리비 조회 QR'을 휴대폰 카메라로 찍은 뒤 호실과 접속코드를 넣으세요.",
  "코드는 다른 사람에게 알려 주지 마세요.",
].join("\n");
const unitOf = (u: { dong: string | null; unit_no: string }) => [u.dong ? `${u.dong}동` : "", u.unit_no].filter(Boolean).join(" ");

export function TenantPortalCard(p: TenantPortalCardProps) {
  const head = <CardHead title="입주자 조회(QR)" description="입주자가 건물 QR 을 찍고 호실 접속코드를 넣으면 자기 호실의 확정된 관리비만 봅니다. 문의·이의는 아래 목록에 '입주자 접수'로 들어옵니다." />;
  if (p.feature !== "on") {
    return (
      <Card className="p-4 sm:p-5">
        {head}
        <Alert kind="warning">{FEATURE_TEXT[p.feature]}</Alert>
        {p.feature === "off" && (p.canManage ? <p className="mt-3 text-[length:var(--fs-body)]"><Link href={`/w/${p.businessId}/settings`} className="font-medium text-[var(--accent-ink)] underline underline-offset-2">설정으로 가기</Link></p> : <p className="mt-3 text-[length:var(--fs-meta)] text-t3">선택 기능은 사업장 대표(직원·권한 관리 권한)가 설정에서 켭니다. 대표에게 켜 달라고 요청하세요.</p>)}
      </Card>
    );
  }
  if (!p.canWrite) {
    return <Card className="p-4 sm:p-5">{head}<Alert kind="warning">QR·접속코드 발급과 열람 기록은 쓰기 권한이 있는 담당자가 봅니다.</Alert></Card>;
  }
  return <PortalAdmin {...p} head={head} />;
}

function PortalAdmin({ head, api = SERVER_API, ...p }: TenantPortalCardProps & { head: React.ReactNode }) {
  const [status, setStatus] = React.useState<{ s: "loading" } | { s: "error"; fail: Fail } | { s: "ok"; d: PortalStatus }>({ s: "loading" });
  const [views, setViews] = React.useState<PortalResult<PortalViewRow[]> | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [codes, setCodes] = React.useState<PortalIssuedCodes | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const bid = p.building.id;

  const load = React.useCallback(async () => {
    const [s, v] = await Promise.all([call(() => api.getPortalStatus(p.businessId, bid)), call(() => api.listPortalViews(p.businessId, bid, 100))]);
    setStatus(s.ok ? { s: "ok", d: s.data } : { s: "error", fail: s });
    setViews(v);
  }, [api, p.businessId, bid]);
  React.useEffect(() => { void load(); }, [load]);

  const act = async <T,>(key: string, fn: () => Promise<PortalResult<T>>, ok: (d: T) => void) => {
    setBusy(key); setErr(null);
    const r = await call(fn);
    setBusy(null);
    if (!r.ok) { setErr(r.message); return; }
    ok(r.data);
    void load();
  };
  const url = token ? `${typeof window === "undefined" ? "" : window.location.origin}/tenant/${token}` : null;

  if (status.s === "loading") return <Card className="p-4 sm:p-5">{head}<LoadingState label="입주자 조회 상태를 불러오는 중…" rows={3} /></Card>;
  if (status.s === "error") return <Card className="p-4 sm:p-5">{head}<ErrorState title="입주자 조회 상태를 불러오지 못했습니다." description={status.fail.message} onRetry={() => { setStatus({ s: "loading" }); void load(); }} /></Card>;
  const st = status.d;
  const withoutCode = st.units.filter((u) => !u.code_issued_at).map((u) => u.unit_id);

  return (
    <Card className="p-4 sm:p-5">
      {head}
      <div aria-live="polite">{err && <Alert kind="error" className="mb-3">{err}</Alert>}</div>

      {/* 1. 건물 QR */}
      <section className="mb-5 rounded-[var(--r-md)] border border-[var(--bd)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-t">건물 QR <span className="font-normal text-t2">— 로비·게시판에 붙이는 1장</span></h3>
            <p className="mt-0.5 text-[length:var(--fs-body)] text-t2">
              {st.link ? <>발급됨 · {fmtLocal(st.link.created_at, p.tz)}</> : "아직 발급하지 않았습니다."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy === "link"} onClick={() => {
              if (st.link && !window.confirm("QR 을 다시 발급하면 지금 붙어 있는 QR 과 그 QR 로 열린 조회가 모두 끝납니다. 새 QR 을 다시 붙여야 합니다. 계속할까요?")) return;
              void act("link", () => api.issuePortalLink(p.businessId, bid), (d) => { setToken(d.token); toast.success(d.revokedPrevious ? "새 QR 을 발급했습니다. 이전 QR 은 이제 쓸 수 없습니다." : "건물 QR 을 발급했습니다."); });
            }}>
              <QrCode size={15} aria-hidden />{st.link ? "다시 발급" : "QR 발급"}
            </Button>
            {st.link && (
              <Button size="sm" variant="ghost" loading={busy === "unlink"} onClick={() => {
                if (!window.confirm("건물 QR 을 폐기할까요? 폐기하면 입주자가 QR 로 조회할 수 없고, 열려 있던 조회도 끝납니다.")) return;
                void act("unlink", () => api.revokePortalLink(p.businessId, bid), () => { setToken(null); toast.success("건물 QR 을 폐기했습니다."); });
              }}>폐기</Button>
            )}
          </div>
        </div>
        {url ? <QrPanel url={url} buildingName={p.building.name} /> : st.link ? (
          <p className="mt-3 text-[length:var(--fs-meta)] text-t2">QR 그림은 발급한 그 자리에서만 볼 수 있습니다(주소를 저장하지 않습니다). 잃어버렸으면 &lsquo;다시 발급&rsquo; 후 새로 붙이세요.</p>
        ) : null}
      </section>

      {/* 2. 호실 접속코드 */}
      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-t">호실 접속코드</h3>
            <p className="text-[length:var(--fs-meta)] text-t2">코드는 발급할 때 한 번만 보입니다. 안내문을 인쇄해 호실에 전하세요. 코드는 계약(입주자)마다 따로 나오고, 같은 입주자에게 새로 발급하면 옛 코드는 바로 못 씁니다. 계약이 끝나면 그 코드는 저절로 폐기됩니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!p.canBilling || withoutCode.length === 0} loading={busy === "codes-new"}
              onClick={() => void act("codes-new", () => api.issuePortalCodes(p.businessId, bid, withoutCode), setCodes)}>
              코드 없는 호실 발급({withoutCode.length})
            </Button>
            <Button size="sm" variant="secondary" disabled={!p.canBilling || st.units.length === 0} loading={busy === "codes-all"} onClick={() => {
              if (!window.confirm("계약 중인 모든 호실에 새 코드를 발급합니다. 이미 코드를 받은 호실의 옛 코드는 모두 못 쓰게 됩니다. 계속할까요?")) return;
              void act("codes-all", () => api.issuePortalCodes(p.businessId, bid), setCodes);
            }}>모든 호실 새로 발급</Button>
          </div>
        </div>
        {!p.canBilling && <Alert kind="warning" className="mb-2">코드 발급은 관리비 금액을 볼 권한(revenue.read)도 있어야 합니다. 폐기와 상태 보기는 할 수 있습니다.</Alert>}
        {st.units.length === 0 ? (
          <EmptyState title="쓰는 호실이 없습니다." description="호실을 먼저 등록하세요." />
        ) : (
          <div className="relative overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>호실</th><th className={TH}>청구받는 사람</th><th className={TH}>코드 발급</th><th className={TH}>마지막 조회</th><th className={TH}>상태</th><th className={TH}><span className="sr-only">동작</span></th></tr></thead>
              <tbody>
                {st.units.map((u) => (
                  <tr key={u.unit_id} className={TR}>
                    <td className={`${TD} whitespace-nowrap font-medium`}>{unitOf(u)}</td>
                    <td className={`${TD} whitespace-nowrap`}>{u.payer_name ?? "-"}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{u.code_issued_at ? fmtLocal(u.code_issued_at, p.tz).slice(0, 10) : <span className="text-t3">없음</span>}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{u.last_login_at ? fmtLocal(u.last_login_at, p.tz) : <span className="text-t3">-</span>}</td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1">
                        {u.lock_wait_sec > 0 ? <Badge kind="error">호실 잠김 {Math.ceil(u.lock_wait_sec / 60)}분</Badge> : u.code_issued_at ? <Badge kind="success">사용 중</Badge> : <span className={PILL}>코드 없음</span>}
                        {(u.active_codes ?? 0) > 1 && <span className={PILL}>코드 {u.active_codes}개</span>}
                        {(u.fails_15m ?? 0) > 0 && <Badge kind="warning">최근 15분 실패 {u.fails_15m}회</Badge>}
                      </span>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button size="sm" variant="ghost" disabled={!p.canBilling} loading={busy === `c-${u.unit_id}`} onClick={() => {
                        if (u.code_issued_at && !window.confirm(`${unitOf(u)}에서 가장 최근에 코드를 받은 입주자(${u.payer_name ?? "-"})에게 새 코드를 발급할까요? 그 입주자의 옛 코드와 그 코드로 열린 조회가 바로 끝납니다.`)) return;
                        // 계약 id 가 있으면 그 계약(지금 입주자)으로 — 호실만 주면 입주 예정 계약이 있는 호실은 건너뛴다(r2).
                        void act(`c-${u.unit_id}`, () => (u.contract_id ? api.issuePortalCodes(p.businessId, bid, undefined, [u.contract_id]) : api.issuePortalCodes(p.businessId, bid, [u.unit_id])), setCodes);
                      }}>{u.code_issued_at ? "재발급" : "발급"}</Button>
                      {u.code_issued_at && (
                        <Button size="sm" variant="ghost" loading={busy === `r-${u.unit_id}`} onClick={() => {
                          if (!window.confirm(`${unitOf(u)}의 코드를 모두 폐기할까요?${(u.active_codes ?? 0) > 1 ? ` (지금 ${u.active_codes}개 — 입주 예정자 코드 포함)` : ""} 그 코드로는 더 이상 조회할 수 없습니다.`)) return;
                          void act(`r-${u.unit_id}`, () => api.revokePortalCode(p.businessId, u.unit_id), () => toast.success(`${unitOf(u)} 코드를 폐기했습니다.`));
                        }}>폐기</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. 열람 기록 */}
      <section>
        <h3 className="mb-1 text-[15px] font-semibold text-t">열람 기록 <span className="font-normal text-t2">— 최근 100건</span></h3>
        {!views ? null : !views.ok ? (
          <Alert kind="error">{views.message}</Alert>
        ) : views.data.length === 0 ? (
          <p className="py-3 text-[length:var(--fs-body)] text-t2">아직 입주자가 조회한 기록이 없습니다.</p>
        ) : (
          <div className="relative max-h-[320px] overflow-auto">
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>시각</th><th className={TH}>호실</th><th className={TH}>한 일</th></tr></thead>
              <tbody>
                {views.data.map((v) => (
                  <tr key={v.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtLocal(v.created_at, p.tz)}</td>
                    <td className={`${TD} whitespace-nowrap`}>{p.unitNames[v.unit_id] ?? "(알 수 없는 호실)"}</td>
                    <td className={TD}>{ACTION[v.action] ?? v.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CodesModal codes={codes} onClose={() => setCodes(null)} url={url} building={p.building}
        issueFor={(contractId) => call(() => api.issuePortalCodes(p.businessId, bid, undefined, [contractId]))}
        onMerged={(d, contractId) => { setCodes((c) => (c ? { issued: [...c.issued, ...d.issued], skipped: c.skipped.filter((s) => s.contract_id !== contractId) } : d)); void load(); }} />
      {url && !codes && <PrintQr url={url} buildingName={p.building.name} />}
    </Card>
  );
}

function QrPanel({ url, buildingName }: { url: string; buildingName: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const save = () => {
    const c = ref.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${buildingName}-관리비조회-QR.png`;
    a.click();
  };
  return (
    <div className="mt-3 flex flex-col gap-4 rounded-[var(--r-md)] bg-sf2 p-4 sm:flex-row sm:items-center">
      <div className="self-center rounded-[var(--r-md)] bg-white p-3"><QRCodeCanvas ref={ref} value={url} size={176} level="M" marginSize={2} aria-label="건물 관리비 조회 QR" role="img" /></div>
      <div className="min-w-0 flex-1 space-y-2">
        <Alert kind="warning">이 QR 은 지금만 볼 수 있습니다. 창을 닫거나 새로고침하기 전에 인쇄하거나 그림으로 저장하세요.</Alert>
        <p className="break-all font-mono text-[length:var(--fs-meta)] text-t2">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => window.print()}><Printer size={15} aria-hidden />QR 인쇄</Button>
          <Button size="sm" variant="secondary" onClick={save}><Download size={15} aria-hidden />그림(PNG) 저장</Button>
        </div>
      </div>
    </div>
  );
}

const PRINT_PAGE = `@media print { @page { size: A4; margin: 16mm; } }`;

function PrintQr({ url, buildingName }: { url: string; buildingName: string }) {
  return createPortal(
    <div id="print-area" style={{ display: "none", background: "#fff", color: "#000", textAlign: "center", fontFamily: "sans-serif" }}>
      <style>{PRINT_PAGE}</style>
      <h1 style={{ fontSize: 26, margin: "24px 0 6px" }}>{buildingName}</h1>
      <p style={{ fontSize: 18, margin: "0 0 24px" }}>휴대폰 카메라로 찍으면 우리 호실 관리비를 볼 수 있습니다</p>
      <QRCodeSVG value={url} size={300} level="M" marginSize={2} style={{ margin: "0 auto" }} />
      <p style={{ fontSize: 14, margin: "24px 0 0" }}>관리사무소에서 받은 호실 접속코드가 필요합니다.</p>
    </div>,
    document.body
  );
}

function CodesModal({ codes, onClose, url, building, issueFor, onMerged }: {
  codes: PortalIssuedCodes | null; onClose: () => void; url: string | null; building: TenantPortalCardProps["building"];
  issueFor: (contractId: string) => Promise<PortalResult<PortalIssuedCodes>>; onMerged: (d: PortalIssuedCodes, contractId: string) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const issue = async (cid: string) => {
    setBusy(cid); setErr(null);
    const r = await issueFor(cid);
    setBusy(null);
    if (r.ok) onMerged(r.data, cid); else setErr(r.message);
  };
  const close = () => { if (window.confirm("창을 닫으면 코드를 다시 볼 수 없습니다(재발급만 가능). 안내문을 인쇄했나요?")) onClose(); };
  return (
    <Modal open={!!codes} onClose={close} title={`접속코드 ${codes?.issued.length ?? 0}건 발급`} className="sm:max-w-[640px]"
      footer={<><Button variant="ghost" onClick={close}>닫기</Button><Button onClick={() => window.print()} disabled={!codes?.issued.length}><Printer size={15} aria-hidden />코드 안내문 인쇄(A4)</Button></>}>
      {codes && (
        <div className="space-y-3">
          <Alert kind="warning">창을 닫으면 코드를 다시 볼 수 없습니다(재발급만 가능). 지금 안내문을 인쇄하거나 옮겨 적으세요.</Alert>
          {!url && codes.issued.length > 0 && <p className="text-[length:var(--fs-meta)] text-t2">이번 화면에서 건물 QR 을 발급하지 않아 안내문에는 QR 그림 대신 &ldquo;로비의 건물 QR 을 찍으세요&rdquo; 문구가 들어갑니다.</p>}
          {codes.issued.length > 0 && (
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>호실</th><th className={TH}>청구받는 사람</th><th className={TH}>접속코드</th><th className={TH}><span className="sr-only">보내기</span></th></tr></thead>
              <tbody>
                {codes.issued.map((c, i) => (
                  <tr key={`${c.unit_id}-${c.contract_id ?? i}`} className={TR}>
                    <td className={`${TD} font-medium`}>{unitOf(c)}</td>
                    <td className={TD}>{c.payer_name ?? "-"}</td>
                    <td className={`${TD} select-all whitespace-nowrap font-mono text-[16px] font-semibold tracking-[0.08em]`}>{fmtCode(c.code)}</td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button size="sm" variant="ghost" onClick={() => openSms(c.phone, codeText(building.name, c, url))} aria-label={`${unitOf(c)} 코드 문자로 보내기`}>
                        <MessageSquare size={14} aria-hidden />문자
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => { if (await copyText(codeText(building.name, c, url))) toast.success(`${unitOf(c)} 안내 문구를 복사했습니다.`); else setErr("복사하지 못했습니다. 코드를 길게 눌러 직접 복사해 주세요."); }} aria-label={`${unitOf(c)} 안내 문구 복사`}>
                        <Copy size={14} aria-hidden />복사
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {codes.skipped.length > 0 && (
            <div>
              <p className="mb-1 text-[length:var(--fs-body)] font-medium text-t">발급하지 않은 호실 {codes.skipped.length}건</p>
              <ul className="space-y-1 text-[length:var(--fs-body)] text-t2">
                {codes.skipped.map((s) => (
                  <li key={`${s.unit_id}-${s.contract_id ?? s.reason}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{unitOf(s)} — {SKIP[s.reason] ?? s.reason}{s.payer_name ? ` (입주 예정: ${s.payer_name})` : ""}</span>
                    {s.reason === "upcoming_contract" && s.contract_id && (
                      <Button size="sm" variant="secondary" loading={busy === s.contract_id} onClick={() => void issue(s.contract_id!)}>입주 예정자에게 발급</Button>
                    )}
                  </li>
                ))}
              </ul>
              <div aria-live="polite">{err && <Alert kind="error" className="mt-2">{err}</Alert>}</div>
              {codes.skipped.some((s) => s.reason === "upcoming_contract") && <p className="mt-1 text-[length:var(--fs-meta)] text-t3">&lsquo;입주 예정자에게 발급&rsquo;을 누르면 그 호실에 지금 입주자 코드와 예정 입주자 코드가 함께 있게 됩니다. 입주 예정자는 자기 계약의 청구만 봅니다.</p>}
            </div>
          )}
          {codes.issued.length > 0 && createPortal(
            <div id="print-area" style={{ display: "none", background: "#fff", color: "#000", fontFamily: "sans-serif" }}>
              <style>{PRINT_PAGE}</style>
              {codes.issued.map((c, i) => (
                <section key={`${c.unit_id}-${c.contract_id ?? i}`} style={{ breakAfter: i < codes.issued.length - 1 ? "page" : "auto", padding: "8mm 4mm", textAlign: "center" }}>
                  <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{building.name} 관리비 조회 안내</h1>
                  <p style={{ fontSize: 16, margin: "0 0 20px" }}>{unitOf(c)}{c.payer_name ? ` · ${c.payer_name} 님` : ""}</p>
                  <div style={{ display: "inline-block", border: "2px solid #000", borderRadius: 8, padding: "12px 28px", margin: "0 0 20px" }}>
                    <p style={{ fontSize: 13, margin: 0 }}>호실 접속코드</p>
                    <p style={{ fontSize: 36, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "monospace", margin: "4px 0 0" }}>{fmtCode(c.code)}</p>
                  </div>
                  {url ? (
                    <div style={{ margin: "0 0 16px" }}><QRCodeSVG value={url} size={200} level="M" marginSize={2} style={{ margin: "0 auto" }} /></div>
                  ) : (
                    <p style={{ fontSize: 15, margin: "0 0 16px" }}>건물 입구·게시판에 붙은 &lsquo;관리비 조회 QR&rsquo;을 휴대폰 카메라로 찍으세요.</p>
                  )}
                  <ol style={{ textAlign: "left", fontSize: 14, lineHeight: 1.7, maxWidth: 440, margin: "0 auto" }}>
                    <li>QR 을 찍어 화면을 엽니다.</li>
                    <li>호실과 위 접속코드를 넣습니다.</li>
                    <li>확정된 관리비·명세서 PDF 를 보고, 궁금한 점은 &lsquo;문의·이의 남기기&rsquo;로 보냅니다.</li>
                  </ol>
                  <p style={{ fontSize: 12, margin: "20px 0 0" }}>코드는 다른 사람에게 알려 주지 마세요. 잃어버렸으면 관리사무소에 새 코드를 요청하세요.</p>
                  {(building.office_name || building.office_phone) && (
                    <p style={{ fontSize: 13, margin: "8px 0 0" }}>{[building.office_name ?? "관리사무소", building.office_phone, building.office_hours].filter(Boolean).join(" · ")}</p>
                  )}
                </section>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}
    </Modal>
  );
}
