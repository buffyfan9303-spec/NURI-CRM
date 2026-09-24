/**
 * 주문 등록/수정 트랜잭션 훅.
 *
 * 기존 saveOrder() 의 부수효과를 한 곳에 모음:
 *   1) customerStore 에 주문 추가/수정
 *   2) 원단 사용량 차감 (fabricStore.consume)
 *   3) 원단매장별 발주 알림 토스트 (중복 제거)
 *   4) 부족·매진 상태 전이 토스트
 *
 * Phase 1.7 OrderForm 컴포넌트가 이 훅의 submit() 을 호출.
 * Phase 2.3 QR 스캐너도 별도 transitionStatus 훅으로 동일 패턴 적용.
 */
"use client";

import { useCallback } from "react";
import {
  useCustomerStore,
  useFabricStore,
  useBusinessStore,
  useToastStore,
  nextOrderNo,
} from "@/lib/stores";
import type { Order } from "@/types/order";

export interface SubmitOrderInput {
  customerName: string;
  draft: Omit<Order, "no"> & { no?: string };
  editingOrderNo: string | null;
}

export function useOrderSubmit() {
  const customerStore = useCustomerStore();
  const fabricStore = useFabricStore();
  const businessStore = useBusinessStore();
  const showToast = useToastStore((s) => s.show);

  const submit = useCallback(
    (input: SubmitOrderInput): Order => {
      const no = input.editingOrderNo ?? input.draft.no ?? nextOrderNo();
      const finalOrder: Order = { ...input.draft, no };

      if (input.editingOrderNo) {
        customerStore.updateOrder(input.editingOrderNo, finalOrder);
      } else {
        customerStore.addOrder(input.customerName, finalOrder);
      }

      /* 원단 차감 + 알림 */
      const notifiedBiz = new Set<string>();
      for (const f of finalOrder.fabrics ?? []) {
        if (f.fabricBizId && !notifiedBiz.has(f.fabricBizId)) {
          notifiedBiz.add(f.fabricBizId);
          const biz = businessStore.getById(f.fabricBizId);
          showToast(
            "원단 발주 알림",
            `${biz?.name ?? f.fabricBizId} — ${no} 주문이 접수되었습니다.`,
            "info"
          );
        }
        if (f.fabricId) {
          const result = fabricStore.consume(f.fabricId, f.m);
          if (result && result.prevStatus !== result.nextStatus) {
            showToast(
              "재고 상태 변경",
              `${result.fabric.name} — ${result.nextStatus} 상태로 변경되었습니다.`,
              "warn"
            );
          }
        }
      }

      customerStore.clearEditOrder();
      return finalOrder;
    },
    [customerStore, fabricStore, businessStore, showToast]
  );

  return { submit };
}
