"use client";

import { IconClipboardList, IconStack, IconBuilding } from "@tabler/icons-react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { useBusinessStore } from "@/lib/stores/businessStore";
import { StatCard } from "@/components/common/StatCard";

export function AdminStats() {
  const flatten = useCustomerStore((s) => s.flattenOrders);
  const fabrics = useFabricStore((s) => s.fabrics);
  const businesses = useBusinessStore((s) => s.businesses);

  const allOrders = flatten();
  const unhandled = allOrders.filter(
    (r) => r.order.st === "주문접수" || r.order.st === "원단대기"
  ).length;
  const stockWarn = fabrics.filter((f) => f.status === "부족" || f.status === "매진").length;
  const unapproved = businesses.filter((b) => !b.approved).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-[18px]">
      <StatCard variant="c4" Icon={IconClipboardList} label="미처리 주문" value={unhandled} note="주문접수·원단대기 건" noteVariant="dn" />
      <StatCard variant="c2" Icon={IconStack}         label="재고 경고"   value={stockWarn} note="부족·매진 원단 품목" noteVariant="dn" />
      <StatCard variant="c1" Icon={IconBuilding}      label="미승인 업체" value={unapproved} note="승인 대기 업체" />
    </div>
  );
}
