/**
 * 이 라우트로 처음 진입할 때 Next가 자동으로 보여주는 로딩 상태(App Router Suspense fallback).
 *
 * §5.6 결함 수정: 예전엔 스피너 하나만 있어서 로딩 동안 날짜 격자 자체가 사라졌다(§11-4와
 * 같은 종류의 "화면 없음" 문제). 지금은 최종 월 보기와 같은 7×6 격자 뼈대를 먼저 그리고
 * 그 안의 일정 자리에만 옅은 placeholder를 얹는다 — 툴바·요일·오늘 표시는 즉시 자리를 잡는다.
 */
const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];
const CELLS = Array.from({ length: 42 });

export default function CalendarLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--bd)] bg-sf p-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 animate-pulse rounded-[var(--r-md)] bg-sf2" />
          <div className="h-9 w-9 animate-pulse rounded-[var(--r-md)] bg-sf2" />
          <div className="h-8 w-16 animate-pulse rounded-[var(--r-md)] bg-sf2" />
          <div className="h-5 w-28 animate-pulse rounded bg-sf2" />
          <div className="ml-auto h-8 w-28 animate-pulse rounded-[var(--r-md)] bg-sf2" />
        </div>
      </div>

      <div className="flex h-full flex-col">
        <div className="grid grid-cols-7 border-b border-[var(--bd)] text-center text-[11.5px] font-medium text-t3">
          {WEEKDAY_HEADERS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 grid-rows-6">
          {CELLS.map((_, idx) => (
            <div key={idx} className="flex min-h-[92px] flex-col gap-1 border-b border-r border-[var(--bd)] p-1.5">
              <div className="h-6 w-6 animate-pulse rounded-full bg-sf2" />
              {idx % 5 === 0 && <div className="h-4 w-4/5 animate-pulse rounded bg-sf2" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
