"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { formatKRW } from "@/lib/domain/money";

export interface WorkTableRow {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  /** 이미 포맷된 수량 문자열. undefined면 "—"로 표시. */
  qty?: string;
  /** null=권한이 없어 숨김("—"), undefined=해당 없음("—"), number=금액 표시. */
  amount?: number | null;
  /** 0~100. undefined면 이 행은 진행바를 그리지 않는다(실재 분모가 없을 때). */
  progressPct?: number;
  statusLabel: string;
  statusTone?: "neutral" | "warn" | "alert" | "success";
}

const STATUS_CLASS: Record<NonNullable<WorkTableRow["statusTone"]>, string> = {
  neutral: "text-t2",
  warn: "text-wt",
  alert: "text-et",
  success: "text-okt",
};

function initialsOf(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * 하단 좌측 업무 표 — 레퍼런스의 "# / 아바타+이름+부제 / 수치 / 금액 / 진행바+%" 구성.
 * showAmount=false면 금액 열 자체를 뺀다(revenue.read 없을 때 0원을 남기지 않고 재정렬).
 * showQty=false도 마찬가지 — 해당 업종에 수량 개념이 없으면 열을 아예 만들지 않는다.
 *
 * 행 전체가 클릭 영역(≥52px)이고 이름만 실제 링크다 — 셀마다 링크를 두면 좁은 폭에서
 * 7px짜리 링크가 생겨 터치 기준에 걸린다. 휴대폰(<640)은 카드로 바뀐다(5열 규칙).
 * 금액·수량·상태는 절대 줄바꿈하지 않고, 폭이 모자라면 이름 열이 먼저 줄어든다.
 */
export function WorkTable({
  rows,
  showQty = true,
  showAmount = true,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  rows: WorkTableRow[];
  showQty?: boolean;
  showAmount?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  const router = useRouter();
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  const progress = (r: WorkTableRow) =>
    r.progressPct !== undefined ? (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-sf2">
          <span className="block h-full rounded-full bg-[var(--accent-strong)]" style={{ width: `${Math.max(0, Math.min(100, r.progressPct))}%` }} />
        </span>
        <span className="w-9 shrink-0 tabular-nums text-[11.5px] text-t3">{Math.round(r.progressPct)}%</span>
      </span>
    ) : (
      <span className={cn("text-[12px] font-medium", STATUS_CLASS[r.statusTone ?? "neutral"])}>{r.statusLabel}</span>
    );
  const amount = (r: WorkTableRow) => (r.amount == null ? "—" : formatKRW(r.amount));

  return (
    <TableOrCards
      rows={rows}
      keyOf={(r) => r.id}
      table={
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-8" />
              <col />
              {showQty && <col className="w-16" />}
              {showAmount && <col className="w-[104px]" />}
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--bd)] text-[11.5px] text-t3">
                <th className="py-2 text-left font-normal">#</th>
                <th className="py-2 text-left font-normal">이름</th>
                {showQty && <th className="py-2 text-right font-normal">수량</th>}
                {showAmount && <th className="py-2 text-right font-normal">금액</th>}
                <th className="py-2 pl-4 text-left font-normal">진행률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(r.href)}
                  className="h-[52px] cursor-pointer border-b border-[var(--bd)] transition-colors last:border-b-0 hover:bg-sf2 focus-within:bg-sf2"
                >
                  <td className="py-1.5 tabular-nums text-t3">{i + 1}</td>
                  <td className="min-w-0 py-1.5">
                    <Link
                      href={r.href}
                      onClick={(e) => e.stopPropagation()}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-[var(--r-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sf2 text-[11px] font-semibold text-t2">
                        {initialsOf(r.title)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-t">{r.title}</span>
                        {r.subtitle && <span className="block truncate text-[11.5px] text-t3">{r.subtitle}</span>}
                      </span>
                    </Link>
                  </td>
                  {showQty && <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-t2">{r.qty ?? "—"}</td>}
                  {showAmount && <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-t">{amount(r)}</td>}
                  <td className="whitespace-nowrap py-1.5 pl-4">{progress(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      card={(r) => (
        <MobileCard
          title={r.title}
          sub={r.subtitle}
          badge={progress(r)}
          onClick={() => router.push(r.href)}
          fields={[
            ...(showQty ? ([["수량", r.qty ?? "—"]] as [string, ReactNode][]) : []),
            ...(showAmount ? ([["금액", amount(r)]] as [string, ReactNode][]) : []),
          ]}
        />
      )}
    />
  );
}
