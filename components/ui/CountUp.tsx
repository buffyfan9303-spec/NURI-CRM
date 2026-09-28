"use client";

/**
 * KPI 숫자 카운트업 — Magic UI number-ticker(useSpring + textContent)를 이 앱 규칙에 맞게 손으로 옮겼다.
 * - 입력은 이미 포맷된 문자열("1,234" · "₩12,000" · "14:30" · "—")이다. 앞뒤 기호는 그대로 두고 첫 숫자 덩어리만
 *   0 → 값으로 600ms 올린다. 숫자가 없거나 시각(콜론)처럼 세면 안 되는 값은 그대로 그린다.
 * - 첫 렌더는 최종 문자열로 SSR 되므로 레이아웃 이동(CLS)이 없고, JS 가 붙은 뒤에만 잠깐 0 부터 오른다.
 * - prefers-reduced-motion 이면 애니메이션을 건너뛴다(useReducedMotion).
 * - 폭 고정은 호출부의 tabular-nums 가 맡는다.
 */
import * as React from "react";
import { animate, useReducedMotion } from "motion/react";

const NUM_RE = /\d[\d,]*(?:\.\d+)?/;

export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const m = NUM_RE.exec(value);
    if (!m || value.includes(":")) return;
    const target = Number(m[0].replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = (m[0].split(".")[1] ?? "").length;
    const grouped = m[0].includes(",");
    const fmt = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    const prefix = value.slice(0, m.index);
    const suffix = value.slice(m.index + m[0].length);
    const controls = animate(0, target, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        el.textContent = prefix + fmt.format(v) + suffix;
      },
      onComplete: () => {
        el.textContent = value;
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
