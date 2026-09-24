import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf shadow-card",
        className
      )}
      {...rest}
    />
  );
}
