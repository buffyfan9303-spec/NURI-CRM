"use client";
import { useState } from "react";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SearchInput } from "@/components/common/SearchInput";
import { ActionButton } from "@/components/common/ActionButton";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";
import { useAuthStore } from "@/lib/stores/authStore";
import { displayName, displayPhone } from "@/lib/utils/mask";

export default function CustomersPage() {
  const customers = useCustomerStore((s) => s.customers);
  const openDetail = useCustomerDetailStore((s) => s.open);
  const role = useAuthStore((s) => s.user.role);
  const [q, setQ] = useState("");

  const filtered = q
    ? customers.filter((c) => c.name.includes(q) || c.phone.includes(q))
    : customers;

  return (
    <>
      <Topbar title="고객 조회">
        <SearchInput value={q} onChange={setQ} placeholder="이름 또는 전화번호 검색…" />
        <Link href="/customers/new">
          <ActionButton>
            <IconPlus size={14} />
            신규 등록
          </ActionButton>
        </Link>
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <div className="bg-sf border border-bd rounded-xl overflow-x-auto shadow-card scrollable">
          <table className="w-full border-collapse table-fixed min-w-[680px]">
            <thead>
              <tr>
                <Th width="14%">이름</Th>
                <Th width="16%">생년월일</Th>
                <Th width="20%">전화번호</Th>
                <Th width="34%">최근 주문</Th>
                <Th width="16%">등록일</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-t3 py-10 text-xs">
                    검색 결과가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const last = c.orders.length ? c.orders[c.orders.length - 1] : null;
                  return (
                    <tr
                      key={c.name}
                      onClick={() => openDetail(c.name)}
                      className="cursor-pointer transition-colors hover:bg-sf2"
                    >
                      <Td><span className="font-bold">{displayName(c.name, role)}</span></Td>
                      <Td>{c.birth}</Td>
                      <Td>{displayPhone(c.phone, role)}</Td>
                      <Td>
                        {last ? (
                          <>
                            <OrderStatusBadge status={last.st} />{" "}
                            <span className="text-xs text-t2">{last.item}</span>
                          </>
                        ) : (
                          <span className="text-[11px] text-t3 italic">주문 없음</span>
                        )}
                      </Td>
                      <Td>{c.reg}</Td>
                    </tr>
                  );
                })
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
  return (
    <td className="py-3 px-4 text-[13px] border-b border-bd text-t last:border-b-0">{children}</td>
  );
}
