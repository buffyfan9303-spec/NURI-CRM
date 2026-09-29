import * as React from "react";
import {
  CheckCircle2,
  TriangleAlert,
  Info,
  CircleX,
} from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

export type BadgeKind = "success" | "warning" | "info" | "error";

const KIND_CLASS: Record<BadgeKind, string> = {
  success: "bg-okb text-okt",
  warning: "bg-wb text-wt",
  info: "bg-ib text-it",
  error: "bg-eb text-et",
};

const KIND_ICON: Record<BadgeKind, React.ComponentType<{ size?: number | string; className?: string }>> = {
  success: CheckCircle2,
  warning: TriangleAlert,
  info: Info,
  error: CircleX,
};

/** 색상만으로 상태를 전달하지 않도록 kind별 아이콘 + 텍스트를 함께 보여준다. */
export function Badge({
  kind,
  children,
  className,
}: {
  kind: BadgeKind;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      className={cn(
        // 상태 배지는 pill(Linear·Notion status-badge). 12px/600 + 안쪽 1px 같은 색 링으로 면 위에서 또렷하다.
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[length:var(--fs-meta)] font-semibold leading-[16px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_18%,transparent)]",
        KIND_CLASS[kind],
        className
      )}
    >
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}
