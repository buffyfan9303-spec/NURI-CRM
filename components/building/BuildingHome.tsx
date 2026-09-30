/**
 * 건물 관리비 홈 = 이번 달 할 일(§4.1). 서버 컴포넌트.
 * 5단계 표(검침 → 비용 → 계산 → 승인 → 명세서) + 우측 "n / 5 완료" 큰 숫자 + 주의할 항목.
 * 아파트너식 아이콘 타일은 쓰지 않는다 — 순서·남은 건수·막힌 이유가 한 줄에 있어야 한다.
 */
import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { RetryButton } from "@/components/rental/listkit";
import { ChevronRight } from "@/lib/icons";
import { STATUS_ICON } from "@/lib/icons-map";
import type { TodoSummary } from "@/lib/domain/building-types";
import type { BuildingContext } from "./context";
import { BuildingPeriodBar } from "./BuildingPeriodBar";
import { StepCard, LinkButton, type Step } from "./StepCard";
import { fmtMoney } from "./Money";
import { periodLabel } from "./period";

export function buildSteps(t: TodoSummary, base: string, qs: string): Step[] {
  const approved = t.status === "approved" || t.status === "finalized" || t.status === "closed";
  const metersDone = t.meters_total === 0 || t.meters_read >= t.meters_total;
  const expensesDone = t.expense_charge_types === 0 || t.expense_charge_types_filled >= t.expense_charge_types;
  const calcDone = !!t.run && t.run.blocks === 0;
  const sendDone = approved && t.bills > 0 && t.delivered >= t.bills;
  const raw: Omit<Step, "state">[] = [
    {
      title: "검침값 입력",
      detail: t.meters_total === 0 ? "계량기가 없습니다(호실 상세에서 추가)" : metersDone ? `완료 ${t.meters_read}/${t.meters_total}개` : `${t.meters_total - t.meters_read}개 남음 · ${t.meters_read}/${t.meters_total}`,
      cta: { label: "검침값 입력", href: `${base}/meters${qs}` }, href: `${base}/meters${qs}`,
    },
    {
      title: "비용 입력",
      detail: t.expense_charge_types === 0 ? "매달 비용을 적는 항목이 없습니다" : expensesDone ? `완료 ${t.expense_charge_types_filled}건` : `${t.expense_charge_types - t.expense_charge_types_filled}개 항목의 비용을 아직 입력하지 않았습니다`,
      cta: { label: "비용 입력", href: `${base}/expenses${qs}` }, href: `${base}/expenses${qs}`,
    },
    {
      title: "관리비 계산",
      detail: !t.run ? "검침값·비용을 다 적으면 계산할 수 있습니다" : t.run.blocks > 0 ? `수정할 사항 ${t.run.blocks}건 · 확인할 것 ${t.run.warnings}건 — 수정한 뒤 다시 계산` : `완료 · ${t.bills}호실${t.run.warnings > 0 ? ` · 확인할 것 ${t.run.warnings}건` : ""}`,
      cta: { label: t.run && t.run.blocks > 0 ? "수정 후 다시 계산" : "관리비 계산", href: `${base}/billing${qs}` }, href: `${base}/billing${qs}`,
    },
    {
      title: "이번 달 금액 확정",
      detail: approved ? `${periodLabel(t.period)} 확정됨${t.pending_corrections > 0 ? ` · 정정 금액 ${t.pending_corrections}건 승인 대기` : ""}` : calcDone ? "표에서 금액을 보고 확정하세요(계산한 사람이 아닌 다른 담당자)" : "계산을 마친 뒤 할 수 있음",
      cta: { label: "이번 달 금액 확정", href: `${base}/billing${qs}` }, href: `${base}/billing${qs}`,
    },
    {
      title: "명세서 발송",
      detail: sendDone ? `완료 ${t.delivered}/${t.bills}호실` : approved ? `${t.bills - t.delivered}호실 남음 · ${t.delivered}/${t.bills}` : "금액 확정 뒤 할 수 있음",
      cta: { label: "명세서 발송", href: `${base}/statements${qs}` }, href: `${base}/statements${qs}`,
    },
  ];
  const done = [metersDone, expensesDone, calcDone, approved, sendDone];
  const gate = [true, true, true, calcDone, approved]; // 이 단계에 들어갈 수 있는가
  const firstOpen = done.findIndex((d) => !d);
  return raw.map((s, i) => ({
    ...s,
    state: done[i] ? "done" : !gate[i] ? "blocked" : i === firstOpen ? "current" : "todo",
    cta: i === firstOpen && gate[i] ? s.cta : undefined,
  }));
}

