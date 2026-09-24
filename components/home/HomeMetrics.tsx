/**
 * 홈 상단 지표 줄(3–4개). §5.5: 숫자를 누르면 같은 조건의 목록으로 이동한다.
 * count===0이면 href가 있어도 항상 neutral 톤으로 그린다 — 위험이 없는데 빨강/주황으로
 * 보이면 "지금 봐야 할 예외"라는 신호가 무뎌진다.
 */
import Link from "next/link";
import type { HomeMetric } from "@/lib/domain/home";
import { cn } from "@/lib/utils/cn";

const TONE_CLASS: Record<NonNullable<HomeMetric["tone"]>, string> = {
  neutral: "text-t",
  warn: "text-wt",
  alert: "text-et",
};

export function HomeMetrics({ metrics }: { metrics: HomeMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map((m) => {
        const tone = m.count === 0 ? "neutral" : (m.tone ?? "neutral");
        const inner = (
          <>
            <p className="text-[12px] text-t2">{m.label}</p>
            <p className={cn("mt-1 text-[28px] font-bold leading-none tabular-nums", TONE_CLASS[tone])}>
              {m.count}
            </p>
          </>
        );
        const base = "block rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf px-4 py-3 shadow-card";
        return m.href ? (
          <Link
            key={m.key}
            href={m.href}
            className={cn(base, "transition-colors hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]")}
          >
            {inner}
          </Link>
        ) : (
          <div key={m.key} className={base}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
