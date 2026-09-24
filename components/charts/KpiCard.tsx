import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "./Sparkline";

export interface KpiTrend {
  /** 실제 값(최소 2개). 2개 미만이면 호출부가 아예 trend를 넘기지 않는다(가짜 추세선 금지). */
  points: number[];
  /** null이면 증감을 표시하지 않는다(기준값 0 등 — 무한대 증감률 금지). */
  deltaPct: number | null;
  /** true=증가가 좋음, false=증가가 나쁨, null=중립(방향 색 없음, 화살표만). */
  deltaGood: boolean | null;
  /** 스파크라인 선 색(차트 팔레트 var(--ch-N)). */
  color: string;
}

export interface KpiCardProps {
  label: string;
  /** 이미 포맷된 문자열(정수, tabular-nums로 렌더). */
  value: string;
  href?: string;
  icon: ReactNode;
  /** 아이콘 타일 배경(연한 색) — 계열색과 별개로 카드 의미에 대응하는 장식용. */
  tintColor: string;
  trend?: KpiTrend;
  /** trend가 없을 때 보여줄 보조 문구(예: "비교 기간 데이터 없음"). */
  emptyNote?: string;
}

function deltaToneClass(deltaPct: number | null, deltaGood: boolean | null): string {
  if (deltaPct === null) return "text-t3";
  if (deltaGood === null) return "text-t2";
  const isUp = deltaPct >= 0;
  return isUp === deltaGood ? "text-okt" : "text-et";
}

export function KpiCard({ label, value, href, icon, tintColor, trend, emptyNote }: KpiCardProps) {
  const hasTrend = !!trend && trend.points.length >= 2;
  const inner = (
    <div
      className={cn(
        "flex flex-col rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf p-4 shadow-card",
        href && "transition-colors hover:bg-sf2"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] text-t2">{label}</p>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: tintColor }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[27px] font-bold leading-none tabular-nums text-t">{value}</p>
      <div className="mt-2 min-h-[18px] text-[12px]">
        {trend && trend.deltaPct !== null ? (
          <span className={cn("font-medium tabular-nums", deltaToneClass(trend.deltaPct, trend.deltaGood))}>
            {trend.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(trend.deltaPct)}%
          </span>
        ) : (
          <span className="text-t3">{emptyNote ?? "비교 기간 데이터 없음"}</span>
        )}
      </div>
      {hasTrend && (
        <div className="mt-2 h-[34px]">
          <Sparkline data={trend!.points} color={trend!.color} />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-[var(--r-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** 4개 동일 폭, 가로 간격 14px. 1024px 이하 2×2(§3). */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{children}</div>;
}
