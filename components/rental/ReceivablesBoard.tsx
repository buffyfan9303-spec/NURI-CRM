"use client";

/**
 * 미수금 보드(0027 §4) — 상단 요약(총 미수·연령 구간·보관 보증금), 구간 탭, 예약별/고객별 보기,
 * 행 동작(독촉 기록·독촉 문구·수납 바로가기·대손). '보관 보증금' 탭은 반납이 끝났는데 아직 돌려주지 않은 보증금을 강조한다.
 * 금액·권한 판정은 서버(RPC). 여기서는 목록을 나누고 폼을 띄우기만 한다.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, ClipboardPlus, Banknote, Ban } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { MessageActions } from "@/components/common/MessageActions";
import { StatusTab, FilterRow, Alert, SelectField, CONTROL, TABLE, THEAD, TH, TR, TD } from "./listkit";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { formatInTz } from "@/lib/utils/datetime";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_BADGE, type ReservationStatus } from "@/lib/domain/rental-types";
import {
  AGING_BUCKET_LABEL, AGING_BUCKET_ORDER, COLLECTION_CHANNEL_LABEL,
  type AgingBucket, type CollectionChannel, type DepositsHeld, type DepositHeldRow, type ReceivableRow, type ReceivablesReport,
} from "@/lib/domain/rental-money-types";
import { logCollectionAction, writeOffAction } from "@/lib/domain/rental-money-actions";

type Tab = "all" | AgingBucket | "deposits";

export function ReceivablesBoard({
  businessId,
  businessName,
  tz,
  report,
  deposits,
  canWrite,
  canRefund,
  isOwner,
}: {
  businessId: string;
  businessName: string;
  tz: string;
  report: ReceivablesReport;
  deposits: DepositsHeld;
  canWrite: boolean;
  canRefund: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("all");
  const [byCustomer, setByCustomer] = React.useState(false);
  const [logTarget, setLogTarget] = React.useState<ReceivableRow | null>(null);
  const [msgTarget, setMsgTarget] = React.useState<ReceivableRow | null>(null);
  const [writeOffTarget, setWriteOffTarget] = React.useState<ReceivableRow | null>(null);
  const refresh = () => router.refresh();

  const rows = tab === "all" || tab === "deposits" ? report.rows : report.rows.filter((r) => r.bucket === tab);
  const overdue90 = report.byBucket.d90p?.total ?? 0;
  const depositsAfterReturn = deposits.rows.filter((r) => ["returned", "closed"].includes(r.status));

  const D = "yyyy. M. d.";
  const rowView = (r: ReceivableRow) => ({
    customer: r.customerName ?? "고객 미지정",
    phone: r.customerPhone ?? (r.customerName ? "연락처 비공개" : "-"),
    href: `/w/${businessId}/reservations/${r.reservationId}`,
    period: `${formatInTz(r.periodStart, tz, "M. d.")}~${formatInTz(r.periodEnd, tz, "M. d.")}`,
    status: RESERVATION_STATUS_LABEL[r.status as ReservationStatus] ?? r.status,
    due: formatInTz(r.dueDate, tz, D),
    days: r.daysOverdue > 0 ? `${r.daysOverdue}일 지남` : "미도래",
    bucket: r.bucket,
    lastContact: r.lastContactAt ? `${formatInTz(r.lastContactAt, tz, "M. d.")} ${r.lastContactChannel ? COLLECTION_CHANNEL_LABEL[r.lastContactChannel] : ""}` : "없음",
    promised: r.promisedPayDate ? `약속 ${formatInTz(r.promisedPayDate, tz, "M. d.")}` : null,
    actions: (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {canWrite && (
          <Button size="sm" variant="ghost" onClick={() => setLogTarget(r)} aria-label={`${r.customerName ?? "고객"} 독촉 기록`}>
            <ClipboardPlus size={13} aria-hidden />독촉 기록
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setMsgTarget(r)} aria-label={`${r.customerName ?? "고객"} 독촉 문구`}>
          <MessageSquare size={13} aria-hidden />문구
        </Button>
        {canWrite && (
          <Link href={`/w/${businessId}/reservations/${r.reservationId}#settlement`} className="inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]">
            <Banknote size={13} aria-hidden />수납
          </Link>
        )}
        {isOwner && canRefund && (
          <Button size="sm" variant="ghost" className="text-et" onClick={() => setWriteOffTarget(r)} aria-label={`${r.customerName ?? "고객"} 대손 처리`}>
            <Ban size={13} aria-hidden />대손
          </Button>
        )}
      </div>
    ),
  });

  // 고객별 묶기: customerRef 가 있으면 그것으로, 없으면 이름+전화(레거시 예약)로 묶는다.
  const groups = React.useMemo(() => {
    const m = new Map<string, { key: string; name: string; phone: string | null; total: number; rows: ReceivableRow[]; worst: AgingBucket; lastContactAt: string | null; customerRef: string | null }>();
    for (const r of rows) {
      const key = r.customerRef ?? `${r.customerName ?? ""}|${r.customerPhone ?? ""}`;
      const g = m.get(key) ?? { key, name: r.customerName ?? "고객 미지정", phone: r.customerPhone, total: 0, rows: [], worst: "not_due" as AgingBucket, lastContactAt: null, customerRef: r.customerRef };
      g.total += r.outstanding;
      g.rows.push(r);
      if (AGING_BUCKET_ORDER.indexOf(r.bucket) > AGING_BUCKET_ORDER.indexOf(g.worst)) g.worst = r.bucket;
      if (r.lastContactAt && (!g.lastContactAt || r.lastContactAt > g.lastContactAt)) g.lastContactAt = r.lastContactAt;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  return (
    <>
      <PageHeader
        title="미수금"
        description="받을 돈을 만기 기준 경과일로 나눠 보여줍니다. 독촉 기록과 문구 발송, 수납 바로가기, 회수 불능(대손) 처리를 여기서 합니다."
        meta={<span className="rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">{report.count}건</span>}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="총 미수금" value={formatKRW(report.total)} tone={report.total > 0 ? "alert" : "neutral"} sub={`${report.count}건 · ${formatInTz(report.asOf, tz, D)} 기준`} />
            <SummaryTile label="90일 초과" value={formatKRW(overdue90)} tone={overdue90 > 0 ? "alert" : "neutral"} sub={`${report.byBucket.d90p?.count ?? 0}건 · 대손 검토 대상`} />
            <SummaryTile label="보관 보증금" value={formatKRW(deposits.total)} sub={`${deposits.count}건 보관 중`} />
            <SummaryTile label="반납 후 미반환 보증금" value={`${depositsAfterReturn.length}건`} tone={depositsAfterReturn.length > 0 ? "alert" : "neutral"} sub={formatKRW(depositsAfterReturn.reduce((s, r) => s + r.depositBalance, 0))} />
          </div>
          <FilterRow>
            <StatusTab active={tab === "all"} onClick={() => setTab("all")} count={report.count}>전체</StatusTab>
            {AGING_BUCKET_ORDER.map((b) => (
              <StatusTab key={b} active={tab === b} onClick={() => setTab(b)} count={report.byBucket[b]?.count ?? 0}>{AGING_BUCKET_LABEL[b]}</StatusTab>
            ))}
            <StatusTab active={tab === "deposits"} onClick={() => setTab("deposits")} count={deposits.count}>보관 보증금</StatusTab>
            {tab !== "deposits" && (
              <label className="ml-auto flex min-h-[32px] shrink-0 items-center gap-1.5 text-[12.5px] text-t2 [@media(pointer:coarse)]:min-h-[44px]">
                <input type="checkbox" checked={byCustomer} onChange={(e) => setByCustomer(e.target.checked)} className="h-[16px] w-[16px] accent-[var(--accent-strong)]" />
                고객별 보기
              </label>
            )}
          </FilterRow>
        </div>
      </PageHeader>

      {tab === "deposits" ? (
        <DepositsTable businessId={businessId} tz={tz} rows={deposits.rows} />
      ) : rows.length === 0 ? (
        <Card><EmptyState title="해당 구간에 미수금이 없습니다." description={tab === "all" ? "확정 예약의 대여료·연체료·손상비·위약금 중 아직 받지 못한 돈이 생기면 여기 표시됩니다." : "다른 구간 탭을 확인하세요."} /></Card>
      ) : byCustomer ? (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <Card key={g.key} className="p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-t">
                    {g.customerRef ? <Link href={`/w/${businessId}/customers/${g.customerRef}`} className="hover:underline">{g.name}</Link> : g.name}
                    <span className="ml-2 text-[12px] font-normal tabular-nums text-t2">{g.phone ?? "연락처 비공개"}</span>
                  </p>
                  <p className="text-[11.5px] text-t3">{g.rows.length}건 · 최근 독촉 {g.lastContactAt ? formatInTz(g.lastContactAt, tz, D) : "없음"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge kind={bucketKind(g.worst)}>{AGING_BUCKET_LABEL[g.worst]}</Badge>
                  <span className="text-[16px] font-bold tabular-nums text-et">{formatKRW(g.total)}</span>
                </div>
              </div>
              <ul className="flex flex-col divide-y divide-[var(--bd)]">
                {g.rows.map((r) => {
                  const v = rowView(r);
                  return (
                    <li key={r.reservationId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                      <span className="min-w-0">
                        <Link href={v.href} className="font-medium text-[var(--accent-ink)] hover:underline">{v.period}</Link>
                        <span className="ml-2 text-t3">{v.status} · 만기 {v.due} · {v.days}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-et">{formatKRW(r.outstanding)}</span>
                        {v.actions}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <TableOrCards
          rows={rows}
          keyOf={(r) => r.reservationId}
          table={
            <Card className="relative overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" tabIndex={0} role="region" aria-label="미수금 표(가로 스크롤)">
              <table className={`${TABLE} min-w-[1080px]`}>
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>고객</th>
                    <th className={TH}>연락처</th>
                    <th className={TH}>예약</th>
                    <th className={TH}>만기</th>
                    <th className={TH}>경과</th>
                    <th className={`${TH} text-right`}>미수금</th>
                    <th className={TH}>마지막 독촉</th>
                    <th className={`${TH} text-right`}><span className="sr-only">동작</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const v = rowView(r);
                    return (
                      <tr key={r.reservationId} className={`${TR} h-[52px]`}>
                        <td className={TD}>
                          {r.customerRef ? <Link href={`/w/${businessId}/customers/${r.customerRef}`} className="block max-w-[140px] truncate font-medium text-t hover:underline" title={v.customer}>{v.customer}</Link> : <span className="block max-w-[140px] truncate font-medium text-t">{v.customer}</span>}
                        </td>
                        <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.phone}</td>
                        <td className={`${TD} whitespace-nowrap`}>
                          <Link href={v.href} className="font-medium text-[var(--accent-ink)] hover:underline">{v.period}</Link>
                          <span className="ml-1.5 text-[11.5px] text-t3">{v.status}</span>
                        </td>
                        <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.due}</td>
                        <td className={`${TD} whitespace-nowrap`}><Badge kind={bucketKind(r.bucket)}>{v.days}</Badge></td>
                        <td className={`${TD} whitespace-nowrap text-right font-semibold tabular-nums text-et`}>{formatKRW(r.outstanding)}</td>
                        <td className={`${TD} whitespace-nowrap text-t2`}>{v.lastContact}{v.promised && <span className="block text-[11px] text-t3">{v.promised}</span>}</td>
                        <td className={`${TD} text-right`}>{v.actions}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          }
          card={(r) => {
            const v = rowView(r);
            return (
              <MobileCard
                title={v.customer}
                sub={<span className="tabular-nums">{v.phone}</span>}
                badge={<Badge kind={bucketKind(r.bucket)}>{v.days}</Badge>}
                fields={[
                  ["예약", <Link key="l" href={v.href} className="inline-flex min-h-[44px] items-center text-[var(--accent-ink)] underline underline-offset-2">{v.period} · {v.status}</Link>],
                  ["만기", v.due],
                  ["미수금", <span key="o" className="font-semibold text-et">{formatKRW(r.outstanding)}</span>],
                  ["마지막 독촉", v.promised ? `${v.lastContact} · ${v.promised}` : v.lastContact],
                ]}
                actions={v.actions}
              />
            );
          }}
        />
      )}

      <CollectionLogModal businessId={businessId} tz={tz} target={logTarget} onClose={() => setLogTarget(null)} onDone={() => { setLogTarget(null); refresh(); }} />
      <Modal open={!!msgTarget} onClose={() => setMsgTarget(null)} title="미수금 독촉 문구" footer={<Button variant="secondary" onClick={() => setMsgTarget(null)}>닫기</Button>}>
        {msgTarget && (
          <>
            <MessageActions text={dunningText(businessName, msgTarget, tz)} phone={msgTarget.customerPhone ?? undefined} title="문구(수정 가능 · [계좌]를 실제 계좌로 바꾸세요)" />
            {canWrite && <p className="mt-3 text-[11.5px] text-t3">보낸 뒤에는 &lsquo;독촉 기록&rsquo;으로 남겨 두면 다음 담당자도 알 수 있습니다.</p>}
          </>
        )}
      </Modal>
      <WriteOffModal businessId={businessId} target={writeOffTarget} onClose={() => setWriteOffTarget(null)} onDone={() => { setWriteOffTarget(null); refresh(); }} />
    </>
  );
}

function bucketKind(b: AgingBucket): "success" | "warning" | "info" | "error" {
  return b === "not_due" ? "info" : b === "d1_7" || b === "d8_30" ? "warning" : "error";
}

function dunningText(businessName: string, r: ReceivableRow, tz: string): string {
  const who = r.customerName ? `${r.customerName} 고객님` : "고객님";
  const period = `${formatInTz(r.periodStart, tz, "M월 d일")}~${formatInTz(r.periodEnd, tz, "M월 d일")}`;
  const when = r.promisedPayDate ? `약속하신 ${formatInTz(r.promisedPayDate, tz, "M월 d일")}까지` : "빠른 시일 내에";
  return `[${businessName}] ${who}, 안녕하세요.\n대여(${period}) 잔금 ${formatKRW(r.outstanding)}이 아직 입금되지 않았습니다.\n${when} 아래 계좌로 입금 부탁드립니다.\n입금 계좌: [계좌]\n입금 후 문자 주시면 바로 확인해 드리겠습니다. 감사합니다.`;
}

function SummaryTile({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "alert" }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf px-4 py-3 shadow-card">
      <p className="text-[12px] text-t2">{label}</p>
      <p className={cn("mt-1 text-[22px] font-bold leading-none tabular-nums", tone === "alert" ? "text-et" : "text-t")}>{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] text-t3">{sub}</p>}
    </div>
  );
}

/** 보관 보증금 현황 — 반납이 끝났는데 아직 돌려주지 않은 건을 위로, 강조해서. */
function DepositsTable({ businessId, tz, rows }: { businessId: string; tz: string; rows: DepositHeldRow[] }) {
  const sorted = [...rows].sort((a, b) => Number(isReturned(b)) - Number(isReturned(a)) || b.depositBalance - a.depositBalance);
  if (sorted.length === 0) return <Card><EmptyState title="보관 중인 보증금이 없습니다." description="보증금을 받으면 반환·몰수 전까지 여기 표시됩니다." /></Card>;
  const view = (r: DepositHeldRow) => ({
    customer: r.customerName ?? "고객 미지정",
    href: `/w/${businessId}/reservations/${r.reservationId}`,
    period: `${formatInTz(r.periodStart, tz, "M. d.")}~${formatInTz(r.periodEnd, tz, "M. d.")}`,
    status: r.status as ReservationStatus,
    returned: isReturned(r),
  });
  return (
    <TableOrCards
      rows={sorted}
      keyOf={(r) => r.reservationId}
      table={
        <Card className="relative overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" tabIndex={0} role="region" aria-label="보관 보증금 표(가로 스크롤)">
          <table className={`${TABLE} min-w-[820px]`}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>고객</th>
                <th className={TH}>예약</th>
                <th className={TH}>상태</th>
                <th className={`${TH} text-right`}>보관 보증금</th>
                <th className={`${TH} text-right`}>필요액</th>
                <th className={`${TH} text-right`}>미수금</th>
                <th className={`${TH} text-right`}><span className="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const v = view(r);
                return (
                  <tr key={r.reservationId} className={cn(TR, "h-[52px]", v.returned && "bg-wb/40")}>
                    <td className={TD}>{r.customerRef ? <Link href={`/w/${businessId}/customers/${r.customerRef}`} className="font-medium text-t hover:underline">{v.customer}</Link> : <span className="font-medium text-t">{v.customer}</span>}</td>
                    <td className={`${TD} whitespace-nowrap`}><Link href={v.href} className="font-medium text-[var(--accent-ink)] hover:underline">{v.period}</Link></td>
                    <td className={TD}>
                      <Badge kind={RESERVATION_STATUS_BADGE[v.status] ?? "info"}>{RESERVATION_STATUS_LABEL[v.status] ?? r.status}</Badge>
                      {v.returned && <span className="ml-1.5 text-[11px] font-medium text-wt">반환 필요</span>}
                    </td>
                    <td className={`${TD} text-right font-semibold tabular-nums text-t`}>{formatKRW(r.depositBalance)}</td>
                    <td className={`${TD} text-right tabular-nums text-t2`}>{formatKRW(r.depositRequired)}</td>
                    <td className={cn(TD, "text-right tabular-nums", r.outstanding > 0 ? "font-semibold text-et" : "text-t2")}>{formatKRW(r.outstanding)}</td>
                    <td className={`${TD} text-right`}>
                      <Link href={`${v.href}#settlement`} className="inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]">{v.returned ? "반환 처리" : "예약 상세"}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      }
      card={(r) => {
        const v = view(r);
        return (
          <MobileCard
            title={v.customer}
            sub={<span>{v.period}</span>}
            badge={v.returned ? <Badge kind="warning">반환 필요</Badge> : <Badge kind={RESERVATION_STATUS_BADGE[v.status] ?? "info"}>{RESERVATION_STATUS_LABEL[v.status] ?? r.status}</Badge>}
            fields={[["보관 보증금", <span key="d" className="font-semibold">{formatKRW(r.depositBalance)}</span>], ["필요액", formatKRW(r.depositRequired)], ["미수금", formatKRW(r.outstanding)]]}
            actions={<Link href={`${v.href}#settlement`} className="inline-flex min-h-[44px] items-center rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2">{v.returned ? "반환 처리" : "예약 상세"}</Link>}
          />
        );
      }}
    />
  );
}
const isReturned = (r: DepositHeldRow) => ["returned", "closed"].includes(r.status);

function CollectionLogModal({ businessId, tz, target, onClose, onDone }: { businessId: string; tz: string; target: ReceivableRow | null; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = React.useState<CollectionChannel>("call");
  const [note, setNote] = React.useState("");
  const [promised, setPromised] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (target) { setChannel("call"); setNote(""); setPromised(""); setError(null); } }, [target]);

  const submit = async () => {
    if (!target) return;
    setBusy(true); setError(null);
    const r = await logCollectionAction(businessId, target.reservationId, { channel, note, promisedPayDate: promised || null });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone();
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="독촉 기록"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>기록</Button></>}
    >
      {target && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {error && <Alert className="mb-3">{error}</Alert>}
          <p className="mb-3 text-[12.5px] text-t2">{target.customerName ?? "고객 미지정"} · 미수 {formatKRW(target.outstanding)} · 만기 {formatInTz(target.dueDate, tz, "M. d.")}</p>
          <SelectField label="연락 수단" value={channel} onChange={(e) => setChannel(e.target.value as CollectionChannel)}>
            {(Object.keys(COLLECTION_CHANNEL_LABEL) as CollectionChannel[]).map((c) => <option key={c} value={c}>{COLLECTION_CHANNEL_LABEL[c]}</option>)}
          </SelectField>
          <label className="mb-4 flex flex-col gap-1.5 text-[13px] font-medium text-t2">
            입금 약속일(선택)
            <input type="date" value={promised} onChange={(e) => setPromised(e.target.value)} className={CONTROL} />
          </label>
          <Input label="메모(선택)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 다음 주 월요일 입금하겠다고 함" wrapperClassName="mb-0" />
        </form>
      )}
    </Modal>
  );
}

