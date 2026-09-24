/**
 * 대시보드 퀵액션 4개 — 자주 쓰는 "동작" 단축.
 *
 * 설계 원칙:
 *   - 통계카드(전체고객/진행주문/배송완료/원단품목) 와 목적지가 겹치지 않아야 함.
 *   - 통계 = 현황 조회, 퀵액션 = 작업 수행.
 *   - 4개 모두 "쓰기/이동" 성격 (등록·스캔·배송 처리 등).
 */
"use client";

import Link from "next/link";
import {
  IconUserPlus,
  IconClipboardList,
  IconScan,
  IconTruckDelivery,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

interface QuickAction {
  href: string;
  label: string;
  sub: string;
  Icon: TablerIcon;
  color: string;
}

const ACTIONS: QuickAction[] = [
  { href: "/customers/new",    label: "고객 등록", sub: "신규 고객 추가",     Icon: IconUserPlus,       color: "#0c1f35" },
  { href: "/orders/new",       label: "주문 등록", sub: "신규 주문 접수",     Icon: IconClipboardList,  color: "#c8914a" },
  { href: "/production/scan",  label: "QR 스캔",   sub: "공정 상태 업데이트", Icon: IconScan,           color: "#7c3aed" },
  { href: "/delivery",         label: "배송 관리", sub: "납기·출고 처리",     Icon: IconTruckDelivery,  color: "#0d9488" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 md:flex md:flex-row gap-2 mb-4">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="md:flex-1 flex items-center gap-2.5 px-3.5 py-3 bg-sf border border-bd rounded-[10px] cursor-pointer transition-all hover:border-bd2 hover:shadow-card hover:bg-sf2 select-none min-w-0"
        >
          <a.Icon
            size={20}
            style={{ color: a.color }}
            className="flex-shrink-0 opacity-85"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold text-t leading-tight truncate">
              {a.label}
            </div>
            <div className="text-[10px] text-t3 mt-px truncate">{a.sub}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
