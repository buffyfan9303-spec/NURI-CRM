import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * 카드 = 높이 1단계(경계 1px + --sh-card). 반경은 --r-lg(12px, Cal/Linear 카드 기준).
 * 링크·버튼으로 쓰는 카드(호출부가 hover 를 원할 때)는 `interactive` 를 켠다 — 2단계 그림자로 살짝 들리고 1px 떠오른다.
 * API 는 그대로: className 이 마지막에 와서 호출부 padding/MOBILE_BARE 가 계속 이긴다.
 */
export function Card({
  className,
  interactive = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf shadow-card",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-2 ease-out hover:-translate-y-px hover:border-[var(--bd-strong)] hover:shadow-raised motion-reduce:hover:translate-y-0",
        className
      )}
      {...rest}
    />
  );
}
