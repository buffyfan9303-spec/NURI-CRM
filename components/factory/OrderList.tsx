"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Printer } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={!status} onClick={() => setParam("status", null)}>전체 상태</FilterChip>
          {(["접수", "진행중", "완료", "취소"] as FactoryOrderStatus[]).map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setParam("status", s)}>{s}</FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--bd)]" />
          <FilterChip active={!type} onClick={() => setParam("type", null)}>전체 종류</FilterChip>
          {(["suit", "shirt", "shoe"] as FactoryOrderType[]).map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setParam("type", t)}>{TYPE_LABEL[t]}</FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--bd)]" />
          <FilterChip active={sort === "due_asc"} onClick={() => setParam("sort", null)}>납기 임박순</FilterChip>
          <FilterChip active={sort === "created_desc"} onClick={() => setParam("sort", "created_desc")}>최근 등록순</FilterChip>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/w/${businessId}/orders/print`}>
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

      <form onSubmit={(e) => { e.preventDefault(); setParam("q", q || null); }} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="고객 이름 / 주문번호 검색…"
          className="h-9 w-full max-w-[280px] rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-[13px] text-t outline-none focus:border-[var(--accent)]"
        />
        <Button type="submit" size="sm" variant="secondary">검색</Button>
      </form>

      {orders.length === 0 ? (
        <EmptyState title="조건에 맞는 주문이 없습니다." description="필터를 초기화하거나 새 주문을 등록하세요." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--bd)]">
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
                const dday = ddayInfo(o.dueDate, todayKey);
                return (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/w/${businessId}/orders/${o.id}`)}
                    className="cursor-pointer border-b border-[var(--bd)] last:border-b-0 hover:bg-sf2"
                  >
                    <td className="px-3 py-2.5 font-medium text-t">{o.orderNo}</td>
                    <td className="px-3 py-2.5 text-t2">{o.customerName ?? "-"}</td>
                    <td className="px-3 py-2.5 text-t2">{TYPE_LABEL[o.type]}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-bold", STATUS_CLASS[o.status])}>
                        {o.status}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5", DDAY_CLASS[dday.kind])}>
                      {o.dueDate ? `${o.dueDate} (${dday.label})` : "-"}
                    </td>
                    {canReadRevenue && <td className="px-3 py-2.5 text-t2">{formatKRW(o.total)}</td>}
                    <td className="px-3 py-2.5 text-t3">{o.orderDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[6px] border px-2.5 py-1 text-[11.5px] font-medium",
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] text-t2 hover:bg-sf2"
      )}
    >
      {children}
    </button>
  );
}
