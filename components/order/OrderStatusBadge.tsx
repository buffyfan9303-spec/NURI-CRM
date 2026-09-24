/**
 * 주문 상태 배지 — 9가지 상태 색 자동 매핑.
 * 기존 .badge.b-* 클래스를 그대로 사용.
 */
"use client";

import type { OrderStatus } from "@/types/order";
import { STATUS_BADGE } from "@/lib/constants/statusMaps";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${STATUS_BADGE[status] || "b-info"}`}>{status}</span>;
}
