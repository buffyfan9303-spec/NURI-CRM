import Link from "next/link";
import { chartColor } from "./colors";
import { formatCount } from "@/lib/domain/home-charts";
import type { DistributionSlice } from "@/lib/domain/home-charts";

export interface DonutSlice extends DistributionSlice {
  href?: string;
}

const SIZE = 140;
const STROKE = 32;
const GAP = 3; // 인접 채움 사이 표면 간격(px, 원 둘레 기준)

/**
 * 중단 우측 도넛. 조각별 <title>로 hover 툴팁, 범례 행은 이름+우측정렬 수치를
 * 항상 같이 보여준다(§5 "값·라벨은 색만으로 식별하지 않는다" — --ch-3 황토 대비 규칙 포함).
 * total===0이면 빈 ring + 0건 안내만 보여준다(비율 조각을 임의로 만들지 않는다).
 */
export function DonutChart({
  title,
  description,
  slices,
  total,
  unit = "건",
}: {
  title: string;
  description?: string;
  slices: DonutSlice[];
  total: number;
  unit?: string;
}) {
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-[14px] font-semibold text-t">{title}</h2>
      {description && <p className="mt-0.5 text-[12px] text-t3">{description}</p>}

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--bd)" strokeWidth={STROKE} />
          </svg>
          <p className="text-[12.5px] text-t3">아직 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center gap-4">
          <div className="relative">
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`${title} 분포, 전체 ${formatCount(total, unit)}`}
            >
              <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                {slices.map((s) => {
                  const len = (s.value / total) * c;
                  const visible = Math.max(len - GAP, 0.001);
                  const dashoffset = -cumulative;
                  cumulative += len;
                  return (
                    <circle
                      key={s.key}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={r}
                      fill="none"
                      stroke={chartColor(s.colorIndex)}
                      strokeWidth={STROKE}
                      strokeDasharray={`${visible} ${c - visible}`}
                      strokeDashoffset={dashoffset}
                      strokeLinecap="butt"
                    >
                      {/* 서버/클라 하이드레이션 불일치 방지: SVG <title>은 자식 표현식을 여러 줄로
                          나누면 공백 텍스트 노드 취급이 갈려 mismatch가 난다 — 문자열 하나로 합친다. */}
                      <title>{`${s.label}: ${formatCount(s.value, unit)}`}</title>
                    </circle>
                  );
                })}
              </g>
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-bold tabular-nums text-t">{formatCount(total, "")}</span>
              <span className="text-[11px] text-t3">전체 {unit}</span>
            </div>
          </div>
          <ul className="flex w-full flex-col gap-1.5">
            {slices.map((s) => {
              const row = (
                <span className="flex items-center gap-2 rounded-[6px] px-1 py-0.5 text-[12.5px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: chartColor(s.colorIndex) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-t2">{s.label}</span>
                  <span className="shrink-0 tabular-nums font-medium text-t">{formatCount(s.value, unit)}</span>
                </span>
              );
              return (
                <li key={s.key}>
                  {s.href ? (
                    <Link
                      href={s.href}
                      className="block hover:bg-sf2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
        </div>
      )}
    </div>
  );
}
