import * as React from "react";
import { Inbox } from "@/lib/icons";

/**
 * 정상적으로 조회했지만 결과가 0건인 상태.
 * 오류(ErrorState)·권한없음(ForbiddenState)과 아이콘·문구·색상 전부 다르게 하여
 * 계약 §5.5(오류·권한부족·정상 빈 결과는 서로 다른 3가지)를 지킨다.
 */
export function EmptyState({
  title = "표시할 항목이 없습니다.",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-sf2 text-t3">
        <Inbox size={20} aria-hidden />
      </div>
      <p className="text-[14px] font-medium text-t">{title}</p>
      {description && <p className="max-w-[320px] text-[12.5px] leading-relaxed text-t2">{description}</p>}
      {action}
    </div>
  );
}
