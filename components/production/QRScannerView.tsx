/**
 * QR 스캐너 카메라 뷰.
 * @yudiel/react-qr-scanner v2 의 Scanner 컴포넌트 래핑.
 *
 *   - 첫 스캔 성공 시 onDetected(orderNo) 호출 후 1회성 자동 중지 (paused=true)
 *   - 데스크탑 카메라 없을 시 수동 입력 fallback
 *   - 같은 QR 연속 스캔 방지를 위한 cooldown 적용 (부모가 paused 제어)
 */
"use client";

import { useState } from "react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { IconKeyboard, IconCamera } from "@tabler/icons-react";
import { decodeOrderQR } from "@/lib/utils/qr";
import { FInput, BtnPrimary } from "@/components/common/Form";

interface Props {
  paused: boolean;
  onDetected: (orderNo: string) => void;
  onError?: (rawValue: string) => void;
}

export function QRScannerView({ paused, onDetected, onError }: Props) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const handleScan = (codes: IDetectedBarcode[]) => {
    if (!codes || codes.length === 0) return;
    const raw = codes[0].rawValue;
    const orderNo = decodeOrderQR(raw);
    if (orderNo) {
      onDetected(orderNo);
    } else {
      onError?.(raw);
    }
  };

  const submitManual = () => {
    const orderNo = decodeOrderQR(manualValue);
    if (orderNo) {
      onDetected(orderNo);
      setManualValue("");
      setManualOpen(false);
    } else {
      onError?.(manualValue);
    }
  };

  return (
    <div className="bg-sf border border-bd rounded-xl p-4 shadow-card">
      <div className="aspect-square w-full max-w-[480px] mx-auto bg-black rounded-xl overflow-hidden relative">
        <Scanner
          onScan={handleScan}
          onError={(err) => console.warn("[QR Scanner]", err)}
          paused={paused}
          constraints={{ facingMode: "environment" }}
          components={{
            finder: true,
            torch: true,
            zoom: false,
          }}
          sound={false}
          styles={{
            container: { width: "100%", height: "100%" },
            video: { objectFit: "cover" },
          }}
        />
        {paused && (
          <div className="absolute inset-0 bg-black/65 flex items-center justify-center text-white text-sm font-bold tracking-tight">
            <IconCamera size={20} className="mr-2" />
            처리 중…
          </div>
        )}
      </div>

      <div className="mt-4">
        {!manualOpen ? (
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="w-full py-2.5 px-3 border border-bd2 border-dashed rounded-lg bg-transparent text-t2 cursor-pointer text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-sf2 hover:text-t"
          >
            <IconKeyboard size={14} />
            카메라가 없는 경우 — 주문번호 직접 입력
          </button>
        ) : (
          <div className="flex gap-2">
            <FInput
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="ORD-2026-001 또는 QR 페이로드 붙여넣기"
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
            />
            <BtnPrimary onClick={submitManual}>확인</BtnPrimary>
          </div>
        )}
      </div>
    </div>
  );
}
