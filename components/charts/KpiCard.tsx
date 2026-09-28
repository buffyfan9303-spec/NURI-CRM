"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { CountUp } from "@/components/ui/CountUp";
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
  /** 숫자 카운트업. 공장 홈은 끈다(공장 화면 동작은 사용자 별도 주문 전까지 변경 금지). */
  countUp?: boolean;
}

/** 증감 pill — 방향(▲▼)과 색을 같이 준다. 색만으로 좋고 나쁨을 말하지 않는다. */
function deltaClass(deltaPct: number | null, deltaGood: boolean | null): string {
  if (deltaPct === null) return "text-t3";
  if (deltaGood === null) return "bg-sf2 text-t2";
  const isUp = deltaPct >= 0;
  return isUp === deltaGood ? "bg-okb text-okt" : "bg-eb text-et";
}

/**
 * KPI 카드(2026-09-28 디자인 강화): 라벨 12px → 값 28px/700/-0.02em 카운트업 → 증감 pill → 스파크라인.
 * 링크면 hover 에 2단계 그림자로 1px 들린다. 등장은 KpiRow 가 40ms 간격으로 순서대로 띄운다.
 */
export function KpiCard({ label, value, href, icon, tintColor, trend, emptyNote, countUp = true }: KpiCardProps) {
  const hasTrend = !!trend && trend.points.length >= 2;
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf p-4 shadow-card",
        href &&
          "transition-[box-shadow,transform,border-color] duration-2 ease-out group-hover:-translate-y-px group-hover:border-[var(--bd-strong)] group-hover:shadow-raised motion-reduce:group-hover:translate-y-0"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-t2">{label}</p>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: tintColor }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      {/* ⚠ text-[var(--x)] 는 Tailwind 가 색으로 해석해 font-size 가 안 먹는다 — length: 힌트 필수. */}
      <p className="mt-1.5 text-[length:var(--fs-kpi)] font-bold leading-none tracking-[var(--tr-tight)] tabular-nums text-t">
        {countUp ? <CountUp value={value} /> : value}
      </p>
      <div className="mt-2 flex min-h-[18px] items-center text-[12px]">
        {trend && trend.deltaPct !== null ? (
          <span className={cn("inline-flex items-center rounded-full px-1.5 py-[1px] font-semibold tabular-nums", deltaClass(trend.deltaPct, trend.deltaGood))}>
            {trend.deltaPct >= 0 ? "▲" : "▼"}&nbsp;{Math.abs(trend.deltaPct)}%
          </span>
        ) : (
          <span className="truncate text-t3">{emptyNote ?? "비교 기간 데이터 없음"}</span>
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
      className="group block h-full rounded-[var(--r-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}

/**
 * 4개 동일 폭, 가로 간격 14px. 1024px 이하 2×2(§3).
 * 등장 모션(animate): 각 카드가 40ms 간격으로 6px 아래에서 올라온다(240ms, globals.css `rise`).
 * JS 가 아니라 CSS 애니메이션이라 서버 HTML 첫 paint 부터 동작하고(하이드레이션 전 빈 카드 없음),
 * reduced-motion 은 전역 규칙(duration 0.01ms·delay 0)이 끝 상태로 바로 보낸다. opacity/transform 만 쓰므로 CLS 없음.
 * animate 를 켠 4업종 홈만 해당 — 공장 홈은 기본값(false)이라 레이아웃·동작이 그대로다.
 */
export function KpiRow({ children, animate = false }: { children: ReactNode; animate?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4 [&>*]:h-full">
      {animate && Array.isArray(children)
        ? children.map((c, i) => (
            <div key={i} className="h-full animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              {c}
            </div>
          ))
        : children}
    </div>
  );
}
