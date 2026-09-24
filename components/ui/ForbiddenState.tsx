import * as React from "react";
import { Lock } from "@/lib/icons";

/** 권한 없음. 오류(ErrorState)·정상 빈 결과(EmptyState)와 구분되는 전용 상태. */
export function ForbiddenState({
  title = "접근 권한이 없습니다.",
  description = "이 화면을 보려면 사업장 소속과 권한이 필요합니다. 관리자에게 문의하세요.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-wb text-wt">
        <Lock size={20} aria-hidden />
      </div>
      <p className="text-[14px] font-medium text-t">{title}</p>
      <p className="max-w-[320px] text-[12.5px] leading-relaxed text-t2">{description}</p>
      {action}
    </div>
  );
}
