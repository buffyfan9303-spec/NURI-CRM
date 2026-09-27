"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Printer } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { cn } from "@/lib/utils/cn";
import { formatKRW } from "@/lib/domain/money";
import type { FactoryOrderRow, FactoryOrderStatus, FactoryOrderType } from "@/lib/domain/factory";
import { ddayInfo } from "./dday";

const STATUS_CLASS: Record<FactoryOrderStatus, string> = {
  접수: "bg-sf3 text-t3",
  진행중: "bg-ib text-it",
  완료: "bg-okb text-okt",
  취소: "bg-eb text-et",
};

const TYPE_LABEL: Record<FactoryOrderType, string> = { suit: "정장", shirt: "셔츠", shoe: "구두" };

const DDAY_CLASS: Record<string, string> = {
  over: "text-et font-bold",
  today: "text-et font-bold",
  soon: "text-wt font-bold",
  ok: "text-t2",
  none: "text-t3",
};

export function OrderList({
  businessId,
  orders,
  canWrite,
  canReadRevenue,
  todayKey,
}: {
  businessId: string;
  orders: FactoryOrderRow[];
  canWrite: boolean;
  /** 결함 CLICK-PATH-106: 금액열도 revenue.read 게이팅(다른 업종 목록과 같은 계약). */
  canReadRevenue: boolean;
  todayKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") ?? "");

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    router.push(`${pathname}?${sp.toString()}`);
  };

  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const sort = searchParams.get("sort") ?? "due_asc";

  // 휴대폰 카드: 완료·취소는 D-day 를 계산하지 않는다(F13 과 같은 규칙).
  const dueCell = (o: FactoryOrderRow) => {
    const closed = o.status === "완료" || o.status === "취소";
    const dday = closed ? null : ddayInfo(o.dueDate, todayKey);
    return { closed, dday, text: o.dueDate ? (dday ? `${o.dueDate} (${dday.label})` : o.dueDate) : "-", cls: dday ? DDAY_CLASS[dday.kind] : "text-t3" };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 휴대폰(<sm)은 칩 11개가 3줄로 쌓이지 않게 한 줄 가로 스크롤(listkit FilterRow 와 같은 규칙). */}
        <div className="scrollable flex items-center gap-1.5 max-sm:-mx-4 max-sm:w-[calc(100%+32px)] max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-1 sm:flex-wrap">
          <FilterChip active={!status} onClick={() => setParam("status", null)}>전체 상태</FilterChip>
          {(["접수", "진행중", "완료", "취소"] as FactoryOrderStatus[]).map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setParam("status", s)}>{s}</FilterChip>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-[var(--bd)]" />
          <FilterChip active={!type} onClick={() => setParam("type", null)}>전체 종류</FilterChip>
          {(["suit", "shirt", "shoe"] as FactoryOrderType[]).map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setParam("type", t)}>{TYPE_LABEL[t]}</FilterChip>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-[var(--bd)]" />
          <FilterChip active={sort === "due_asc"} onClick={() => setParam("sort", null)}>납기 임박순</FilterChip>
          <FilterChip active={sort === "created_desc"} onClick={() => setParam("sort", "created_desc")}>최근 등록순</FilterChip>
        </div>
        <div className="flex items-center gap-2">
          {/* 일괄 인쇄는 PC 작업 — 휴대폰(<sm)에서는 숨긴다. */}
          <Link href={`/w/${businessId}/orders/print`} className="max-sm:hidden">
            <Button size="sm" variant="secondary">
              <Printer size={14} />
              작지 일괄 인쇄
            </Button>
          </Link>
          {canWrite && (
            <Link href={`/w/${businessId}/orders/new`}>
              <Button size="sm">
                <Plus size={14} />
                새 주문
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* 휴대폰(<sm)은 검색칸을 칩 줄 위 전폭으로(C2 규칙). 검색칸·버튼 높이는 같게(40 / 터치 44). */}
      <form onSubmit={(e) => { e.preventDefault(); setParam("q", q || null); }} className="flex gap-2 max-sm:order-first">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="고객 이름 / 주문번호 검색…"
          aria-label="고객 이름 또는 주문번호 검색"
          className="h-[40px] w-full max-w-[280px] rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-[16px] text-t outline-none focus:border-[var(--accent)] max-sm:max-w-none sm:text-[13px] [@media(pointer:coarse)]:h-[44px]"
        />
        <Button type="submit" size="sm" variant="secondary" className="h-[40px] [@media(pointer:coarse)]:h-[44px]">검색</Button>
      </form>

      {orders.length === 0 ? (
        <EmptyState title="조건에 맞는 주문이 없습니다." description="필터를 초기화하거나 새 주문을 등록하세요." />
      ) : (
        <TableOrCards
          rows={orders}
          keyOf={(o) => o.id}
          card={(o) => {
            const due = dueCell(o);
            return (
              <MobileCard
                title={o.orderNo}
                sub={<>{o.customerName ?? "고객 미지정"} · {TYPE_LABEL[o.type]}</>}
                badge={<span className={cn("rounded-[6px] px-2 py-0.5 text-[12px] font-bold", STATUS_CLASS[o.status])}>{o.status}</span>}
                onClick={() => router.push(`/w/${businessId}/orders/${o.id}`)}
                fields={[
                  ["납기", <span key="due" className={cn("font-medium", due.cls)}>{due.text}</span>],
                  ...(canReadRevenue ? ([["금액", formatKRW(o.total)]] as [string, React.ReactNode][]) : []),
                ]}
              />
            );
          }}
          table={
        // F14: 가로 스크롤 영역은 키보드로도 스크롤할 수 있어야 한다(tabIndex + region 이름).
        <div
          className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--bd)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          tabIndex={0}
          role="region"
          aria-label="주문 목록 표(가로 스크롤)"
        >
          <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--bd)] bg-sf2 text-left text-t2">
                <th className="px-3 py-2 font-medium">주문번호</th>
                <th className="px-3 py-2 font-medium">고객</th>
                <th className="px-3 py-2 font-medium">종류</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">납기</th>
                {canReadRevenue && <th className="px-3 py-2 font-medium">금액</th>}
                <th className="px-3 py-2 font-medium">등록일</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                // F13: 완료·취소 주문은 납기가 지나도 "초과"가 아니다 — 날짜만 보여 준다.
                const due = dueCell(o);
                return (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/w/${businessId}/orders/${o.id}`)}
                    className="cursor-pointer border-b border-[var(--bd)] last:border-b-0 hover:bg-sf2"
                  >
                    <td className="px-3 py-2.5 font-medium text-t">
                      {/* F14: 행 onClick 은 마우스 전용이라 키보드 사용자는 상세로 못 갔다 — 주문번호를 실제 링크로. */}
                      <Link
                        href={`/w/${businessId}/orders/${o.id}`}
                        prefetch={false}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex min-h-[24px] items-center rounded-[4px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      >
                        {o.orderNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-t2">{o.customerName ?? "-"}</td>
                    <td className="px-3 py-2.5 text-t2">{TYPE_LABEL[o.type]}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-[6px] px-2 py-0.5 text-[12px] font-bold", STATUS_CLASS[o.status])}>
                        {o.status}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5", due.cls)}>{due.text}</td>
                    {canReadRevenue && <td className="px-3 py-2.5 text-t2">{formatKRW(o.total)}</td>}
                    <td className="px-3 py-2.5 text-t3">{o.orderDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          }
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // F19: 26px 칩은 터치 화면·휴대폰 폭에서 44px 로 승격한다(PC 는 32px 유지). shrink-0: 가로 스크롤 줄에서 안 찌그러지게.
        "shrink-0 whitespace-nowrap min-h-[32px] rounded-[6px] border px-2.5 py-1 text-[12px] font-medium max-sm:min-h-[44px] max-sm:px-3 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-3",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] text-t2 hover:bg-sf2"
      )}
    >
      {children}
    </button>
  );
}
