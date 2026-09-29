/**
 * 계산 결과의 차단(role=alert)·경고(role=status) 목록(§4.6). 각 항목은 문장 + 이동 링크(호실·항목·입력 화면).
 * 코드 → 어디로 가야 고치는지는 여기 한 표(서버 명세 §3 차단/경고 코드).
 */
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "@/lib/icons";
import { STATUS_ICON } from "@/lib/icons-map";
import type { RunIssue } from "@/lib/domain/building-types";
import { cn } from "@/lib/utils/cn";
import { fmtMoney } from "./Money";

/** 코드별 이동 화면(base 기준 nav path). 없으면 링크 없이 문장만. */
const FIX_NAV: Record<string, { path: string; label: string }> = {
  no_units: { path: "units", label: "호실 등록으로" },
  no_charge_types: { path: "charges", label: "항목 정하기로" },
  vacant_no_payer: { path: "units", label: "호실에서 고치기" },
  missing_reading: { path: "meters", label: "계량기 숫자 적으러" },
  no_meter: { path: "units", label: "호실 계량기로" },
  no_expense: { path: "expenses", label: "비용 입력으로" },
  zero_denominator: { path: "charges", label: "항목 정하기로" },
  rate_missing: { path: "charges", label: "항목 정하기로" },
  association_payer: { path: "charges", label: "항목 정하기로" },
  feature_off: { path: "settings", label: "선택 기능으로" },
  late_terms_unapproved: { path: "units", label: "계약 보러 가기" },
  big_change: { path: "billing", label: "표에서 확인" },
  // 0033
  partial_month_contract: { path: "units", label: "계약 기간 맞추기" },
  partial_month_unit: { path: "units", label: "호실 확인" },
  owner_payer_excluded: { path: "charges", label: "항목 정하기로" },
  expense_excluded: { path: "expenses", label: "비용 입력으로" },
  direct_excluded: { path: "expenses", label: "비용 입력으로" },
  other_party_unpaid: { path: "receivables", label: "못 받은 돈으로" },
  already_approved: { path: "billing", label: "" },
};

/** 금액·건수 키는 revenue.read 없으면 뷰가 지운다(0033) — 있을 때만 붙인다. */
function issueText(i: RunIssue): string {
  const who = i.unit_no ? `${i.unit_no}호 ` : "";
  const what = i.name ? `${i.name} ` : "";
  if (i.code === "big_change" && i.prev != null && i.current != null) return `${who}지난달 ${fmtMoney(i.prev)} → 이번 달 ${fmtMoney(i.current)} (절반 넘게 달라짐)`;
  const extra = [i.amount != null ? fmtMoney(i.amount) : null, i.count != null ? `${i.count}건` : null].filter(Boolean).join(" · ");
  return `${who}${what}${i.message}${extra ? ` (${extra})` : ""}`.trim();
}

export function BlockWarnList({
  blocks,
  warnings,
  base,
  qs = "",
  className,
}: {
  blocks: RunIssue[];
  warnings: RunIssue[];
  /** `/w/{businessId}` */
  base: string;
  /** "?b=..&p=.." */
  qs?: string;
  className?: string;
}) {
  if (blocks.length === 0 && warnings.length === 0) return null;
  const Err = STATUS_ICON.error;
  const Warn = STATUS_ICON.warn;
  const render = (list: RunIssue[], kind: "error" | "warn") => (
    <ul className="flex flex-col gap-1.5">
      {list.map((i, n) => {
        const fix = FIX_NAV[i.code];
        const Icon = kind === "error" ? Err : Warn;
        return (
          <li key={`${i.code}-${i.unit_id ?? ""}-${i.charge_type_id ?? ""}-${n}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex min-w-0 flex-1 items-start gap-2 break-keep text-[length:var(--fs-body)] text-t">
              <Icon size={18} aria-hidden className={cn("mt-[3px] shrink-0", kind === "error" ? "text-et" : "text-wt")} />
              <span>{issueText(i)}</span>
            </span>
            {fix && fix.path !== "billing" && fix.label && (
              <Link href={`${base}/${fix.path}${qs}`} className="inline-flex min-h-[44px] items-center gap-0.5 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] font-medium text-[var(--accent-ink)] hover:bg-sf2">
                {fix.label} <ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {blocks.length > 0 && (
        <section role="alert" className="rounded-[var(--r-md)] border-l-[3px] border-l-[var(--et)] bg-eb/60 px-4 py-3">
          <h3 className="mb-1.5 text-[length:var(--fs-body)] font-semibold text-et">고쳐야 할 것 {blocks.length}건 — 고치기 전에는 금액을 확정할 수 없습니다</h3>
          {render(blocks, "error")}
        </section>
      )}
      {warnings.length > 0 && (
        <section role="status" className="rounded-[var(--r-md)] border-l-[3px] border-l-[var(--wt)] bg-wb/60 px-4 py-3">
          <h3 className="mb-1.5 text-[length:var(--fs-body)] font-semibold text-wt">확인할 것 {warnings.length}건 — 보고 맞으면 그대로 진행해도 됩니다</h3>
          {render(warnings, "warn")}
        </section>
      )}
    </div>
  );
}
