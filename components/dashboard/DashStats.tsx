/**
 * 대시보드 통계 카드 4종 — 시드 데이터에서 실시간 계산.
 * 기존 renderDashStats() 와 동일한 4개 메트릭.
 */
"use client";

import {
  IconUsers,
  IconClipboardList,
  IconPackage,
  IconStack,
} from "@tabler/icons-react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useFabricStore } from "@/lib/stores/fabricStore";
import { StatCard } from "@/components/common/StatCard";

const IN_PROD_STATES = ["재단중", "봉제중", "생산중", "검수중", "원단발주"] as const;

export function DashStats() {
  const customers = useCustomerStore((s) => s.customers);
  const fabrics = useFabricStore((s) => s.fabrics);

  const totalC = customers.length;
  const activeOrders = customers.reduce(
    (n, c) => n + c.orders.filter((o) => o.st !== "배송완료").length,
    0
  );
  const inProd = customers.reduce(
    (n, c) =>
      n +
      c.orders.filter((o) =>
        (IN_PROD_STATES as readonly string[]).includes(o.st)
      ).length,
    0
  );
  const delivDone = customers.reduce(
    (n, c) => n + c.orders.filter((o) => o.st === "배송완료").length,
    0
  );
  const fabItems = fabrics.length;
  const fabWarn = fabrics.filter(
    (f) => f.status === "부족" || f.status === "매진"
  ).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-[18px]">
      <StatCard
        variant="c1"
        Icon={IconUsers}
        label="전체 고객"
        value={totalC}
        note="↑ 총 등록 고객"
        noteVariant="up"
        href="/customers"
        title="고객 목록으로 이동"
      />
      <StatCard
        variant="c2"
        Icon={IconClipboardList}
        label="진행 주문"
        value={activeOrders}
        note={`생산중 ${inProd}건`}
        href="/production"
        title="생산 현황으로 이동"
      />
      <StatCard
        variant="c3"
        Icon={IconPackage}
        label="배송 완료"
        value={delivDone}
        note="누적 완료 건수"
        noteVariant="up"
        href="/customers"
      />
      <StatCard
        variant="c4"
        Icon={IconStack}
        label="원단 품목"
        value={fabItems}
        note={fabWarn > 0 ? `↓ 재고부족 ${fabWarn}개` : "재고 정상"}
        noteVariant={fabWarn > 0 ? "dn" : undefined}
        href="/fabrics"
        title="원단 재고로 이동"
      />
    </div>
  );
}
