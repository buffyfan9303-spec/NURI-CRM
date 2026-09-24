import * as React from "react";
import { CircleAlert } from "@/lib/icons";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { KIND_LABEL, type StagedScan, type ScanMode } from "@/lib/scan/types";
import { getStatusWarning } from "@/lib/scan/validate";

export type ScanOutcome =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "duplicate"; code: string }
  | { type: "result"; data: StagedScan };

/**
 * 스캔 1건의 결과. "정상 빈 결과(not_found)"·"오류"·"텍스트"·"찾음"을 서로 다른 색·문구로 보여준다
 * (계약 §5-5: 오류·권한부족·정상 빈 결과는 서로 다른 3가지 — 빈 배열/모호한 문구로 뭉개지 않는다).
 */
export function ResultCard({ outcome, mode }: { outcome: ScanOutcome | null; mode: ScanMode }) {
  if (!outcome) {
    return <p className="px-1 py-2 text-[12.5px] text-t3">스캔하거나 코드를 입력하면 결과가 여기 표시됩니다.</p>;
  }

  if (outcome.type === "loading") {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-[12.5px] text-t2">
        <Spinner size={14} />
        조회하는 중…
      </div>
    );
  }

  if (outcome.type === "duplicate") {
    return (
      <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-ib px-3.5 py-2.5 text-[12.5px] text-it">
        <Badge kind="info">이미 읽음</Badge>
        <span className="font-mono text-[11.5px]">{outcome.code}</span>
        <span>방금 스캔한 코드입니다. 잠시 후 다시 스캔하면 새로 처리됩니다.</span>
      </div>
    );
  }

  if (outcome.type === "error") {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-eb px-3.5 py-2.5 text-[12.5px] text-et">
        <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
        <span>{outcome.message}</span>
      </div>
    );
  }

  const r = outcome.data;

  if (r.kind === "not_found") {
    return (
      <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3.5 py-2.5 text-[12.5px] text-t2">
        <Badge kind="info">없는 코드</Badge>
        <span>이 사업장에 등록된 코드가 아닙니다.</span>
      </div>
    );
  }

  if (r.kind === "text") {
    const isUrl = Boolean((r.extra as { is_url?: boolean }).is_url);
    return (
      <div className="flex flex-col gap-1 rounded-[var(--r-md)] border border-[var(--bd)] bg-ib px-3.5 py-2.5 text-[12.5px] text-it">
        <div className="flex items-center gap-2">
          <Badge kind="info">텍스트</Badge>
          <span className="break-all font-mono text-[11.5px]">{r.label}</span>
        </div>
        {isUrl && <span>URL 형태입니다. 자동으로 열지 않았습니다 — 필요하면 직접 복사해 사용하세요.</span>}
      </div>
    );
  }

  // CP-230: 서버가 현재 모드에 맞지 않는다고 거부한 항목 — 담기지 않았다(r.staged는 false).
  if (r.rejected === "mode_mismatch") {
    return (
      <div className="flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--bd)] bg-eb px-3.5 py-2.5 text-[12.5px] text-et">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge kind="error">이 모드에 맞지 않음</Badge>
          <span className="font-semibold">{r.label}</span>
        </div>
        <span>&ldquo;{KIND_LABEL[r.kind]}&rdquo;은 현재 스캔 모드에 담을 수 없습니다. 담지 않고 건너뛰었습니다 — 모드를 바꾸거나 다른 코드를 스캔하세요.</span>
      </div>
    );
  }

  const warning = getStatusWarning(mode, r.kind, r.status);
  const badgeKind: BadgeKind = warning ? "warning" : "success";

  return (
    <div className={`flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--bd)] px-3.5 py-2.5 text-[12.5px] ${warning ? "bg-wb text-wt" : "bg-okb text-okt"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge kind={badgeKind}>{r.staged ? "목록에 담김" : KIND_LABEL[r.kind]}</Badge>
        <span className="font-semibold">{r.label}</span>
        {r.status && <span className="rounded-[6px] bg-sf2 px-1.5 py-0.5 text-[11px] text-t2">{r.status}</span>}
      </div>
      {warning && <span>{warning}</span>}
    </div>
  );
}
