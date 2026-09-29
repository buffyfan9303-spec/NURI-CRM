"use client";

/**
 * 머리말 저장 상태(설계서 20.2): 사라지는 토스트 대신 문장이 남는다.
 *   "저장됨 14:32" / "저장 중…" / "저장 실패 — 다시 시도"
 * role=status + aria-live=polite. 실패면 다시 시도 버튼(44px)을 같이 둔다.
 */
import * as React from "react";
import { Loader2 } from "@/lib/icons";
import { STATUS_ICON } from "@/lib/icons-map";
import { cn } from "@/lib/utils/cn";

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "failed"; message?: string };

export function useSaveState() {
  const [state, setState] = React.useState<SaveState>({ kind: "idle" });
  return {
    state,
    saving: () => setState({ kind: "saving" }),
    saved: () => setState({ kind: "saved", at: new Date() }),
    failed: (message?: string) => setState({ kind: "failed", message }),
  };
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function SavedStatus({ state, onRetry, className }: { state: SaveState; onRetry?: () => void; className?: string }) {
  const Ok = STATUS_ICON.ok;
  const Err = STATUS_ICON.error;
  return (
    <p role="status" aria-live="polite" className={cn("inline-flex min-h-[44px] items-center gap-1.5 text-[length:var(--fs-meta)] text-t2", className)}>
      {state.kind === "saving" && (<><Loader2 size={15} className="animate-spin" aria-hidden />저장 중…</>)}
      {state.kind === "saved" && (<><Ok size={15} className="text-okt" aria-hidden />저장됨 {hhmm(state.at)}</>)}
      {state.kind === "failed" && (
        <>
          <Err size={15} className="text-et" aria-hidden />
          <span className="text-et">{state.message ?? "저장 실패"}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="ml-1 min-h-[44px] rounded-[var(--r-sm)] px-2 font-medium text-[var(--accent-ink)] hover:bg-sf2">
              다시 시도
            </button>
          )}
        </>
      )}
    </p>
  );
}
