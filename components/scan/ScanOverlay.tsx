import * as React from "react";

/**
 * 조준 프레임 + 안내문. 카메라 비디오 위에 겹쳐 그린다.
 * 기존 토큰(--accent 등)만 쓴다 — light/dark 양쪽에서 자동으로 맞는 색이 된다.
 */
export function ScanOverlay({ hint, engineLabel }: { hint: string; engineLabel?: string }) {
  const corner = "absolute h-7 w-7 border-[var(--accent)]";
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
      {engineLabel && (
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur-sm">
          {engineLabel}
        </span>
      )}
      <div className="relative aspect-square w-[68%] max-w-[280px]">
        <span className={`${corner} left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[6px]`} />
        <span className={`${corner} right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[6px]`} />
        <span className={`${corner} left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[6px]`} />
        <span className={`${corner} right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[6px]`} />
      </div>
      <p className="rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm">{hint}</p>
    </div>
  );
}
