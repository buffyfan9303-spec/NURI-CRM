"use client";

import { useMemo, useState } from "react";
import { IconTruckOff } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SearchInput } from "@/components/common/SearchInput";
import { DeliveryStats } from "@/components/delivery/DeliveryStats";
import { DeliveryFilterChips } from "@/components/delivery/DeliveryFilterChips";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { DDayChip } from "@/components/order/DDayChip";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore, type DeliveryFilter } from "@/lib/stores/uiStore";
import { ddayFromToday } from "@/lib/utils/dday";
import { displayName } from "@/lib/utils/mask";
import { cn } from "@/lib/utils/cn";

const PLANNED_STATES = ["배송예정", "검수중", "봉제중", "생산중", "재단중"] as const;

export default function DeliveryPage() {
  const flatten = useCustomerStore((s) => s.flattenOrders);
  const role = useAuthStore((s) => s.user.role);
  const filter = useUIStore((s) => s.deliveryFilter);
  const setFilter = useUIStore((s) => s.setDeliveryFilter);
  const openDetail = useCustomerDetailStore((s) => s.open);
  const [q, setQ] = useState("");

  const rows = flatten();

  /* Stats by filter */
  const counts = useMemo(() => {
    const c = { all: rows.length, planned: 0, today: 0, overdue: 0, done: 0 };
    for (const r of rows) {
      if (r.order.st === "배송완료") c.done++;
      else {
        const d = ddayFromToday(r.order.del);
        if ((PLANNED_STATES as readonly string[]).includes(r.order.st)) c.planned++;
        if (d === 0) c.today++;
        if (d !== null && d < 0) c.overdue++;
      }
    }
    return c;
  }, [rows]);

  const filteredAndSearched = useMemo(() => {
    let list = rows;
    if (filter === "planned") list = list.filter((r) => (PLANNED_STATES as readonly string[]).includes(r.order.st));
    else if (filter === "today") list = list.filter((r) => r.order.st !== "배송완료" && ddayFromToday(r.order.del) === 0);
    else if (filter === "overdue") list = list.filter((r) => {
      if (r.order.st === "배송완료") return false;
      const d = ddayFromToday(r.order.del);
      return d !== null && d < 0;
    });
    else if (filter === "done") list = list.filter((r) => r.order.st === "배송완료");

    if (q) {
      const qq = q.toLowerCase();
      list = list.filter((r) => r.customer.name.includes(q) || r.order.no.toLowerCase().includes(qq));
    }

    return list.slice().sort((a, b) => {
      const aDone = a.order.st === "배송완료";
      const bDone = b.order.st === "배송완료";
      if (aDone && !bDone) return 1;
      if (!aDone && bDone) return -1;
      const da = ddayFromToday(a.order.del);
      const db = ddayFromToday(b.order.del);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return aDone ? db - da : da - db;
    });
  }, [rows, filter, q]);

  const rowCls = (st: string, del: string) => {
    if (st === "배송완료") return "";
    const d = ddayFromToday(del);
    if (d === null) return "";
    if (d < 0) return "!bg-eb/40";
    if (d === 0) return "!bg-wb/40";
    return "";
  };

  const chips: { key: DeliveryFilter; label: string; count: number }[] = [
    { key: "all",      label: "전체",      count: counts.all },
    { key: "planned",  label: "배송예정",  count: counts.planned },
    { key: "today",    label: "오늘",      count: counts.today },
    { key: "overdue",  label: "납기초과",  count: counts.overdue },
    { key: "done",     label: "완료",      count: counts.done },
  ];

  return (
    <>
      <Topbar title="배송 관리">
        <SearchInput value={q} onChange={setQ} placeholder="고객명·주문번호 검색…" />
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <DeliveryStats />

        <div className="bg-sf border border-bd rounded-xl py-3 md:py-[18px] px-4 md:px-[22px] mb-3.5 shadow-card">
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            <DeliveryFilterChips current={filter} chips={chips} onSelect={setFilter} />
            <div className="text-[11px] text-t3 whitespace-nowrap">기준일: <span className="font-bold">2026.05.15</span></div>
          </div>
        </div>

        <div className="bg-sf border border-bd rounded-xl overflow-x-auto shadow-card scrollable">
          <table className="w-full border-collapse table-fixed min-w-[860px]">
            <thead>
              <tr>
                <Th width="13%">주문번호</Th>
                <Th width="13%">고객</Th>
                <Th width="24%">품목</Th>
                <Th width="14%">제작공장</Th>
                <Th width="12%">배송예정일</Th>
                <Th width="12%">D-Day</Th>
                <Th width="12%">상태</Th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSearched.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-t3 py-10 text-xs">
                    <IconTruckOff size={30} className="mx-auto opacity-30 mb-1.5" />
                    해당 조건의 배송 건이 없습니다
                  </td>
                </tr>
              ) : (
                filteredAndSearched.map((r) => (
                  <tr
                    key={r.order.no}
                    onClick={() => openDetail(r.customer.name)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-sf2",
                      rowCls(r.order.st, r.order.del)
                    )}
                  >
                    <Td><span className="font-bold text-xs">{r.order.no}</span></Td>
                    <Td>{displayName(r.customer.name, role)}</Td>
                    <Td><span className="text-t2">{r.order.item}</span></Td>
                    <Td>{r.order.fac || "—"}</Td>
                    <Td>{r.order.del || "—"}</Td>
                    <Td><DDayChip order={r.order} /></Td>
                    <Td><OrderStatusBadge status={r.order.st} /></Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageContent>
    </>
  );
}

function Th({ children, width }: { children: React.ReactNode; width: string }) {
  return (
    <th style={{ width }} className="py-3 px-4 text-[10px] font-bold text-t2 text-left bg-sf2 border-b border-bd uppercase tracking-[.8px]">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-3 px-4 text-[13px] border-b border-bd text-t last:border-b-0">{children}</td>;
}
