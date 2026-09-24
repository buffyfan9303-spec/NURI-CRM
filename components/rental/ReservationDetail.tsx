"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Wrench, Repeat } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_BADGE,
  PAYMENT_STATUS_LABEL,
  ITEM_STATUS_LABEL,
  type ReservationRow,
  type ReservationItemRow,
  type ReservationBalance,
  type DamageClaimRow,
  type LedgerEntryRow,
} from "@/lib/domain/rental-types";
import {
  confirmReservationAction,
  cancelReservationDraft,
  markItemsOutAction,
  markItemsReturnedAction,
  markItemMissingOrDamaged,
  updateReservationPeriod,
  getSwapCandidatesAction,
  swapReservationUnitAction,
  type SwapResult,
} from "@/lib/domain/rental-actions";
import type { SwapCandidateRow } from "@/lib/domain/rental-types";
import { UNIT_STATUS_LABEL } from "@/lib/domain/rental-types";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { SettlementPanel } from "./SettlementPanel";
import { ReturnInspectionPanel, CancelConfirmedButton, NoticeButton, ClaimsCard } from "./ReservationTools";
import { CardHead, Alert, BackLink, SelectField, CONTROL, TABLE, THEAD, TH, TR, TD } from "./listkit";

/** 개체 교환이 허용되는 예약 상태(crm.swap_reservation_unit의 상태 검사와 동일). */
const SWAPPABLE_STATUS = ["confirmed", "out", "partial_return"];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function reservationNo(id: string): string {
  return `R-${id.slice(0, 8).toUpperCase()}`;
}

const FMT = "yyyy. M. d. (EEE) HH:mm";

