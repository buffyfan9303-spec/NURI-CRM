"use client";

/**
 * KPI 카드 하단의 작은 추이선. 장식용 미니 차트라 축·범례가 없다(1계열은 범례 없음 —
 * 제목이 이름, dataviz §5). data.length < 2면 아무것도 그리지 않는다(가짜 추세선 금지).
 * hover 시 native title로 값 목록을 보여준다(작은 크기라 crosshair는 과하다).
 */
export function Sparkline({
  data,
  color = "var(--ch-1)",
  width = 120,
  height = 34,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padY = 3;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      preserveAspectRatio="none"
      role="img"
      aria-label={`최근 추이: ${data.join(", ")}`}
    >
      <path d={areaPath} fill={color} fillOpacity={0.14} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