export function BuildingHome({
  base,
  tz,
  ctx,
  todo,
  lateFeeOn = false,
}: {
  base: string;
  tz: string;
  ctx: BuildingContext;
  todo: { ok: true; data: TodoSummary } | { ok: false; message: string } | null;
  /** 연체료 기능 스위치. 꺼져 있으면 연체 문구를 숨긴다. */
  lateFeeOn?: boolean;
}) {
  const bar = (
    <BuildingPeriodBar buildings={ctx.buildings} buildingId={ctx.building?.id ?? null} period={ctx.period} tz={tz} status={ctx.periodRow?.status ?? (todo?.ok ? todo.data.status : null)} />
  );
  if (todo && !todo.ok) {
    return (
      <PageBody>
        {ctx.building && bar}
        <PageHeader title="이번 달 할 일" />
        <Card><ErrorState title="할 일을 불러오지 못했습니다." description={todo?.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card>
      </PageBody>
    );
  }
  if (!ctx.building || !todo) {
    return (
      <PageBody>
        <PageHeader title="이번 달 할 일" />
        <Card><EmptyState title="아직 건물이 없습니다." description="건물을 먼저 등록하면 호실·검침값·관리비 계산을 시작할 수 있습니다." action={<LinkButton href={`${base}/units`} size="md">건물 등록하기</LinkButton>} /></Card>
      </PageBody>
    );
  }
  const t = todo.data;
  if (t.units === 0) {
    return (
      <PageBody>
        {bar}
        <PageHeader title="이번 달 할 일" />
        <Card><EmptyState title="호실을 먼저 등록하세요." description="호실이 있어야 검침값·비용·관리비 계산을 할 수 있습니다. 엑셀로 한꺼번에 넣거나 한 호실씩 넣으세요." action={<LinkButton href={`${base}/units${ctx.qs}`} size="md">호실 등록하기</LinkButton>} /></Card>
      </PageBody>
    );
  }
  const steps = buildSteps(t, base, ctx.qs);
  const doneCount = steps.filter((s) => s.state === "done").length;
  const Warn = STATUS_ICON.warn;
  const attention: { text: string; href: string; label: string }[] = [];
  // 0033: 정정은 초안으로 만들어지고 다른 담당자가 승인해야 채권·크레딧이 생긴다.
  if (t.pending_corrections > 0) attention.push({ text: `확정 기다리는 정정 금액 ${t.pending_corrections}건 — 정정한 사람이 아닌 다른 담당자가 확정해야 반영됩니다`, href: `${base}/billing${ctx.qs}`, label: "관리비 계산·확정으로" });
  if (lateFeeOn && t.late_terms_unapproved > 0) attention.push({ text: `연체료 조건을 확정하지 않은 계약 ${t.late_terms_unapproved}건 — 연체료가 0원으로 계산됩니다`, href: `${base}/units${ctx.qs}`, label: "계약 보러 가기" });
  if (t.tax_unapproved_charge_types > 0) attention.push({ text: `부가세 확인을 받지 않은 항목 ${t.tax_unapproved_charge_types}개`, href: `${base}/charges${ctx.qs}`, label: "항목 설정으로" });
  if (t.unallocated_payments > 0) attention.push({ text: `호실을 찾지 못한 입금 ${t.unallocated_payments}건`, href: `${base}/payments${ctx.qs}`, label: "수납 확인으로" });
  if (t.tax_blocked > 0) attention.push({ text: `세금계산서 발행이 막힌 대상 ${t.tax_blocked}건`, href: `${base}/tax${ctx.qs}`, label: "세금계산서로" });
  // 0033: 연체료는 별도 채권(kind late_fee)이라 건수에 함께 잡힌다. 금액은 revenue.read 없으면 null → 건수만.
  if (t.unpaid_count > 0) attention.push({ text: `미수금 ${t.unpaid_count}건${lateFeeOn ? "(연체료 포함)" : ""}${t.unpaid_total != null ? ` · ${fmtMoney(t.unpaid_total)}` : " · 금액은 매출을 볼 권한이 있어야 보임"}`, href: `${base}/receivables${ctx.qs}`, label: "미수금으로" });

  return (
    <PageBody>
      {bar}
      <PageHeader
        title="이번 달 할 일"
        description={`${ctx.building.name} · ${periodLabel(t.period)}${t.due_date ? ` · 납부기한 ${t.due_date}` : ""}`}
        actions={
          <p className="flex items-baseline gap-1.5 text-t2" aria-label={`5단계 중 ${doneCount} 완료`}>
            <span className="text-[length:var(--fs-kpi)] font-bold leading-none tracking-[var(--tr-tight)] tabular-nums text-t">{doneCount}</span>
            <span className="text-[length:var(--fs-card)] font-medium">/ 5 완료</span>
          </p>
        }
      />
      <Card className="overflow-hidden">
        <StepCard steps={steps} />
      </Card>
      <section className="mt-5" aria-labelledby="attention-h">
        <h2 id="attention-h" className="mb-2 text-[length:var(--fs-card)] font-semibold text-t">살펴볼 것 ({attention.length})</h2>
        <Card className="px-4 py-2">
          {attention.length === 0 ? (
            <p className="py-2 text-[length:var(--fs-body)] text-t2">지금 살펴볼 것이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--bd)]">
              {attention.map((a) => (
                <li key={a.text} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="inline-flex min-w-0 flex-1 items-start gap-2 break-keep text-[length:var(--fs-body)] text-t">
                    <Warn size={18} className="mt-[3px] shrink-0 text-wt" aria-hidden />
                    {a.text}
                  </span>
                  <Link href={a.href} className="inline-flex min-h-[44px] items-center gap-0.5 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] font-medium text-[var(--accent-ink)] hover:bg-sf2">
                    {a.label} <ChevronRight size={14} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </PageBody>
  );
}
