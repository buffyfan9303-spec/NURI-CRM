import { Spinner } from "./Spinner";

/** 로딩 중. 빈 화면(EmptyState)·오류(ErrorState)와 시각적으로 구분되는 전용 상태. */
export function LoadingState({ label = "불러오는 중…", rows }: { label?: string; /** 주면 스피너 대신 표 뼈대(shimmer) rows 줄을 그린다 — 목록 자리에서 CLS 없이 기다린다. */ rows?: number }) {
  if (rows && rows > 0) {
    return (
      <div className="flex flex-col gap-2.5 px-1 py-2" role="status" aria-live="polite" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-sf2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 animate-pulse rounded-[var(--r-xs)] bg-sf2" style={{ width: `${55 - (i % 3) * 10}%` }} />
              <div className="h-2.5 w-1/4 animate-pulse rounded-[var(--r-xs)] bg-sf2" />
            </div>
            <div className="h-5 w-14 animate-pulse rounded-full bg-sf2" />
          </div>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Spinner size={26} />
      <p className="text-[13px] text-t2">{label}</p>
    </div>
  );
}
