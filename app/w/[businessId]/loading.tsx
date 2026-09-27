/**
 * 작업공간 화면 이동 중 즉시 보이는 뼈대(App Router Suspense fallback).
 * 서버 응답(레이아웃 권한 확인 + 페이지 조회)이 올 때까지 클릭 후 무반응으로 보이던 것을 없앤다(2026-09-28 끊김 신고).
 * 캘린더처럼 전용 loading.tsx 가 있는 라우트는 그쪽이 우선한다.
 */
export default function WorkspaceLoading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-[var(--page-x)] sm:py-[var(--page-y)]" aria-busy="true" aria-label="불러오는 중">
      <div className="mb-5 h-7 w-40 animate-pulse rounded bg-sf2" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-[var(--r-lg)] bg-sf2" />
        ))}
      </div>
      <div className="mt-4 h-[280px] animate-pulse rounded-[var(--r-lg)] bg-sf2" />
    </div>
  );
}
