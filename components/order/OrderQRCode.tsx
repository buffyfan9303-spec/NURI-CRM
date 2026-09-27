/**
 * 주문 QR 코드 컴포넌트.
 * qrcode.react 의 SVG 출력 사용 — 인쇄 시에도 선명.
 *
 *   <OrderQRCode orderNo="ORD-2026-001" size={120} showLabel />
 */
"use client";

import { QRCodeSVG } from "qrcode.react";
import { encodeOrderQR } from "@/lib/utils/qr";
import { cn } from "@/lib/utils/cn";

interface Props {
  orderNo: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

export function OrderQRCode({ orderNo, size = 120, showLabel, className }: Props) {
  const payload = encodeOrderQR(orderNo);
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1.5 p-2.5 bg-white border border-bd rounded-lg",
        className
      )}
    >
      {/* F22: svg 에 대체텍스트 — qrcode.react 의 title 은 <title> 로 들어가고 role/aria 는 svg 에 그대로 전달된다. */}
      <QRCodeSVG
        value={payload}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#0c1f35"
        includeMargin={false}
        title={`주문번호 ${orderNo} QR 코드`}
        role="img"
        aria-label={`주문번호 ${orderNo} QR 코드`}
      />
      {showLabel && (
        <div className="text-[10px] text-t3 font-bold tracking-tight">
          {orderNo}
        </div>
      )}
    </div>
  );
}
