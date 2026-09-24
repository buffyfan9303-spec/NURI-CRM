import Link from "next/link";
import { formatCount } from "@/lib/domain/home-charts";
import { formatKRW } from "@/lib/domain/money";

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  href?: string;
  /** 이 항목만 다른 단위를 쓸 때(자재 등 혼합 단위) — 없으면 차트 기본 unit을 쓴다. */
  unit?: string;
}

/**
 * 하단 우측 가로 막대. 단일 측정값 랭킹이라 1계열(범례 없음, 제목이 이름) — 계열색
 * 대신 고정 단일 색(ch-2)으로 통일한다. 값 직접 라벨 필수(단위 무관하게 항상 표시).
 * 순수 HTML/CSS로 그린다 — hover는 native title, 막대 끝 4px 라운드.
 */
export function HorizontalBarChart({
  title,
  description,
  items,
  unit = "건",
}: {
  title: string;
  description?: string;
  items: HBarItem[];
  unit?: "원" | "건" | string;
}) {
  const max = Math.max(...items.map((i) => i.value), 0);
  const formatVal = (v: number, itemUnit?: string) => {
    const u = itemUnit ?? unit;
    return u === "원" ? formatKRW(v) : formatCount(v, u);
  };

  return (
    <div className="flex flex-col">
      <h2 className="text-[14px] font-semibold text-t">{title}</h2>
      {description && <p className="mt-0.5 text-[12px] text-t3">{description}</p>}
      {items.length === 0 || max === 0 ? (
        <p className="py-6 text-[12.5px] text-t3">아직 데이터가 없습니다.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {items.map((it) => {
            const pct = Math.max((it.value / max) * 100, 3);
            const row = (
              <div className="flex items-center gap-2.5" title={`${it.label}: ${formatVal(it.value, it.unit)}`}>
                <span className="w-[92px] shrink-0 text-right text-[12px] leading-tight text-t2" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {it.label}
                </span>
                <span className="relative h-5 min-w-0 flex-1 rounded-[4px] bg-sf2">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[4px]"
                    style={{ width: `${pct}%`, background: "var(--ch-2)" }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-[12px] font-medium tabular-nums text-t">{formatVal(it.value, it.unit)}</span>
              </div>
            );
            return (
              <li key={it.key}>
                {it.href ? (
                  <Link
                    href={it.href}
                    className="block rounded-[6px] hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
