/**
 * 주문 상태 전이 트랜잭션 훅.
 *
 *   1) customerStore.updateOrderStatus(orderNo, next)
 *   2) 칸반 컬럼 매핑 변경에 따라 자동 리렌더 (Zustand 구독)
 *   3) 토스트로 결과 알림
 *   4) DashStats 의 inProd / activeOrders 즉시 반영
 *
 * QR 스캔과 칸반 카드 드래그(향후) 양쪽에서 동일 진입점.
 */
"use client";

import { useCallback } from "react";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useToastStore } from "@/lib/stores/toastStore";
import type { OrderStatus } from "@/types/order";

export interface TransitionResult {
  ok: boolean;
  prev?: OrderStatus;
  next?: OrderStatus;
  customer?: string;
  orderNo?: string;
}

export function useStatusTransition() {
  const updateStatus = useCustomerStore((s) => s.updateOrderStatus);
  const showToast = useToastStore((s) => s.show);

  const transition = useCallback(
    (orderNo: string, nextStatus: OrderStatus): TransitionResult => {
      const result = updateStatus(orderNo, nextStatus);
      if (!result) {
        showToast("주문 없음", `${orderNo} 을(를) 찾을 수 없습니다.`, "warn");
        return { ok: false };
      }
      if (result.prev === result.next) {
        showToast(
          "변경 없음",
          `${orderNo} 는 이미 ${result.next} 상태입니다.`,
          "info"
        );
        return {
          ok: true,
          prev: result.prev,
          next: result.next,
          customer: result.customer.name,
          orderNo,
        };
      }
      showToast(
        "상태 변경 완료",
        `${orderNo} — ${result.prev} → ${result.next}`,
        "ok"
      );
      return {
        ok: true,
        prev: result.prev,
        next: result.next,
        customer: result.customer.name,
        orderNo,
      };
    },
    [updateStatus, showToast]
  );

  return { transition };
}
