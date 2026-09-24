"use client";

import { IconListDetails } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AccountingMetrics } from "@/components/accounting/AccountingMetrics";
import { MonthlyChart } from "@/components/accounting/MonthlyChart";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { displayName } from "@/lib/utils/mask";
import { parseOrdDate } from "@/lib/utils/dday";

export default function AccountingPage() {
  const flatten = useCustomerStore((s) => s.flattenOrders);
  const openDetail = useCustomerDetailStore((s) => s.open);
  const role = useAuthStore((s) => s.user.role);

  const rows = flatten();
  const recent = rows
    .slice()
    .sort((a, b) => {
      const da = parseOrdDate(a.order.ord)?.getTime() ?? 0;
      const db = parseOrdDate(b.order.ord)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, 10);

  return (
    <>
      <Topbar title="회계 관리">
        <span className="text-[11px] text-t3 ml-auto mr-2.5">2026 회계연도</span>
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <AccountingMetrics />
        <MonthlyChart />

        <div className="bg-sf border border-bd rounded-xl py-5 md:py-6 px-4 md:px-[26px] shadow-card">
          <div className="text-sm font-extrabold text-t mb-[18px] pb-3.5 border-b border-bd flex items-center gap-2.5 tracking-tight">
            <IconListDetails size={17} className="text-acc" />
            최근 거래 내역
          </div>
          <div className="bg-sf border border-bd rounded-lg overflow-x-auto scrollable">
            <table className="w-full border-collapse table-fixed min-w-[680px]">
              <thead>
                <tr>
                  <Th width="13%">주문번호</Th>
                  <Th width="14%">고객</Th>
                  <Th width="30%">품목</Th>
                  <Th width="14%">주문일</Th>
                  <Th width="15%">금액</Th>
                  <Th width="14%">상태</Th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-t3 py-8">
                      거래 내역이 없습니다
                    </td>
                  </tr>
                ) : (
                  recent.map((r) => (
                    <tr
                      key={r.order.no}
                      onClick={() => openDetail(r.customer.name)}
                      className="cursor-pointer transition-colors hover:bg-sf2"
                    >
                      <Td><span className="font-bold text-xs">{r.order.no}</span></Td>
                      <Td>{displayName(r.customer.name, role)}</Td>
                      <Td><span className="text-t2">{r.order.item}</span></Td>
                      <Td>{r.order.ord || "—"}</Td>
                      <Td><span className="font-bold text-gold">₩{r.order.price || "0"}</span></Td>
                      <Td><OrderStatusBadge status={r.order.st} /></Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