function WriteOffModal({ businessId, target, onClose, onDone }: { businessId: string; target: ReceivableRow | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const key = React.useRef(crypto.randomUUID());
  React.useEffect(() => { if (target) { setAmount(String(target.outstanding)); setReason(""); setError(null); } }, [target]);

  const submit = async () => {
    if (!target) return;
    const amt = parseKRW(amount);
    if (amt <= 0 || amt > target.outstanding) { setError(`1원 이상 미수금(${formatKRW(target.outstanding)}) 이하로 입력하세요.`); return; }
    if (!reason.trim()) { setError("대손 사유를 입력하세요."); return; }
    if (!window.confirm(`미수금 ${formatKRW(amt)}을 회수 불능(대손)으로 처리합니다. 매출은 그대로 남고 미수만 줄어듭니다. 계속할까요?`)) return;
    setBusy(true); setError(null);
    const r = await writeOffAction(businessId, target.reservationId, { amount: amt, reason, idempotencyKey: key.current });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    key.current = crypto.randomUUID();
    onDone();
  };
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="대손 처리(사업장 owner 전용)"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button variant="danger" onClick={submit} loading={busy}>대손 처리</Button></>}
    >
      {target && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {error && <Alert className="mb-3">{error}</Alert>}
          <p className="mb-3 text-[12.5px] text-t2">{target.customerName ?? "고객 미지정"} · 미수 {formatKRW(target.outstanding)}. 연락 두절 등으로 받을 수 없는 돈만 처리하세요. 매출 보고는 줄지 않습니다.</p>
          <Input label="대손액(원)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
          <Input label="사유" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 연락 두절 6개월" wrapperClassName="mb-0" />
        </form>
      )}
    </Modal>
  );
}
