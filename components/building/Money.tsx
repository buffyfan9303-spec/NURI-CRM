/**
 * 건물 관리비 금액 표기(디자인 스펙 §3-4). 서버·클라이언트 공용(훅 없음).
 * - 일반: "312,450원", tabular-nums 우측 정렬(건물 범위는 CSS 가 tnum·kerning none 을 전역으로 켠다).
 * - 음수(감면·선납·크레딧): U+2212 마이너스 + --accent-ink. 하이픈이 아니다.
 * - 미납·차단: 아이콘(STATUS_ICON.error) + --et. 글자색만 빨강은 금지.
 * - 증감: 부호 항상("+8,200" / "−1,300" / "0"), 색 없음.
 * - null(권한 없음): "—".
 */
import * as React from "react";
import { formatKRW } from "@/lib/domain/money";
import { STATUS_ICON } from "@/lib/icons-map";
import { cn } from "@/lib/utils/cn";

const MINUS = "−";

/** formatKRW 의 하이픈을 U+2212 로. */
export const fmtMoney = (n: number | null | undefined): string => formatKRW(n).replace(/^-/, MINUS);

/** 증감: 부호 항상, 단위 없음. */
export function fmtDiff(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n > 0 ? `+${abs}` : n < 0 ? `${MINUS}${abs}` : "0";
}

export type MoneyTone = "default" | "unpaid" | "credit" | "muted";

export function Money({
  value,
  tone,
  strong,
  className,
}: {
  value: number | null | undefined;
  /** 생략하면 음수는 credit, 그 외 default. */
  tone?: MoneyTone;
  strong?: boolean;
  className?: string;
}) {
  const t: MoneyTone = tone ?? (value != null && value < 0 ? "credit" : "default");
  const Err = STATUS_ICON.error;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums",
        t === "credit" && "text-[var(--accent-ink)]",
        t === "unpaid" && "text-et",
        t === "muted" && "text-t3",
        strong && "font-semibold",
        className,
      )}
    >
      {t === "unpaid" && <Err size={14} aria-hidden className="shrink-0" />}
      {fmtMoney(value)}
    </span>
  );
}

/** 표 셀: 금액 크기 토큰 + 우측 정렬. `<td>` 로 그린다. */
export function MoneyCell({ value, tone, strong, className, colSpan }: { value: number | null | undefined; tone?: MoneyTone; strong?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5 text-right align-middle text-[length:var(--fs-money)]", strong && "font-semibold", className)}>
      <Money value={value} tone={tone} strong={strong} />
    </td>
  );
}

/** 증감 셀: 부호 병행, 색 없음. */
export function DiffCell({ value, className }: { value: number | null | undefined; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-right align-middle tabular-nums text-[length:var(--fs-money)] text-t2", className)}>{fmtDiff(value)}</td>;
}

/**
 * 네 숫자: 공급가액 / 세액 / 면세액 / 청구액 — 항상 이 순서, 청구액만 굵게(§3-4).
 * 납부 요청액 흐름(당월 부과 → 전월 미납 → 연체료 → 선납·감면 → 납부 요청액)은 `rows` 로 덧붙인다.
 */
export function FourNumbers({
  supply,
  vat,
  exempt,
  total,
  totalLabel = "청구액",
  rows,
  className,
}: {
  supply: number | null | undefined;
  vat: number | null | undefined;
  exempt: number | null | undefined;
  total: number | null | undefined;
  totalLabel?: string;
  /** 청구액 위에 끼워 넣을 추가 줄(예: 전월 미납·연체료·선납). */
  rows?: { label: string; value: number | null | undefined; tone?: MoneyTone }[];
  className?: string;
}) {
  const line = "flex items-baseline justify-between gap-4 py-1.5";
  return (
    <dl className={cn("text-[length:var(--fs-body)]", className)}>
      <div className={line}><dt className="text-t2">공급가액</dt><dd><Money value={supply} /></dd></div>
      <div className={line}><dt className="text-t2">세액</dt><dd><Money value={vat} /></dd></div>
      <div className={line}><dt className="text-t2">면세액</dt><dd><Money value={exempt} /></dd></div>
      {rows?.map((r) => (
        <div key={r.label} className={line}><dt className="text-t2">{r.label}</dt><dd><Money value={r.value} tone={r.tone} /></dd></div>
      ))}
      <div className={cn(line, "mt-1 border-t-2 border-[var(--t)] pt-2.5")}>
        <dt className="font-semibold text-t">{totalLabel}</dt>
        <dd className="text-[length:var(--fs-kpi)] font-bold leading-none tracking-[var(--tr-tight)]"><Money value={total} strong /></dd>
      </div>
    </dl>
  );
}
