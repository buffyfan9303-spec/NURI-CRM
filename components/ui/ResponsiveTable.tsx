"use client";

/**
 * 표(≥sm 640px) ↔ 카드(<sm) 전환 공용 조각.
 *
 * 같은 rows 배열로 표와 카드를 둘 다 그린다 — onClick·링크·권한 조건은 호출부가 한 곳에서
 * 계산해 양쪽에 그대로 넘긴다(표와 카드에서 동작이 갈라지지 않게). PC·태블릿은 기존 표
 * 그대로, 휴대폰만 카드로 보인다(CSS 전환이라 hydration 차이가 없다).
 */
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function TableOrCards<T>({
  rows,
  keyOf,
  table,
  card,
}: {
  rows: T[];
  keyOf: (row: T) => string;
  /** 기존 표 JSX 그대로(overflow-x-auto 래퍼 포함). */
  table: React.ReactNode;
  card: (row: T) => React.ReactNode;
}) {
  return (
    <>
      <div className="hidden sm:block">{table}</div>
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((r) => (
          <li key={keyOf(r)}>{card(r)}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * 휴대폰 카드 한 장. 1행 = 이름(한 줄 truncate + 전체는 title) + 상태 배지,
 * 이름 아래 = 부가 표시(태그·코드), 본문 = 라벨/값 3~5개, 마지막 = 동작 버튼(우측 정렬).
 * 동작·확장 영역의 클릭은 카드 onClick 으로 번지지 않는다.
 */
/** 카드 안의 버튼·링크·입력은 손가락 크기(44px)로 — html{font-size:14px} 라 h-9 등 rem 유틸이 31.5px 로 줄어들기 때문에 px 로 강제한다. */
const TOUCH = "[&_button]:min-h-[44px] [&_a]:inline-flex [&_a]:min-h-[44px] [&_a]:items-center [&_input]:min-h-[44px] [&_select]:min-h-[44px]";

export function MobileCard({
  title,
  sub,
  badge,
  fields,
  actions,
  onClick,
  className,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  fields?: [label: string, value: React.ReactNode][];
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "rounded-[var(--r-md)] border border-[var(--bd)] bg-sf px-3 py-2.5 text-[12.5px]",
        clickable && "cursor-pointer hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-t" title={title}>
            {title}
          </div>
          {sub && <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-t3">{sub}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {fields && fields.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          {fields.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="whitespace-nowrap text-t3">{label}</dt>
              <dd className="min-w-0 truncate text-right tabular-nums text-t" title={typeof value === "string" ? value : undefined}>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {actions && (
        <div className={cn("mt-2.5 flex flex-wrap items-center justify-end gap-1.5", TOUCH)} onClick={stop} onKeyDown={stop}>
          {actions}
        </div>
      )}
      {children && (
        <div className={cn("mt-2.5 border-t border-[var(--bd)] pt-2.5", TOUCH)} onClick={stop} onKeyDown={stop}>
          {children}
        </div>
      )}
    </div>
  );
}

/** 표 셀 안의 긴 이름 — 한 줄로 자르고 전체 이름은 툴팁으로. 부가 표시는 이 아래 줄에 둔다. */
export function CellName({ children, max = 200, className }: { children: string; max?: number; className?: string }) {
  return (
    <span className={cn("block truncate font-medium text-t", className)} style={{ maxWidth: max }} title={children}>
      {children}
    </span>
  );
}
