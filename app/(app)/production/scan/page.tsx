/**
 * QR 스캐너 페이지 — 모바일 우선 디자인.
 * 공장 작업자가 카메라로 주문 QR 을 찍으면 → 확인 다이얼로그 → 상태 갱신.
 *
 * 모바일 최적화:
 *   - 사이드바는 햄버거 드로어로 숨김 (Topbar 가 자동 처리)
 *   - 카메라 뷰포트는 화면 너비 가득 (mobile) / 480px 제한 (desktop)
 *   - 터치 타깃 ≥44px
 *   - 본문 패딩 축소
 */
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconScan, IconHistory } from "@tabler/icons-react";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BtnGhost } from "@/components/common/Form";
import { QRScannerView } from "@/components/production/QRScannerView";
import { StatusTransitionDialog } from "@/components/production/StatusTransitionDialog";
import { useCustomerStore } from "@/lib/stores/customerStore";
import { useToastStore } from "@/lib/stores/toastStore";
import { useStatusTransition } from "@/hooks/useStatusTransition";
import { OrderStatusBadge } from "@/components/order/OrderStatusBadge";
import type { Customer } from "@/types/customer";
import type { Order, OrderStatus } from "@/types/order";

interface ScanLog {
  ts: number;
  orderNo: string;
  customerName: string;
  prev: OrderStatus;
  next: OrderStatus;
}

export default function ScannerPage() {
  const router = useRouter();
  const findOrder = useCustomerStore((s) => s.findOrder);
  const showToast = useToastStore((s) => s.show);
  const { transition } = useStatusTransition();

  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState<{ customer: Customer; order: Order } | null>(null);
  const [log, setLog] = useState<ScanLog[]>([]);

  const handleDetected = useCallback(
    (orderNo: string) => {
      const found = findOrder(orderNo);
      if (!found) {
        showToast("주문 없음", `${orderNo} 을(를) 찾을 수 없습니다.`, "warn");
        return;
      }
      setPaused(true);
      setPending(found);
    },
    [findOrder, showToast]
  );

  const handleInvalid = useCallback(
    (raw: string) => {
      showToast("QR 인식 오류", `유효하지 않은 페이로드: ${raw.slice(0, 40)}`, "warn");
    },
    [showToast]
  );

  const handleConfirm = (nextStatus: OrderStatus) => {
    if (!pending) return;
    const result = transition(pending.order.no, nextStatus);
    if (result.ok && result.prev && result.next) {
      setLog((prev) =>
        [
          {
            ts: Date.now(),
            orderNo: pending.order.no,
            customerName: pending.customer.name,
            prev: result.prev!,
            next: result.next!,
          },
          ...prev,
        ].slice(0, 8)
      );
    }
    setPending(null);
    setTimeout(() => setPaused(false), 800);
  };

  const handleCancel = () => {
    setPending(null);
    setPaused(false);
  };

  return (
    <>
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <IconScan size={17} className="text-acc" />
            <span className="truncate">QR 스캐너</span>
            <span className="hidden md:inline text-t3 font-normal text-xs">— 공정 상태 업데이트</span>
          </span>
        }
      >
        <BtnGhost
          onClick={() => router.push("/production")}
          className="hidden md:flex items-center gap-1.5"
        >
          <IconArrowLeft size={14} />
          칸반으로
        </BtnGhost>
        <ThemeToggle />
      </Topbar>
      <PageContent className="px-3 md:px-[22px] py-3 md:py-5">
        <div className="max-w-[640px] mx-auto">
          <QRScannerView
            paused={paused}
            onDetected={handleDetected}
            onError={handleInvalid}
          />

          {/* 안내 */}
          <div className="mt-3 md:mt-4 bg-sf2 border border-bd rounded-lg p-3 md:p-4 text-xs text-t2 leading-relaxed">
            <div className="font-bold text-t mb-1.5 flex items-center gap-1.5 text-[13px]">
              <IconScan size={14} className="text-acc" />
              사용 방법
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] md:text-xs">
              <li>주문 라벨의 QR 코드를 카메라 중앙에 맞춰 인식</li>
              <li>주문 정보 확인 후 "상태 변경" 버튼 클릭</li>
              <li>변경된 상태가 칸반·대시보드에 즉시 반영됨</li>
            </ol>
          </div>

          {/* 최근 스캔 기록 */}
          {log.length > 0 && (
            <div className="mt-3 md:mt-4 bg-sf border border-bd rounded-lg p-3 md:p-4 shadow-card">
              <div className="font-bold text-t mb-2.5 flex items-center gap-1.5 text-xs">
                <IconHistory size={13} className="text-t2" />
                이 세션의 스캔 기록 ({log.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {log.map((entry) => (
                  <div
                    key={entry.ts}
                    className="flex flex-wrap items-center gap-1.5 md:gap-2 text-[11px] py-1.5 px-2 bg-sf2 rounded"
                  >
                    <span className="font-mono font-bold w-[100px]">
                      {entry.orderNo}
                    </span>
                    <span className="flex-1 min-w-[80px] text-t2">
                      {entry.customerName}
                    </span>
                    <OrderStatusBadge status={entry.prev} />
                    <span className="text-t3">→</span>
                    <OrderStatusBadge status={entry.next} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 모바일 하단 — 칸반으로 돌아가기 (Topbar 의 desktop-only 버튼 대체) */}
          <button
            type="button"
            onClick={() => router.push("/production")}
            className="md:hidden mt-4 w-full py-3 border border-bd2 rounded-lg bg-sf text-t text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:bg-sf2 active:scale-[.98]"
          >
            <IconArrowLeft size={16} />
            칸반 보드로 돌아가기
          </button>
        </div>
      </PageContent>

      {pending && (
        <StatusTransitionDialog
          customer={pending.customer}
          order={pending.order}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
