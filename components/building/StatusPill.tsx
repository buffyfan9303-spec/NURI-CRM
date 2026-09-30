/**
 * 건물 상태 → Badge(아이콘+문구, 색만으로 말하지 않는다). 라벨은 building-types 의 단일 출처.
 * 세무 "파일 준비됨" 은 초록 금지(info) — 발행은 승인번호가 들어온 뒤에만 success(§4.12).
 */
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { PERIOD_STATUS_LABEL, TAX_ISSUE_STATUS_LABEL, type PeriodStatus, type RunStatus, type TaxIssueStatus } from "@/lib/domain/building-types";

const PERIOD_KIND: Record<PeriodStatus, BadgeKind> = { collecting: "info", draft: "info", review: "warning", approved: "success", finalized: "success", closed: "info" };
const RUN_KIND: Record<RunStatus, BadgeKind> = { draft: "info", approved: "success", void: "error" };
const RUN_LABEL: Record<RunStatus, string> = { draft: "임시 계산", approved: "확정됨", void: "취소됨" };
const TAX_KIND: Record<TaxIssueStatus, BadgeKind> = { blocked: "error", ready: "info", file_generated: "info", issued: "success", failed: "error" };
const TAX_SHORT: Record<TaxIssueStatus, string> = { blocked: "막힘", ready: "파일 생성 가능", file_generated: "파일 생성됨", issued: "발행 완료", failed: "실패" };

export function PeriodStatusPill({ status, className }: { status: PeriodStatus; className?: string }) {
  return <Badge kind={PERIOD_KIND[status]} className={className}>{PERIOD_STATUS_LABEL[status]}</Badge>;
}
export function RunStatusPill({ status, className }: { status: RunStatus; className?: string }) {
  return <Badge kind={RUN_KIND[status]} className={className}>{RUN_LABEL[status]}</Badge>;
}
/** short=true 면 표 안 짧은 문구, 아니면 라벨 전문(TAX_ISSUE_STATUS_LABEL). */
export function TaxStatusPill({ status, short = true, className }: { status: TaxIssueStatus; short?: boolean; className?: string }) {
  return <Badge kind={TAX_KIND[status]} className={className}>{short ? TAX_SHORT[status] : TAX_ISSUE_STATUS_LABEL[status]}</Badge>;
}
/** 행 상태(계산 결과): 정상 / 경고 / 오류. */
export function RowStatusPill({ level, className }: { level: "ok" | "warn" | "error"; className?: string }) {
  return level === "ok" ? <Badge kind="success" className={className}>정상</Badge> : level === "warn" ? <Badge kind="warning" className={className}>확인할 것</Badge> : <Badge kind="error" className={className}>수정 필요</Badge>;
}
