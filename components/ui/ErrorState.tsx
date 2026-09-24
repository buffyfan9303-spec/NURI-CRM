import { TriangleAlert } from "@/lib/icons";
import { Button } from "./Button";

/** 오류로 조회에 실패한 상태. 재시도 콜백을 반드시 노출한다. */
export function ErrorState({
  title = "불러오지 못했습니다.",
  description,
  onRetry,
  retrying,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-eb text-et">
        <TriangleAlert size={20} aria-hidden />
      </div>
      <p className="text-[14px] font-medium text-t">{title}</p>
      {description && <p className="max-w-[320px] text-[12.5px] leading-relaxed text-t2">{description}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying} className="mt-2">
          다시 시도
        </Button>
      )}
    </div>
  );
}
