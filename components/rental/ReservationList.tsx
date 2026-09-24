"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, X } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_BADGE as STATUS_BADGE,
  type ReservationRow,
  type ReservationStatus,
} from "@/lib/domain/rental-types";
import { StatusTab, Pager, usePager, FilterRow, SearchBox, TextAction, TABLE, THEAD, TH, TR_CLICK, TD } from "./listkit";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";

const ALL_STATUS: ReservationStatus[] = ["draft", "confirmed", "out", "partial_return", "returned", "closed", "cancelled"];

const PAGE_SIZE = 20;

/** 예약번호 대체 표시 — 별도 채번 컬럼이 없어 id를 사람이 부를 수 있는 짧은 형태로 보여준다. */
function reservationNo(id: string): string {
  return `R-${id.slice(0, 8).toUpperCase()}`;
}

/** 상태에서 다음에 일어날 일을 한 줄로 요약한다(§5.7 "다음 일정"). */
function nextEvent(r: ReservationRow): string {
  const now = Date.now();
  if ((r.status === "draft" || r.status === "confirmed") && r.fittingAt && new Date(r.fittingAt).getTime() > now) {
    return `피팅 ${formatInTz(r.fittingAt, DEFAULT_TZ, "M. d. HH:mm")}`;
  }
  if (r.status === "draft" || r.status === "confirmed") {
    return `출고 예정 ${formatInTz(r.periodStart, DEFAULT_TZ, "M. d.")}`;
  }
  if (r.status === "out" || r.status === "partial_return") {
    const overdue = new Date(r.periodEnd).getTime() < now;
    return `${overdue ? "반납 지연" : "반납 예정"} ${formatInTz(r.periodEnd, DEFAULT_TZ, "M. d.")}`;
  }
  return "-";
}

