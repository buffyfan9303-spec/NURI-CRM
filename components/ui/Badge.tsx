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
        "inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-bold",
        KIND_CLASS[kind],
        className
      )}
    >
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}
