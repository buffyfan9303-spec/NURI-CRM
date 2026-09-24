"use client";

import {
  IconTruck,
  IconClockHour4,
  IconAlertTriangle,
  IconPackageExport,
} from "@tabler/icons-react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { ddayFromToday } from "@/lib/utils/dday";
import { StatCard } from "@/components/common/StatCard";

const PLANNED_STATES = ["배송예정", "검수중", "봉제중", "생산중", "재단중"] as const;

export function DeliveryStats() {
  const flatten = useCustomerStore((s) => s.flattenOrders);
  const rows = flatten();

  const planned = rows.filter((r) =>
    (PLANNED_STATES as readonly string[]).includes(r.order.st)
  ).length;
  const done = rows.filter((r) => r.order.st === "배송완료").length;
  const overdue = rows.filter((r) => {
    if (r.order.st === "배송완료") return false;
    const d = ddayFromToday(r.order.del);
    return d !== null && d < 0;
  }).length;
  const today = rows.filter((r) => {
    if (r.order.st === "배송완료") return false;
    return ddayFromToday(r.order.del) === 0;
  }).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-[18px]">
      <StatCard variant="c1" Icon={IconTruck}         label="배송 예정" value={planned} note="생산중 포함" />
      <StatCard variant="c2" Icon={IconClockHour4}    label="오늘 출고" value={today}   note="D-Day 건수" />
      <StatCard variant="c4" Icon={IconAlertTriangle} label="납기 초과" value={overdue} note="긴급 처리 필요" noteVariant="dn" />
      <StatCard variant="c3" Icon={IconPackageExport} label="배송 완료" value={done}    note="누적 완료 건수" noteVariant="up" />
    </div>
  );
}
