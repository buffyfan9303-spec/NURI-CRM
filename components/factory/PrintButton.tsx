"use client";

import { Printer } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

/**
 * 인쇄 트리거 버튼 + 화면 전용 안내. 실제 인쇄 스타일은 부모의 <style>(@media print)이 맡는다
 * — 화면이 dark 테마여도 종이는 항상 검정 글씨/흰 배경(WorkOrderSheet 인라인 색 강제 + 아래 CSS).
 */
export function PrintButton({ label = "인쇄" }: { label?: string }) {
  return (
    <div className="no-print mb-4 flex items-center justify-between">
      <p className="text-[12.5px] text-t2">인쇄 미리보기입니다. 화면은 다크 테마여도 인쇄물은 항상 검정/흰색으로 출력됩니다.</p>
      <Button onClick={() => window.print()}>
        <Printer size={14} />
        {label}
      </Button>
    </div>
  );
}

/** 페이지에 삽입할 인쇄 전용 스타일. 인쇄 시 사이드바/버튼을 감추고 배경을 흰색으로 고정한다. */
export function PrintStyles() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body { background: #fff !important; }
        .work-order-sheet { break-inside: avoid; }
        .work-order-sheet + .work-order-sheet { page-break-before: always; }
      }
    `}</style>
  );
}
