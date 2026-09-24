/**
 * 업종 공통 "오늘 처리할 업무" 행 목록. 렌탈 예약, 공장 공정, 미용실 예약, 학원 수업,
 * 무인매장 작업이 전부 이 모양(시간·대상·요약·상태·다음 작업)으로 표현된다.
 * 행을 누르면 해당 업무 상세로 이동한다 — "상세보기" 버튼 하나로 뭉뚱그리지 않고
 * 상태별 다음 작업 힌트를 같이 보여준다(§5.5).
 */
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";

export interface WorkRow {
  id: string;
  href: string;
  /** 이미 tz로 포맷된 시각 문자열(예: "14:30"). 없으면 시간 열을 비운다. */
  time?: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusTone?: "neutral" | "warn" | "alert" | "success";
  /** 이 행에서 다음으로 할 수 있는 일(예: "출고 처리"). */
  action?: string;
}

const STATUS_CLASS: Record<NonNullable<WorkRow["statusTone"]>, string> = {
  neutral: "text-t2",
  warn: "text-wt",
  alert: "text-et",
  success: "text-okt",
};

export function WorkList({
  rows,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: WorkRow[];
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--bd)]">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={r.href}
            className="flex min-h-[52px] items-center gap-3 px-1 py-2 text-[13px] hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {r.time && <span className="w-12 shrink-0 tabular-nums text-t3">{r.time}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-t">{r.title}</span>
              {r.subtitle && <span className="block truncate text-[12px] text-t3">{r.subtitle}</span>}
            </span>
            <span className={cn("shrink-0 text-[12px] font-medium", STATUS_CLASS[r.statusTone ?? "neutral"])}>
              {r.statusLabel}
            </span>
            {r.action && (
              <span className="hidden shrink-0 rounded-[6px] border border-[var(--bd2)] px-2 py-1 text-[11.5px] text-t2 sm:inline-block">
                {r.action}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