export function ReservationDetail({
  businessId,
  businessName,
  tz,
  reservation,
  balance,
  claims,
  history,
  canWrite,
  canRefund,
  canRevenueRead,
}: {
  businessId: string;
  businessName: string;
  tz: string;
  reservation: ReservationRow;
  balance: ReservationBalance | { masked: true } | null;
  claims: DamageClaimRow[];
  history: { masked: boolean; entries: LedgerEntryRow[] } | null;
  canWrite: boolean;
  canRefund: boolean;
  canRevenueRead: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [periodOpen, setPeriodOpen] = React.useState(false);

  const refresh = () => { setNotice(null); router.refresh(); };
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, successMsg?: string) => {
    setBusy(true); setError(null); setNotice(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
    if (successMsg) setNotice(successMsg);
    router.refresh();
  };

  const outable = reservation.items.filter((i) => ["reserved", "assigned"].includes(i.itemStatus));
  const returnable = reservation.items.filter((i) => i.itemStatus === "out");
  // 결함 D6: 예약 헤더 상태(recompute_reservation_status)와 항목별 item_status가 어긋난
  // 픽스처가 있다 — 헤더가 "출고완료"인데 항목은 아직 "예약(개체 미배정)"으로 남아
  // 모순돼 보인다. 원인(픽스처 시딩 vs 서버 로직)은 이 화면 담당 밖이라 고치지 않고,
  // 대신 화면이 그 모순을 조용히 감추지 않도록 안내만 띄운다.
  const statusMismatch = ["out", "partial_return"].includes(reservation.status) && outable.length > 0;

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const canChangePeriod = canWrite && !["closed", "cancelled", "returned"].includes(reservation.status);
  const isDraft = canWrite && reservation.status === "draft";
  const selectedOut = [...selected].filter((id) => outable.some((i) => i.id === id));
  const selectedRet = [...selected].filter((id) => returnable.some((i) => i.id === id));
  const overdue = ["out", "partial_return"].includes(reservation.status) && new Date(reservation.periodEnd).getTime() < Date.now();
  const flatBalance = balance && !("masked" in balance) ? balance : null;
  // 반납 검수 한 화면은 write+revenue.read+refund 가 모두 있어야 서버가 롤백 없이 끝난다.
  const canInspect = canWrite && canRevenueRead && canRefund;

  // 표와 카드가 같은 값·같은 동작을 쓰도록 한 곳에서 계산한다.
  const itemView = (i: ReservationItemRow) => {
    const selectable = outable.includes(i) || returnable.includes(i);
    return {
      selectable,
      checkbox: selectable ? (
        <label data-skip-touch className="inline-flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-[var(--r-sm)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]">
          <input
            type="checkbox"
            checked={selected.has(i.id)}
            onChange={() => toggle(i.id)}
            aria-label={`${i.productName} 선택`}
            className="h-[18px] w-[18px] accent-[var(--accent-strong)]"
          />
        </label>
      ) : null,
      sku: i.skuColor && i.skuSize ? `${i.skuColor}/${i.skuSize}` : "-",
      unit: i.unitCode ?? "미배정",
      fee: formatKRW(i.fee),
      discount: formatKRW(i.discount),
      status: <span className="rounded-[6px] bg-sf2 px-2 py-0.5 text-[11.5px] font-medium text-t2">{ITEM_STATUS_LABEL[i.itemStatus]}</span>,
      actions: canWrite ? (
        <div className="flex flex-wrap items-center gap-1">
          {i.itemStatus === "out" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-et"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("누락 처리하면 되돌릴 수 없습니다(개체는 분실 종단 상태가 됩니다). 계속할까요?")) return;
                  run(() => markItemMissingOrDamaged(businessId, reservation.id, i.id, i.unitId, "missing"));
                }}
              >
                누락 처리
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-wt"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("손상 처리하면 개체가 검수 대기로 바뀝니다. 계속할까요?")) return;
                  run(() => markItemMissingOrDamaged(businessId, reservation.id, i.id, i.unitId, "damaged"));
                }}
              >
                손상 처리
              </Button>
            </>
          )}
          {i.unitId && (
            <Link
              href={`/w/${businessId}/care?unit=${i.unitId}`}
              className="inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]"
            >
              <Wrench size={13} aria-hidden />세탁·수선
            </Link>
          )}
          {i.unitId && i.skuId && SWAPPABLE_STATUS.includes(reservation.status) && (
            <SwapUnitButton
              businessId={businessId}
              itemId={i.id}
              skuId={i.skuId}
              currentUnitId={i.unitId}
              currentUnitCode={i.unitCode ?? ""}
              onDone={refresh}
            />
          )}
        </div>
      ) : null,
    };
  };

  return (
    <>
      <BackLink href={`/w/${businessId}/reservations`}>예약 목록</BackLink>
      <PageHeader
        title={`${reservation.customerName ?? "고객 미지정"} 예약`}
        description={[reservationNo(reservation.id), reservation.customerPhone].filter(Boolean).join(" · ")}
        meta={
          <>
            <Badge kind={RESERVATION_STATUS_BADGE[reservation.status]}>{RESERVATION_STATUS_LABEL[reservation.status]}</Badge>
            {balance && !("masked" in balance) && (
              <Badge kind={balance.paymentStatus === "paid" ? "success" : balance.outstanding > 0 ? "warning" : "info"}>
                {PAYMENT_STATUS_LABEL[balance.paymentStatus]}
              </Badge>
            )}
            {overdue && <Badge kind="error">반납 지연</Badge>}
          </>
        }
        actions={
          <>
            {!["draft", "cancelled"].includes(reservation.status) && (
              <NoticeButton businessName={businessName} reservation={reservation} balance={flatBalance} tz={tz} />
            )}
            {isDraft && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(() => cancelReservationDraft(businessId, reservation.id), "예약이 취소되었습니다.")}
                >
                  취소
                </Button>
                <Button onClick={() => run(() => confirmReservationAction(businessId, reservation.id), "예약이 확정되었습니다.")} loading={busy}>
                  예약 확정
                </Button>
              </>
            )}
            {canWrite && reservation.status === "confirmed" && (
              <CancelConfirmedButton
                businessId={businessId}
                reservationId={reservation.id}
                hasMoney={flatBalance ? flatBalance.cashReceived > 0 || flatBalance.depositBalance > 0 : true}
                canRefund={canRefund}
                onDone={refresh}
              />
            )}
            {canInspect && <ReturnInspectionPanel businessId={businessId} reservation={reservation} balance={flatBalance} onDone={refresh} />}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        {statusMismatch && (
          <Alert kind="warning">
            예약 상태는 &apos;{RESERVATION_STATUS_LABEL[reservation.status]}&apos;이지만 개체가 배정되지 않았거나
            아직 출고되지 않은 항목이 있습니다. 아래 항목별 상태를 확인한 뒤 출고 처리하세요.
          </Alert>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Card className="p-4 sm:p-5">
              <CardHead
                title="구성 항목"
                description={`${reservation.items.length}품목 · 개체 ${reservation.items.filter((i) => i.unitCode).length}/${reservation.items.length} 배정`}
                action={
                  canWrite && (outable.length > 0 || returnable.length > 0) ? (
                    <>
                      {outable.length > 0 && (
                        <Button
                          size="sm"
                          loading={busy}
                          disabled={selectedOut.length === 0}
                          onClick={async () => {
                            const ids = selectedOut;
                            await run(() => markItemsOutAction(businessId, reservation.id, ids), "선택 항목을 출고 처리했습니다.");
                            // CLICK-PATH-213: 처리한 항목은 체크를 남기지 않는다 — 다음 동작(반납 접수 등)이 그대로 쓸리는 걸 막는다.
                            setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
                          }}
                        >
                          선택 출고{selectedOut.length > 0 ? ` (${selectedOut.length})` : ""}
                        </Button>
                      )}
                      {returnable.length > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy}
                          disabled={selectedRet.length === 0}
                          onClick={async () => {
                            const ids = selectedRet;
                            await run(() => markItemsReturnedAction(businessId, reservation.id, ids), "선택 항목을 반납 접수했습니다(검수 전 상태).");
                            setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
                          }}
                        >
                          선택 반납 접수{selectedRet.length > 0 ? ` (${selectedRet.length})` : ""}
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              />
              <TableOrCards
                rows={reservation.items}
                keyOf={(i) => i.id}
                table={
                  <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                    <table className={`${TABLE} min-w-[880px]`}>
                      <thead>
                        <tr className={THEAD}>
                          <th className="w-9 px-2 py-2.5"><span className="sr-only">선택</span></th>
                          <th className={TH}>상품</th>
                          <th className={TH}>SKU</th>
                          <th className={TH}>개체</th>
                          <th className={`${TH} text-right`}>수량</th>
                          {canRevenueRead && <th className={`${TH} text-right`}>대여료</th>}
                          {canRevenueRead && <th className={`${TH} text-right`}>할인</th>}
                          <th className={TH}>항목 상태</th>
                          {canWrite && <th className={TH}>동작</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {reservation.items.map((i) => {
                          const v = itemView(i);
                          return (
                            <tr key={i.id} className={`${TR} h-[52px]`}>
                              <td className="px-2 py-2 align-middle">{v.checkbox}</td>
                              <td className={`${TD} font-medium text-t`}><span className="block max-w-[260px] truncate" title={i.productName}>{i.productName}</span></td>
                              <td className={`${TD} whitespace-nowrap text-t2`}>{v.sku}</td>
                              <td className={`${TD} whitespace-nowrap font-mono text-t2`}>{v.unit}</td>
                              <td className={`${TD} text-right tabular-nums text-t2`}>{i.qty}</td>
                              {canRevenueRead && <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{v.fee}</td>}
                              {canRevenueRead && <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t2`}>{v.discount}</td>}
                              <td className={`${TD} whitespace-nowrap`}>{v.status}</td>
                              {canWrite && <td className={TD}>{v.actions}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                }
                card={(i) => {
                  const v = itemView(i);
                  return (
                    <MobileCard
                      title={i.productName}
                      sub={<><span>{v.sku}</span><span>· 개체 <span className="font-mono text-t2">{v.unit}</span></span></>}
                      badge={v.status}
                      fields={[
                        ["수량", i.qty],
                        ...(canRevenueRead ? ([["대여료", v.fee], ["할인", v.discount]] as [string, React.ReactNode][]) : []),
                      ]}
                      actions={
                        <>
                          {v.selectable && (
                            <label className="mr-auto inline-flex min-h-[44px] items-center gap-2 text-[12.5px] text-t2">
                              {v.checkbox}
                              선택
                            </label>
                          )}
                          {v.actions}
                        </>
                      }
                    />
                  );
                }}
              />
            </Card>

            {canRevenueRead && (
              <Card className="p-4 sm:p-5">
                <CardHead title="정산" description="대여매출·연체료·보증금·수납은 항목별로 분리해 표시합니다." />
                <SettlementPanel
                  businessId={businessId}
                  reservationId={reservation.id}
                  balance={balance}
                  history={history}
                  canWrite={canWrite}
                  canRefund={canRefund}
                  onChanged={refresh}
                />
              </Card>
            )}

            {(canRevenueRead || claims.length > 0) && !["draft"].includes(reservation.status) && (
              <Card className="p-4 sm:p-5">
                <ClaimsCard
                  businessId={businessId}
                  reservation={reservation}
                  claims={claims}
                  balance={flatBalance}
                  canWrite={canWrite}
                  canRefund={canRefund}
                  canRevenueRead={canRevenueRead}
                  onChanged={refresh}
                />
              </Card>
            )}
          </div>

          {/* <1024 에서는 기간·고객 요약을 맨 위로 올린다(연구 8장 "상단 상태 흐름").
              한 칼럼일 때 정산·수납·환불 폼 뒤(약 2,000px 아래)로 밀리던 결함. */}
          <div className="order-first flex flex-col gap-4 lg:order-none lg:col-span-4">
            <Card className="p-4 sm:p-5">
              <CardHead
                title="대여 기간"
                action={canChangePeriod ? <Button size="sm" variant="secondary" onClick={() => setPeriodOpen((v) => !v)}>{periodOpen ? "닫기" : "기간 변경"}</Button> : undefined}
              />
              <dl className="flex flex-col gap-3 text-[13px]">
                <PeriodRow label="대여" value={formatInTz(reservation.periodStart, DEFAULT_TZ, FMT)} />
                <PeriodRow label="반납" value={formatInTz(reservation.periodEnd, DEFAULT_TZ, FMT)} alert={overdue} />
                {reservation.fittingAt && <PeriodRow label="피팅" value={formatInTz(reservation.fittingAt, DEFAULT_TZ, FMT)} />}
              </dl>
              {periodOpen && (
                <PeriodChangeForm
                  businessId={businessId}
                  reservationId={reservation.id}
                  initialStart={toLocalInput(reservation.periodStart)}
                  initialEnd={toLocalInput(reservation.periodEnd)}
                  onDone={() => { setPeriodOpen(false); refresh(); }}
                  onError={setError}
                />
              )}
            </Card>

            <Card className="p-4 sm:p-5">
              <CardHead title="고객·메모" />
              <dl className="flex flex-col gap-3 text-[13px]">
                <div>
                  <dt className="text-[11.5px] text-t3">고객</dt>
                  <dd className="mt-0.5 text-t">
                    {reservation.customerRef ? (
                      <Link href={`/w/${businessId}/customers/${reservation.customerRef}`} className="font-medium text-[var(--accent-ink)] hover:underline">
                        {reservation.customerName ?? "고객 미지정"}
                      </Link>
                    ) : (
                      <span className="font-medium">{reservation.customerName ?? "고객 미지정"}</span>
                    )}
                    {reservation.customerPhone && <span className="ml-2 tabular-nums text-t2">{reservation.customerPhone}</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-t3">메모</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-t">{reservation.notes || <span className="text-t3">없음</span>}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function PeriodRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="flex w-[52px] shrink-0 items-center gap-1 text-[11.5px] text-t3"><CalendarClock size={13} aria-hidden />{label}</dt>
      <dd className={alert ? "font-medium tabular-nums text-et" : "font-medium tabular-nums text-t"}>{value}</dd>
    </div>
  );
}

/**
 * 개체 교환. 같은 SKU의 가용 개체만 후보로 보여준다(서버 sku_mismatch 규칙과 동일 — 다른
 * SKU로 바꾸는 것은 교환이 아니라 항목 변경이라 여기서 다루지 않는다). 사유는 필수다.
 */
function SwapUnitButton({
  businessId,
  itemId,
  skuId,
  currentUnitId,
  currentUnitCode,
  onDone,
}: {
  businessId: string;
  itemId: string;
  skuId: string;
  currentUnitId: string;
  currentUnitCode: string;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [candidates, setCandidates] = React.useState<SwapCandidateRow[] | null>(null);
  const [newUnitId, setNewUnitId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SwapResult | null>(null);
  const key = React.useRef(crypto.randomUUID());

  const openModal = async () => {
    setOpen(true);
    setResult(null);
    setLoading(true);
    setError(null);
    const r = await getSwapCandidatesAction(businessId, skuId, currentUnitId);
    setLoading(false);
    if (!r.ok) { setError(r.message); setCandidates([]); return; }
    setCandidates(r.data);
  };

  const submit = async () => {
    if (!newUnitId) { setError("교환할 개체를 선택하세요."); return; }
    if (!reason.trim()) { setError("교환 사유를 입력하세요."); return; }
    setBusy(true);
    setError(null);
    const r = await swapReservationUnitAction(businessId, itemId, newUnitId, reason, key.current);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    key.current = crypto.randomUUID();
    setResult(r.data);
    onDone();
  };

  const closeAndReset = () => {
    setOpen(false);
    setNewUnitId("");
    setReason("");
    setResult(null);
  };

  return (
    <>
      <Button size="sm" variant="ghost" className="text-[var(--accent-ink)]" onClick={openModal}>
        <Repeat size={13} aria-hidden />개체 교환
      </Button>
      <Modal
        open={open}
        onClose={closeAndReset}
        title={`개체 교환 (현재 ${currentUnitCode})`}
        footer={
          result ? (
            <Button onClick={closeAndReset}>닫기</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeAndReset} disabled={busy}>취소</Button>
              <Button onClick={submit} loading={busy} disabled={loading || !candidates?.length}>{busy ? "교환 중…" : "교환 실행"}</Button>
            </>
          )
        }
      >
        {error && <Alert className="mb-3">{error}</Alert>}
        {result ? (
          <div className="flex flex-col gap-2">
            <Alert kind="success">교환 완료: {result.fromUnitCode} → {result.toUnitCode}</Alert>
            {result.fromStatus === "returning" && (
              <Alert kind="warning">
                이전 개체 {result.fromUnitCode}는 이미 출고됐다가 회수된 상태라 자동으로 정비가 등록되지 않습니다.
                세탁·수선 등록이 필요합니다 —{" "}
                <Link href={`/w/${businessId}/care?unit=${result.fromUnitId}`} className="underline" onClick={closeAndReset}>
                  세탁·수선 화면으로 이동
                </Link>
              </Alert>
            )}
          </div>
        ) : loading ? (
          <p className="py-4 text-center text-[12.5px] text-t3">가용 개체를 불러오는 중…</p>
        ) : candidates && candidates.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-t3">같은 SKU에 교환 가능한 다른 개체가 없습니다.</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <SelectField label="교환할 개체" required value={newUnitId} onChange={(e) => setNewUnitId(e.target.value)}>
              <option value="">선택</option>
              {candidates?.map((c) => (
                <option key={c.unitId} value={c.unitId}>
                  {c.unitCode} ({UNIT_STATUS_LABEL[c.status]})
                </option>
              ))}
            </SelectField>
            <Input
              label="교환 사유"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 오염 발견, 사이즈 불일치, 파손"
              wrapperClassName="mb-0"
            />
          </form>
        )}
      </Modal>
    </>
  );
}

function PeriodChangeForm({
  businessId,
  reservationId,
  initialStart,
  initialEnd,
  onDone,
  onError,
}: {
  businessId: string;
  reservationId: string;
  initialStart: string;
  initialEnd: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [start, setStart] = React.useState(initialStart);
  const [end, setEnd] = React.useState(initialEnd);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    const r = await updateReservationPeriod(businessId, reservationId, new Date(start).toISOString(), new Date(end).toISOString());
    setBusy(false);
    if (!r.ok) { onError(r.message); return; }
    onDone();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-4 flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2/40 p-3">
      <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-t2">
        새 대여 일시
        <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={CONTROL} />
      </label>
      <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-t2">
        새 반납 일시
        <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={CONTROL} />
      </label>
      <Button size="sm" type="submit" loading={busy} className="self-end">{busy ? "저장 중…" : "변경 저장"}</Button>
    </form>
  );
}
