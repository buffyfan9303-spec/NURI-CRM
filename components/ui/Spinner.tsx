import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Loader2
      size={size}
      className={cn("animate-spin text-[var(--accent)]", className)}
      role="status"
      aria-label="로딩 중"
    />
  );
}
