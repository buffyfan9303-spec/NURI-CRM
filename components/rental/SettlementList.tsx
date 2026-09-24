"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { formatKRW } from "@/lib/domain/money";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { RESERVATION_STATUS_LABEL, PAYMENT_STATUS_LABEL, type ReservationRow, type ReservationBalance } from "@/lib/domain/rental-types";
import { SettlementPanel } from "./SettlementPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pager, usePager, FilterRow, SearchBox, TextAction, Alert, TABLE, THEAD, TH, TR_CLICK, TD } from "./listkit";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { exportRentalSettlementCsv } from "@/lib/domain/export-actions";

const PAGE_SIZE = 20;

export function SettlementList({
  businessId,
  reservations,
  balances,
  canWrite,
  canRefund,
  canExport,
}: {
  businessId: string;
  reservations: ReservationRow[];
  balances: (ReservationBalance | { masked: true } | null)[];
  /** CLICK-PATH-218: write 없이는 SettlementPanel의 수납·연체료·환불 폼을 숨긴다. */
  canWrite: boolean;
  canRefund: boolean;
  /** CLICK-PATH-222: export cap을 서버가 강제하는 CSV만 쓴다(브라우저에서 직접 만들지 않는다). */
  canExport: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const needle = q.trim();
  const paired = React.useMemo(() => reservations.map((r, i) => ({ r, bal: balances[i] })), [reservations, balances]);
  const filtered = needle
    ? paired.filter(({ r }) => (r.customerName ?? "").includes(needle) || (r.customerPhone ?? "").includes(needle))
    : paired;

  const { page, setPage, totalPages, pageRows } = usePager(filtered, PAGE_SIZE);
  React.useEffect(() => setPage(1), [needle, setPage]);

  // 상단 요약 — 목록에 이미 내려온 잔액만 더한다(새 조회 없음). 보증금은 매출과 섞지 않는다(계약 §3).
  const totals = React.useMemo(() => {
    let outstanding = 0, deposit = 0, outstandingCount = 0;
    for (const b of balances) {
      if (!b || "masked" in b) continue;
      outstanding += b.outstanding;
      deposit += b.depositBalance;
      if (b.outstanding > 0) outstandingCount += 1;
    }
    return { outstanding, deposit, outstandingCount };
  }, [balances]);

  // 표와 카드가 같은 값·같은 동작(행 펼치기)을 쓰도록 한 곳에서 계산한다.
  const toggle = (id: string) => setOpenId(openId === id ? null : id);
  const rowView = (r: ReservationRow, bal: ReservationBalance | { masked: true } | null) => {
    const flat = bal && !("masked" in bal) ? bal : null;
    return {
      open: openId === r.id,
      href: `/w/${businessId}/reservations/${r.id}`,
      customer: r.customerName ?? "-",
      period: `${formatInTz(r.periodStart, DEFAULT_TZ, "yyyy.MM.dd")} ~ ${formatInTz(r.periodEnd, DEFAULT_TZ, "yyyy.MM.dd")}`,
      status: RESERVATION_STATUS_LABEL[r.status],
      payment: flat ? PAYMENT_STATUS_LABEL[flat.paymentStatus] : "-",
      revenue: flat ? formatKRW(flat.rentalRevenue) : "-",
      lateFee: flat ? formatKRW(flat.lateFee) : "-",
      deposit: flat ? formatKRW(flat.depositBalance) : "-",
      cash: flat ? formatKRW(flat.cashReceived) : "-",
      outstanding: flat ? formatKRW(flat.outstanding) : "-",
      outstandingClass: flat && flat.outstanding > 0 ? "text-et" : "text-t2",
    };
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    const r = await exportRentalSettlementCsv(businessId);
    setExporting(false);
    if (!r.ok) { setExportError(r.message); return; }
    const blob = new Blob(["﻿" + r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="정산"
        description="확정·출고·반납된 예약의 대여매출·연체료·보증금·수납을 항목별로 분리해 보여줍니다. 행을 펼치면 수납·환불을 처리합니다."
        meta={<span className="rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">{reservations.length}건</span>}
        actions={
          canExport ? (
            <Button variant="secondary" onClick={exportCsv} loading={exporting}>
              <Download size={15} aria-hidden />
              {exporting ? "내보내는 중…" : "CSV 내보내기"}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryTile label="미수금 합계" value={formatKRW(totals.outstanding)} tone={totals.outstanding > 0 ? "alert" : "neutral"} sub={`${totals.outstandingCount}건 미수`} />
            <SummaryTile label="보증금 보유 잔액" value={formatKRW(totals.deposit)} sub="대여매출과 별도 관리" />
            <SummaryTile label="정산 대상" value={`${reservations.length}건`} sub="확정~종결 예약" className="col-span-2 sm:col-span-1" />
          </div>
          <FilterRow>
            <SearchBox value={q} onChange={setQ} placeholder="고객 이름/전화번호 검색" />
            {needle && <TextAction onClick={() => setQ("")}>검색 지우기</TextAction>}
          </FilterRow>
          {exportError && <Alert>{exportError}</Alert>}
        </div>
      </PageHeader>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="검색 결과가 없습니다."
            description="다른 이름이나 전화번호로 검색해 보세요."
            action={<TextAction onClick={() => setQ("")}>검색 지우기</TextAction>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <TableOrCards
            rows={pageRows}
            keyOf={({ r }) => r.id}
            table={
              <Card className="overflow-x-auto">
                <table className={`${TABLE} min-w-[1040px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className="w-9 px-2 py-2.5"><span className="sr-only">펼치기</span></th>
                      <th className={TH}>고객</th>
                      <th className={TH}>기간</th>
                      <th className={TH}>상태</th>
                      <th className={TH}>결제상태</th>
                      <th className={`${TH} text-right`}>대여매출</th>
                      <th className={`${TH} text-right`}>연체료</th>
                      <th className={`${TH} text-right`}>보증금 잔액</th>
                      <th className={`${TH} text-right`}>현금수납</th>
                      <th className={`${TH} text-right`}>미수금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(({ r, bal }) => {
                      const v = rowView(r, bal);
                      return (
                        <React.Fragment key={r.id}>
                          <tr className={`${TR_CLICK} h-[52px]`} onClick={() => toggle(r.id)} aria-expanded={v.open}>
                            <td className="px-2 py-2.5 text-t3">{v.open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}</td>
                            <td className={TD}>
                              <Link href={v.href} className="block max-w-[160px] truncate font-medium text-t hover:underline" title={v.customer} onClick={(e) => e.stopPropagation()}>
                                {v.customer}
                              </Link>
                            </td>
                            <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.period}</td>
                            <td className={`${TD} text-t2`}>{v.status}</td>
                            <td className={`${TD} text-t2`}>{v.payment}</td>
                            <td className={`${TD} text-right tabular-nums text-t2`}>{v.revenue}</td>
                            <td className={`${TD} text-right tabular-nums text-t2`}>{v.lateFee}</td>
                            <td className={`${TD} text-right tabular-nums text-t2`}>{v.deposit}</td>
                            <td className={`${TD} text-right tabular-nums text-t2`}>{v.cash}</td>
                            <td className={cn(TD, "text-right tabular-nums font-semibold", v.outstandingClass)}>{v.outstanding}</td>
                          </tr>
                          {v.open && (
                            <tr className="border-b border-[var(--bd)] bg-sf2/40 last:border-b-0">
                              <td colSpan={10} className="px-5 py-4">
                                <SettlementPanel businessId={businessId} reservationId={r.id} balance={bal} canWrite={canWrite} canRefund={canRefund} onChanged={() => router.refresh()} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            }
            card={({ r, bal }) => {
              const v = rowView(r, bal);
              return (
                <MobileCard
                  title={v.customer}
                  sub={<span className="tabular-nums">{v.period}</span>}
                  badge={<span className={cn("text-[12.5px] font-semibold tabular-nums", v.outstandingClass)}>미수 {v.outstanding}</span>}
                  onClick={() => toggle(r.id)}
                  fields={[
                    ["상태", `${v.status} · ${v.payment}`],
                    ["대여매출", v.revenue],
                    ["연체료", v.lateFee],
                    ["보증금 잔액", v.deposit],
                    ["현금수납", v.cash],
                  ]}
                  actions={
                    <>
                      <Link href={v.href} className="rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2">예약 상세</Link>
                      <Button size="sm" variant="secondary" onClick={() => toggle(r.id)}>{v.open ? "접기" : "정산 처리"}</Button>
                    </>
                  }
                >
                  {v.open && <SettlementPanel businessId={businessId} reservationId={r.id} balance={bal} canWrite={canWrite} canRefund={canRefund} onChanged={() => router.refresh()} />}
                </MobileCard>
              );
            }}
          />
          <Pager page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}
    </>
  );
}

function SummaryTile({ label, value, sub, tone = "neutral", className }: { label: string; value: string; sub?: string; tone?: "neutral" | "alert"; className?: string }) {
  return (
    <div className={cn("rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf px-4 py-3 shadow-card", className)}>
      <p className="text-[12px] text-t2">{label}</p>
      <p className={cn("mt-1 text-[22px] font-bold leading-none tabular-nums", tone === "alert" ? "text-et" : "text-t")}>{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] text-t3">{sub}</p>}
    </div>
  );
}
