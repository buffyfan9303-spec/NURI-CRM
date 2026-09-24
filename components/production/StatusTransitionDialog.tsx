/**
 * QR 스캔 후 노출되는 상태 전이 확정 다이얼로그.
 * 스캔한 주문 정보를 보여주고, 다음 상태를 한 탭으로 선택.
 */
"use client";

import { useState } from "react";
import { IconX, IconArrowRight, IconCheck } from "@tabler/icons-react";
import { ORDER_STATUSES, type Order, type OrderStatus } from "@/types/order";
import { NEXT_STATUS, STATUS_DESCRIPTION } from "@/lib/constants/statusTransitions";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { BtnGhost, BtnPrimary, FSelect } from "@/components/common/Form";
import type { Customer } from "@/types/customer";

interface Props {
  customer: Customer;
  order: Order;
  onConfirm: (nextStatus: OrderStatus) => void;
  onCancel: () => void;
}

export function StatusTransitionDialog({ customer, order, onConfirm, onCancel }: Props) {
  const suggested = NEXT_STATUS[order.st] ?? order.st;
  const [next, setNext] = useState<OrderStatus>(suggested);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[300] flex items-end md:items-center justify-center px-0 md:px-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-sf border border-bd rounded-t-2xl md:rounded-2xl py-5 px-5 md:py-6 md:px-7 w-full md:w-[420px] md:max-w-full shadow-modal">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-bd">
          <span className="text-sm font-extrabold tracking-tight">상태 변경 확인</span>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 border border-bd rounded-md text-t2 cursor-pointer flex items-center justify-center transition-colors hover:bg-sf2"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* 주문 정보 */}
        <div className="bg-sf2 border border-bd rounded-lg p-4 mb-5">
          <div className="text-[10px] font-bold text-t3 uppercase tracking-[.6px] mb-1">
            주문 정보
          </div>
          <div className="text-base font-bold text-t mb-0.5">{customer.name}</div>
          <div className="text-xs text-t2 mb-2">{order.item}</div>
          <div className="text-[11px] text-t3 font-mono">{order.no}</div>
        </div>

        {/* 상태 전이 시각화 */}
        <div className="flex items-center justify-center gap-3 mb-5 py-2">
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[9px] text-t3 font-bold uppercase tracking-[.5px]">현재</div>
            <OrderStatusBadge status={order.st} />
          </div>
          <IconArrowRight size={22} className="text-t3" />
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[9px] text-t3 font-bold uppercase tracking-[.5px]">변경</div>
            <OrderStatusBadge status={next} />
          </div>
        </div>

        {/* 다음 상태 선택 (제안 자동 적용, 수동 변경 가능) */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-t2 mb-1.5 uppercase tracking-[.4px]">
            다음 상태
          </label>
          <FSelect value={next} onChange={(e) => setNext(e.target.value as OrderStatus)}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} — {STATUS_DESCRIPTION[s]}
              </option>
            ))}
          </FSelect>
          {next === suggested && order.st !== order.st /* placeholder */ && null}
          <div className="text-[10px] text-t3 mt-1.5">
            {next === order.st
              ? "현재 상태와 동일합니다."
              : `${order.st} → ${next} 로 변경됩니다.`}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-bd">
          <BtnGhost onClick={onCancel}>취소</BtnGhost>
          <BtnPrimary onClick={() => onConfirm(next)}>
            <IconCheck size={14} />
            상태 변경
          </BtnPrimary>
        </div>
      </div>
    </div>
  );
}