export function ReservationList({
  businessId,
  reservations,
  canWrite,
  canRevenue,
}: {
  businessId: string;
  reservations: ReservationRow[];
  canWrite: boolean;
  canRevenue: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");
  const [status, setStatus] = React.useState<ReservationStatus | "all">("all");

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  };

  const quick = searchParams.get("quick");
  const searchActive = !!searchParams.get("q");

  const counts = React.useMemo(() => {
    const m = new Map<ReservationStatus, number>();
    for (const r of reservations) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [reservations]);

  const filtered = React.useMemo(
    () => (status === "all" ? reservations : reservations.filter((r) => r.status === status)),
    [reservations, status]
  );

  const { page, setPage, totalPages, pageRows } = usePager(filtered, PAGE_SIZE);
  React.useEffect(() => setPage(1), [status, reservations, setPage]);

  const filtersActive = searchActive || !!quick || status !== "all";
  // 표와 카드가 같은 값·같은 동작을 쓰도록 한 곳에서 계산한다.
  const open = (r: ReservationRow) => router.push(`/w/${businessId}/reservations/${r.id}`);
  const rowView = (r: ReservationRow) => {
    const amount = r.items.reduce((sum, i) => sum + i.fee - i.discount, 0);
    const assignedUnits = r.items.filter((i) => i.unitCode).length;
    const overdue = (r.status === "out" || r.status === "partial_return") && new Date(r.periodEnd).getTime() < Date.now();
    return {
      customer: r.customerName ?? "-",
      period: `${formatInTz(r.periodStart, DEFAULT_TZ, "yyyy.MM.dd")} ~ ${formatInTz(r.periodEnd, DEFAULT_TZ, "yyyy.MM.dd")}`,
      products: r.items.map((i) => i.productName).filter(Boolean).join(", ") || "-",
      itemsSummary: `${r.items.length}품목 · 개체 ${assignedUnits}/${r.items.length} 배정`,
      badge: <Badge kind={STATUS_BADGE[r.status]}>{RESERVATION_STATUS_LABEL[r.status]}</Badge>,
      next: nextEvent(r),
      nextClass: overdue ? "font-medium text-et" : "text-t2",
      amount: formatKRW(amount),
    };
  };
  const clearFilters = () => {
    setStatus("all");
    setQ("");
    router.push(pathname);
  };

  const newButton = canWrite ? (
    <Link href={`/w/${businessId}/reservations/new`}>
      <Button className="w-full">
        <Plus size={15} aria-hidden />새 예약
      </Button>
    </Link>
  ) : (
    <Button disabled title="예약 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요.">
      <Plus size={15} aria-hidden />새 예약
    </Button>
  );

  return (
    <>
      <PageHeader
        title="예약"
        description="대여 기간·개체 배정·출고/반납 상태를 한 곳에서 확인합니다. 행을 누르면 상세로 이동합니다."
        meta={<span className="rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">{reservations.length}건</span>}
        actions={newButton}
      >
        <div className="flex flex-col gap-2">
          <FilterRow>
            <StatusTab active={status === "all"} onClick={() => setStatus("all")} count={reservations.length}>
              전체
            </StatusTab>
            {ALL_STATUS.map((s) => (
              <StatusTab key={s} active={status === s} onClick={() => setStatus(s)} count={counts.get(s) ?? 0}>
                {RESERVATION_STATUS_LABEL[s]}
              </StatusTab>
            ))}
          </FilterRow>
          <FilterRow className="sm:gap-2">
            <StatusTab active={!quick} onClick={() => setParam("quick", null)}>전체 기간</StatusTab>
            <StatusTab active={quick === "today"} onClick={() => setParam("quick", "today")}>오늘</StatusTab>
            <StatusTab active={quick === "week"} onClick={() => setParam("quick", "week")}>이번 주</StatusTab>
            <span className="mx-1 hidden h-4 w-px bg-[var(--bd)] sm:block" aria-hidden />
            <SearchBox value={q} onChange={setQ} placeholder="고객 이름/전화번호 검색" onSubmit={() => setParam("q", q || null)} className="min-w-[200px]" />
            {filtersActive && (
              <TextAction onClick={clearFilters}>
                <X size={13} aria-hidden />
                필터 초기화
              </TextAction>
            )}
          </FilterRow>
        </div>
      </PageHeader>

      {/* "등록된 예약이 없습니다"(진짜 빈 데이터)와 "검색/필터 결과가 없습니다"를 구분한다.
          예약은 검색어(q)·기간(quick)이 서버 조회 자체를 걸러내므로, 그 결과 reservations가
          0건이어도 filtersActive면 빈 데이터가 아니라 검색·필터 결과 없음으로 취급해야 한다. */}
      {reservations.length === 0 && !filtersActive ? (
        <Card>
          <EmptyState
            title="등록된 예약이 없습니다."
            description="새 예약 버튼으로 첫 예약을 만드세요."
            action={canWrite && (
              <Link href={`/w/${businessId}/reservations/new`}>
                <Button size="sm"><Plus size={14} aria-hidden />새 예약</Button>
              </Link>
            )}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={searchActive ? "검색 결과가 없습니다." : "조건에 맞는 예약이 없습니다."}
            description="검색어나 상태·기간 필터를 조정해 보세요."
            action={<TextAction onClick={clearFilters}>필터 초기화</TextAction>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <TableOrCards
            rows={pageRows}
            keyOf={(r) => r.id}
            table={
              <Card className="overflow-x-auto">
                <table className={`${TABLE} min-w-[1040px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>예약번호</th>
                      <th className={TH}>고객</th>
                      <th className={TH}>대여기간</th>
                      <th className={TH}>상품/개체</th>
                      <th className={TH}>상태</th>
                      <th className={TH}>다음 일정</th>
                      {canRevenue && <th className={`${TH} text-right`}>금액</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const v = rowView(r);
                      return (
                        <tr key={r.id} onClick={() => open(r)} className={`${TR_CLICK} h-[56px]`}>
                          <td className={`${TD} font-mono text-[11.5px] text-t3`}>{reservationNo(r.id)}</td>
                          <td className={TD}>
                            <CellName max={160}>{v.customer}</CellName>
                            <div className="text-[11.5px] text-t3">{r.customerPhone ?? ""}</div>
                          </td>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.period}</td>
                          <td className={`${TD} text-t2`}>
                            <span className="block max-w-[280px] truncate text-t" title={v.products}>{v.products}</span>
                            <div className="text-[11.5px] text-t3">{v.itemsSummary}</div>
                          </td>
                          <td className={TD}>{v.badge}</td>
                          <td className={`${TD} whitespace-nowrap ${v.nextClass}`}>{v.next}</td>
                          {canRevenue && <td className={`${TD} whitespace-nowrap text-right tabular-nums font-medium text-t`}>{v.amount}</td>}
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
                  sub={<><span className="font-mono">{reservationNo(r.id)}</span>{r.customerPhone && <span>· {r.customerPhone}</span>}</>}
                  badge={v.badge}
                  onClick={() => open(r)}
                  fields={[
                    ["대여기간", v.period],
                    ["상품", v.products],
                    ["개체", v.itemsSummary],
                    ["다음 일정", <span key="n" className={v.nextClass}>{v.next}</span>],
                    ...(canRevenue ? ([["금액", v.amount]] as [string, React.ReactNode][]) : []),
                  ]}
                />
              );
            }}
          />
          <Pager page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}
    </>
  );
}
