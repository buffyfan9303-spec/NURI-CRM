/**
 * 토스트 컨테이너.
 * toastStore.toasts 를 구독해 우측 하단에 스택으로 렌더한다.
 * 기존 #toast-container 와 동일한 위치·애니메이션(toastIn).
 */
"use client";

import { useToastStore, type ToastType } from "@/lib/stores/toastStore";
import {
  IconCircleCheck,
  IconBellRinging,
  IconAlertTriangle,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<ToastType, TablerIcon> = {
  ok: IconCircleCheck,
  info: IconBellRinging,
  warn: IconAlertTriangle,
};

const ICON_COLOR: Record<ToastType, string> = {
  ok: "text-okt",
  info: "text-it",
  warn: "text-wt",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      id="toast-container"
      className="fixed z-[9999] flex flex-col-reverse gap-2 pointer-events-none
                 bottom-3 inset-x-3 items-stretch
                 md:bottom-6 md:right-6 md:left-auto md:items-end"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              "bg-sf border border-bd2 rounded-[10px] px-4 py-3 shadow-modal pointer-events-auto",
              "flex items-start gap-2.5",
              "w-full md:w-auto md:min-w-[260px] md:max-w-[340px]",
              "[animation:toastIn_0.22s_ease]"
            )}
          >
            <Icon size={17} className={cn("flex-shrink-0 mt-px", ICON_COLOR[t.type])} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-t mb-0.5">{t.title}</div>
              <div className="text-[11px] text-t2 leading-[1.4]">{t.msg}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
