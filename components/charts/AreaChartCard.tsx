"use client";

import { useMemo, useRef, useState } from "react";
import { formatCount } from "@/lib/domain/home-charts";
import { formatKRW } from "@/lib/domain/money";

export interface AreaSeries {
  /** "amount" | "count" 등 — segmented control 값. */
  key: string;
  /** segmented 버튼 라벨("금액"/"건수"). */
  label: string;
  unit: "원" | "건" | string;
  points: { key: string; label: string; value: number }[];
}

function formatValue(v: number, unit: string): string {
  return unit === "원" ? formatKRW(v) : formatCount(v, unit);
}

const VW = 640;
const VH = 200;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 22;

/**
 * 중단 좌측 영역 차트. 얇은 수평 점선 격자만(세로 격자 없음), crosshair+툴팁,
 * <details> 표로 키보드/스크린리더 대체 조회를 제공한다(§5.2 "표 형태의 대체 조회").
 * points.length < 2면 그래프 대신 안내 문구 + 현재 값만 보여준다(빈 그래프를 채우려고
 * 수치를 만들지 않는다).
 */
export function AreaChartCard({
  title,
  description,
  series,
  insufficientNote = "추세를 보려면 데이터가 더 필요합니다.",
}: {
  title: string;
  description?: string;
  series: AreaSeries[];
  insufficientNote?: string;
}) {
  const [activeKey, setActiveKey] = useState<string>(series[0]?.key ?? "");
  const active = series.find((s) => s.key === activeKey) ?? series[0];
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // `?? []` 가 매 렌더 새 배열을 만들어 아래 useMemo 가 매번 다시 계산되던 것을 막는다.
  const points = useMemo(() => active?.points ?? [], [active]);
  const hasEnough = points.length >= 2;

  const geo = useMemo(() => {
    if (!hasEnough) return null;
    const values = points.map((p) => p.value);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const stepX = (VW - PAD_L - PAD_R) / (points.length - 1);
    const xy = points.map((p, i) => {
      const x = PAD_L + i * stepX;
      const y = PAD_T + (VH - PAD_T - PAD_B) * (1 - (p.value - min) / range);
      return { x, y, ...p };
    });
    const linePath = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${xy[xy.length - 1].x.toFixed(1)},${VH - PAD_B} L${xy[0].x.toFixed(1)},${VH - PAD_B} Z`;
    const gridYs = [0, 0.5, 1].map((f) => PAD_T + (VH - PAD_T - PAD_B) * f);
    const gridLabels = [max, (max + min) / 2, min];
    return { xy, linePath, areaPath, gridYs, gridLabels, stepX };
  }, [points, hasEnough]);

  function handleMove(clientX: number) {
    if (!svgRef.current || !geo) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * VW;
    let nearest = 0;
    let best = Infinity;
    geo.xy.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-t">{title}</h2>
          {description && <p className="mt-0.5 text-[12px] text-t3">{description}</p>}
        </div>
        {series.length > 1 && (
          <div className="flex shrink-0 rounded-[8px] bg-sf2 p-0.5 text-[12px]">
            {series.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setActiveKey(s.key);
                  setHover(null);
                }}
                aria-pressed={s.key === activeKey}
                className={
                  s.key === activeKey
                    ? "rounded-[6px] bg-sf px-3 py-1 font-medium text-t shadow-card"
                    : "rounded-[6px] px-3 py-1 text-t2 hover:text-t"
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasEnough ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-1 py-10">
          <p className="text-[12.5px] text-t2">{insufficientNote}</p>
          {points.length === 1 && (
            <p className="text-[20px] font-bold tabular-nums text-t">{formatValue(points[0].value, active.unit)}</p>
          )}
        </div>
      ) : (
        <>
          <div className="relative select-none">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              className="block w-full overflow-visible"
              // SVG는 빈 공간(fill 없는 영역)이 기본적으로 포인터 이벤트를 받지 않는다 —
              // 격자 사이 빈 곳에서 hover가 죽는 걸 막으려면 전체 뷰포트를 강제로 히트 타깃화한다.
              style={{ pointerEvents: "all" }}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${title} — ${active.label} 추이`}
              onMouseMove={(e) => handleMove(e.clientX)}
              onMouseLeave={() => setHover(null)}
              onTouchMove={(e) => e.touches[0] && handleMove(e.touches[0].clientX)}
              onTouchEnd={() => setHover(null)}
            >
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ch-1)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--ch-1)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* 얇은 수평 점선 격자만 — 진한 세로 격자 없음 */}
              {geo!.gridYs.map((y, i) => (
                <line
                  key={i}
                  x1={PAD_L}
                  x2={VW - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="var(--bd)"
                  strokeWidth={1}
                  strokeDasharray="2,3"
                />
              ))}
              <path d={geo!.areaPath} fill="url(#areaFill)" stroke="none" />
              <path d={geo!.linePath} fill="none" stroke="var(--ch-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {hover !== null && (
                <>
                  <line
                    x1={geo!.xy[hover].x}
                    x2={geo!.xy[hover].x}
                    y1={PAD_T}
                    y2={VH - PAD_B}
                    stroke="var(--t3)"
                    strokeWidth={1}
                    strokeDasharray="2,3"
                  />
                  <circle cx={geo!.xy[hover].x} cy={geo!.xy[hover].y} r={4} fill="var(--ch-1)" stroke="var(--sf)" strokeWidth={1.5} />
                </>
              )}
            </svg>
            {geo!.gridLabels.map((v, i) => (
              <span
                key={i}
                className="pointer-events-none absolute left-0 -translate-y-1/2 text-[10px] tabular-nums text-t3"
                style={{ top: `${(geo!.gridYs[i] / VH) * 100}%` }}
              >
                {formatValue(v, active.unit)}
              </span>
            ))}
            {hover !== null && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[8px] border border-[var(--bd)] bg-sf px-2.5 py-1.5 text-[11.5px] shadow-card"
                style={{
                  left: `${(geo!.xy[hover].x / VW) * 100}%`,
                  top: `${(geo!.xy[hover].y / VH) * 100}%`,
                  marginTop: -8,
                }}
              >
                <p className="text-t3">{geo!.xy[hover].label}</p>
                <p className="font-semibold tabular-nums text-t">{formatValue(geo!.xy[hover].value, active.unit)}</p>
              </div>
            )}
          </div>
          {/* 가로축 라벨: SVG(preserveAspectRatio=none) 안에 두면 폭에 따라 글자까지 축소돼 모바일에서 ~5px 가 된다.
              세로축 라벨처럼 HTML 로 두어 크기를 고정하고, 점이 많으면 6개 안팎만 보여 겹치지 않게 한다. */}
          <div className="relative mt-1 h-[16px]" aria-hidden>
            {geo!.xy.map((p, i, arr) => {
              const step = Math.max(1, Math.ceil(arr.length / 6));
              const last = i === arr.length - 1;
              if (i % step !== 0 && !last) return null;
              return (
                <span
                  key={i}
                  className={
                    "pointer-events-none absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-t3 " +
                    (i === 0 ? "" : last ? "-translate-x-full" : "-translate-x-1/2")
                  }
                  style={{ left: `${(p.x / VW) * 100}%` }}
                >
                  {p.label}
                </span>
              );
            })}
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer text-[11.5px] text-t3 hover:text-t2">표로 보기</summary>
            <table className="mt-1 w-full text-[12px]">
              <thead>
                <tr className="text-t3">
                  <th className="py-1 text-left font-normal">기간</th>
                  <th className="py-1 text-right font-normal">{active.label}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.key} className="border-t border-[var(--bd)]">
                    <td className="py-1 text-t2">{p.label}</td>
                    <td className="py-1 text-right tabular-nums text-t">{formatValue(p.value, active.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
