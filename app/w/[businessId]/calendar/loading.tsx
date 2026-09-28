/**
 * 이 라우트로 처음 진입할 때 Next가 자동으로 보여주는 로딩 상태(App Router Suspense fallback).
 *
 * §5.6 결함 수정: 예전엔 스피너 하나만 있어서 로딩 동안 날짜 격자 자체가 사라졌다(§11-4와
 * 같은 종류의 "화면 없음" 문제). 지금은 최종 월 보기와 같은 7×6 격자 뼈대를 먼저 그리고
 * 그 안의 일정 자리에만 옅은 placeholder를 얹는다 — 툴바·요일·오늘 표시는 즉시 자리를 잡는다.
 *
 * CLS(2026-09-28): 뼈대 툴바가 한 줄(61px)이라 실제 Toolbar(두 줄, 40/36px·터치 44px)로 바뀔 때
 * 격자 42칸이 통째로 52~64px 내려가 CLS 0.03~0.056 이 났다. 뼈대의 줄 수·높이를 Toolbar 와 같게
 * 맞춘다 — 여기 숫자를 바꾸면 components/calendar/Toolbar.tsx 도 같이 봐야 한다.
 */
const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];
const CELLS = Array.from({ length: 42 });
const ROW1 = "h-[40px] [@media(pointer:coarse)]:h-[44px]"; // ‹ › 오늘 | 제목 | 세그먼트(lg 40px) | 일정 등록
const ROW2 = "h-[36px] [@media(pointer:coarse)]:h-[44px]"; // 검색 · 담당자 · 상태 · 종류 칩
const box = "animate-pulse rounded-[var(--r-md)] bg-sf2";

export default function CalendarLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--bd)] bg-sf p-3">
        <div className={`flex items-center gap-2 ${ROW1}`}>
          <div className={`${box} h-[36px] w-[36px] [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]`} />
          <div className={`${box} h-[36px] w-[36px] [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]`} />
          <div className={`${box} h-[32px] w-[56px] [@media(pointer:coarse)]:h-[44px]`} />
          <div className="h-5 w-28 animate-pulse rounded bg-sf2" />
          <div className={`${box} ml-auto w-[176px] ${ROW1}`} />
          <div className={`${box} h-[32px] w-[104px] [@media(pointer:coarse)]:h-[44px]`} />
        </div>
        <div className={`hidden items-center gap-2 sm:flex ${ROW2}`}>
          <div className={`${box} w-[180px] ${ROW2}`} />
          <div className={`${box} w-[110px] ${ROW2}`} />
          <div className={`${box} w-[90px] ${ROW2}`} />
          <div className="h-6 w-14 animate-pulse rounded-full bg-sf2" />
          <div className="h-6 w-14 animate-pulse rounded-full bg-sf2" />
          <div className="h-6 w-14 animate-pulse rounded-full bg-sf2" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
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
                  <div className="h-[24px] w-[24px] animate-pulse rounded-full bg-sf2 [@media(pointer:coarse)]:h-[28px] [@media(pointer:coarse)]:w-[28px]" />
                  {idx % 5 === 0 && <div className="h-[24px] w-4/5 animate-pulse rounded-[var(--r-xs)] bg-sf2" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
