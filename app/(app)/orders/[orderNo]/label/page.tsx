/**
 * 주문 QR 라벨 인쇄 페이지.
 * 공장에 보낼 작업 지시서 — QR + 주문 요약.
 * window.print() 호출 시 print 스타일이 사이드바·토스트를 숨기고 라벨만 출력.
 */
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconPrinter, IconArrowLeft } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ActionButton } from "@/components/common/ActionButton";
import { BtnGhost } from "@/components/common/Form";
import { OrderQRCode } from "@/components/order/OrderQRCode";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import { useCustomerStore } from "@/lib/stores/customerStore";

export default function OrderLabelPage() {
  const params = useParams<{ orderNo: string }>();
  const router = useRouter();
  const orderNo = decodeURIComponent(params.orderNo);
  const findOrder = useCustomerStore((s) => s.findOrder);
  const found = findOrder(orderNo);

  /* 첫 진입 시 자동 인쇄 옵션은 끔 — 사용자 명시적 트리거 */
  useEffect(() => {
    if (!found) return;
  }, [found]);

  if (!found) {
    return (
      <>
        <Topbar title="QR 라벨">
          <ThemeToggle />
        </Topbar>
        <PageContent>
          <div className="text-t3 text-sm py-10 text-center">
            주문 {orderNo} 을(를) 찾을 수 없습니다.
          </div>
        </PageContent>
      </>
    );
  }

  const { customer, order } = found;
  const today = new Date();
  const issuedDate =
    today.getFullYear() +
    "." +
    String(today.getMonth() + 1).padStart(2, "0") +
    "." +
    String(today.getDate()).padStart(2, "0");

  return (
    <>
      <Topbar title="QR 라벨 인쇄">
        <BtnGhost onClick={() => router.back()} className="flex items-center gap-1.5">
          <IconArrowLeft size={14} />
          뒤로
        </BtnGhost>
        <ActionButton onClick={() => window.print()}>
          <IconPrinter size={14} />
          인쇄
        </ActionButton>
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <div id="print-area" className="max-w-[640px] mx-auto bg-white text-black border border-bd rounded-xl p-8 shadow-card">
          {/* 헤더 */}
          <div className="flex items-center gap-4 border-b-2 border-acc pb-4 mb-5">
            <div className="text-[11px] font-extrabold tracking-[3px] text-gold">
              NURI CRM
            </div>
            <div className="flex-1 text-right">
              <div className="text-2xl font-black text-acc tracking-tight">
                작업 지시서
              </div>
              <div className="text-xs text-t3 mt-1">발행일: {issuedDate}</div>
            </div>
          </div>

          {/* QR + 정보 */}
          <div className="flex gap-6 items-start">
            <OrderQRCode orderNo={order.no} size={180} showLabel />

            <div className="flex-1 space-y-2.5">
              <Row label="주문번호" value={order.no} mono />
              <Row label="고객명" value={customer.name} />
              <Row label="품목" value={order.item} />
              <Row label="주문일" value={order.ord} />
              <Row label="배송예정일" value={order.del} />
              <Row label="제작공장" value={order.fac || "—"} />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-t3 font-bold uppercase tracking-[.4px] w-[80px]">
                  현재 상태
                </span>
                <OrderStatusBadge status={order.st} />
              </div>
            </div>
          </div>

          {/* 푸터 */}
          <div className="mt-8 pt-4 border-t border-bd text-[10px] text-t3 flex justify-between">
            <span>QR을 스캔하면 칸반 보드에서 상태를 즉시 업데이트할 수 있습니다.</span>
            <span>NURI CRM v3.2 · Mission 2 QR Tracking</span>
          </div>
        </div>
      </PageContent>
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-t3 font-bold uppercase tracking-[.4px] w-[80px]">
        {label}
      </span>
      <span className={mono ? "font-mono font-bold text-base" : "text-sm font-semibold"}>
        {value}
      </span>
    </div>
  );
}
