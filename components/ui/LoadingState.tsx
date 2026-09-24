import { Spinner } from "./Spinner";

/** 로딩 중. 빈 화면(EmptyState)·오류(ErrorState)와 시각적으로 구분되는 전용 상태. */
export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Spinner size={26} />
      <p className="text-[13px] text-t2">{label}</p>
    </div>
  );
}
