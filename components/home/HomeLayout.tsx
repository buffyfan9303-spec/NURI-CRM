/**
 * 업종 홈 공통 골격 — §5.2: 12열 기준, 업무 8열 + 보조 4열. max-width 중앙 제한 없음
 * (1920px에서도 실제 가용 폭을 쓴다 — 페이지 쪽에서 셸의 남은 폭을 그대로 채운다).
 */
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function HomeLayout({
  title,
  subtitle,
  actions,
  metrics,
  primaryTitle,
  primary,
  secondary,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  metrics?: ReactNode;
  primaryTitle: string;
  primary: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold text-t">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-t3">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      {metrics}

      {/* items-start: 그리드 기본값(stretch)이면 짧은 쪽 카드가 옆 칼럼 높이까지 늘어나
          빈 공간을 남긴다(§5.1 결함 D1). 각 칼럼이 자기 콘텐츠 높이만큼만 차지하게 한다. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <Card className="p-4 lg:col-span-8">
          <h2 className="mb-2 text-[14px] font-semibold text-t">{primaryTitle}</h2>
          {primary}
        </Card>
        <div className="flex flex-col gap-4 lg:col-span-4">{secondary}</div>
      </div>
    </div>
  );
}

/**
 * 정상 빈 홈.
 *
 * 레퍼런스 §11: "빈 사업장은 **KPI 값0 또는 의미 있는 미설정, 차트의 구조·축/안내**,
 * 달력 날짜, **첫 등록 동작**을 제공한다."
 *
 * 예전에는 여기서 카드 하나로 대시보드 전체를 대체했다. 그러면 사용자가
 * "이 화면이 원래 무엇을 보여주는지" 알 수 없고, 데이터가 생겼을 때 화면이
 * 통째로 바뀌어 낯설어진다. 그래서 **골격은 유지하고 값만 0/안내**로 둔다.
 *
 * `metrics` 를 주면 KPI 줄을 그대로 살리고, 없으면 라벨만 가진 0 카드를 만든다.
 * 같은 높이 빈 카드를 의미 없이 늘어놓지는 않는다(§5.5) — 보조 영역은 접는다.
 */
export function HomeEmpty({
  title,
  message,
  description,
  actions,
  metricLabels,
  metrics,
  structureHint,
}: {
  title: string;
  message: string;
  description?: string;
  actions?: ReactNode;
  /** KPI 자리에 보여줄 지표 이름들. 값은 0으로 표시된다. */
  metricLabels?: string[];
  /** 이미 만들어진 KPI 노드가 있으면 그대로 쓴다(0 값이어도 구조가 남는다). */
  metrics?: ReactNode;
  /** 주영역에 무엇이 들어올 자리인지 알려주는 한 줄. */
  structureHint?: string;
}) {
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold leading-tight text-t">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {/* KPI 구조 유지 — 값은 0. 가짜 수치가 아니라 "아직 없음"을 정확히 말한다. */}
      {metrics ??
        (metricLabels?.length ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {metricLabels.map((label) => (
              <Card key={label} className="flex flex-col gap-1 p-4">
                <span className="text-[12px] text-t3">{label}</span>
                <span className="text-[26px] font-bold leading-none tabular-nums text-t3">0</span>
              </Card>
            ))}
          </div>
        ) : null)}

      <Card className="flex flex-col items-start gap-2 p-6">
        <p className="text-[14px] font-medium text-t">{message}</p>
        {description && <p className="text-[12.5px] leading-relaxed text-t2">{description}</p>}
        {structureHint && (
          <p className="mt-1 text-[12px] text-t3">{structureHint}</p>
        )}
      </Card>
    </div>
  );
}
