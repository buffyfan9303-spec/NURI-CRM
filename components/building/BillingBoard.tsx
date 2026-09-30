"use client";

/**
 * 관리비 계산·확인(§4.6): 요약 띠 → 차단/경고 목록 → 표(sticky 머리글, 합계 상·하단) → 하단 승인 바.
 * 행 동작은 최대 2개("왜 이 금액인가" + 정정). 계산·승인·정정·상태 전이는 전부 서버 RPC 가 최종 판정.
 * 오류는 인라인(Alert, role=alert)에 남기고 성공만 토스트.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard, MOBILE_BARE } from "@/components/ui/ResponsiveTable";
import { Alert, SummaryStrip, TABLE, THEAD, TH, TR, TD, TEXTAREA, CONTROL, TextAction } from "@/components/rental/listkit";
import { toast } from "@/components/ui/toast";
import { Lock, Plus, Trash2, RefreshCw, CheckCircle2 } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import type { BillRow, BillingRunRow, CorrectionLine, CorrectionRunRow, PeriodStatus, StdCategory } from "@/lib/domain/building-types";
import { STD_CATEGORIES, STD_CATEGORY_LABEL } from "@/lib/domain/building-types";
import { approveRun, calculatePeriod, correctBill, ensurePeriod, setPeriodStatus } from "@/lib/domain/building-actions";
import type { BuildingContext } from "./context";
import { BuildingPeriodBar } from "./BuildingPeriodBar";
import { SavedStatus, useSaveState } from "./SavedStatus";
import { Money, MoneyCell, DiffCell, fmtMoney, fmtDiff } from "./Money";
import { BlockWarnList } from "./BlockWarnList";
import { TraceList } from "./TraceList";
import { RowStatusPill, RunStatusPill } from "./StatusPill";
import { LinkButton } from "./StepCard";
import { periodLabel } from "./period";

type Level = "ok" | "warn" | "error";
/** 0033: 정정 run(초안=승인 대기 → 다른 담당자 승인=반영됨)과 그 run 의 차액 청구. detail(0034)은 사유·입력자/승인자 표시이름. */
export interface CorrectionRun { run: BillingRunRow; bills: BillRow[]; detail?: CorrectionRunRow | null }

export function BillingBoard({
  businessId, base, tz, ctx, run, bills, corrections = [], unitNo, partyName, prevByUnit, canWrite, canApprove, userId, selfApprove,
}: {
  businessId: string; base: string; tz: string; ctx: BuildingContext;
  run: BillingRunRow | null; bills: BillRow[]; corrections?: CorrectionRun[];
  unitNo: Record<string, string>; partyName: Record<string, string>; prevByUnit: Record<string, number>;
  canWrite: boolean; canApprove: boolean; userId: string; selfApprove: boolean;
}) {
  const router = useRouter();
  const save = useSaveState();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"calc" | "approve" | "status" | "correct" | null>(null);
  const [traceFor, setTraceFor] = React.useState<BillRow | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [correctFor, setCorrectFor] = React.useState<BillRow | null>(null);

  const building = ctx.building!;
  const status: PeriodStatus | null = ctx.periodRow?.status ?? null;
  const approved = run?.status === "approved";
  const locked = status === "approved" || status === "finalized" || status === "closed";
  const blocks = React.useMemo(() => run?.blocks ?? [], [run]);
  const warnings = React.useMemo(() => run?.warnings ?? [], [run]);
  const levelOf = React.useMemo(() => {
    const m = new Map<string, Level>();
    for (const w of warnings) if (w.unit_id) m.set(w.unit_id, "warn");
    for (const b of blocks) if (b.unit_id) m.set(b.unit_id, "error");
    return (unitId: string): Level => m.get(unitId) ?? "ok";
  }, [blocks, warnings]);

  const regular = bills.filter((b) => b.bill_kind === "regular");
  // 정정 청구(승인된 것만 합계에 반영, 초안은 "승인 대기" 로 따로). 청구 행 아래에 ↳ 로 붙는다.
  const corrBills = React.useMemo(() => corrections.flatMap((c) => c.bills.map((b) => ({ bill: b, run: c.run, detail: c.detail ?? null }))), [corrections]);
  /** "사유 · 입력 홍길동 · 승인 김담당" — 0034 detail 이 없으면(RPC 미적용·미소속) run.reason 만. */
  const corrWho = (r: BillingRunRow, d: CorrectionRunRow | null) => {
    const reason = d?.reason ?? (r as BillingRunRow & { reason?: string | null }).reason ?? null;
    const who = d?.entered_by_name ?? (r.calculated_by === userId ? "나" : null);
    return [reason, who ? `정정한 사람 ${who}` : null, d?.approved_by_name ? `확정 ${d.approved_by_name}` : null].filter(Boolean).join(" · ");
  };
  const pendingRuns = corrections.filter((c) => c.run.status === "draft");
  const sorted = React.useMemo(() => [...regular].sort((a, b) => (unitNo[a.unit_id] ?? "").localeCompare(unitNo[b.unit_id] ?? "", "ko", { numeric: true })), [regular, unitNo]);
  const approvedCorr = corrBills.filter((c) => c.run.status === "approved").map((c) => c.bill);
  const sum = (k: keyof BillRow) => [...regular, ...approvedCorr].reduce((s, b) => s + ((b[k] as number | null) ?? 0), 0);
  const totalDue = sum("amount_due");
  const isCalculator = !!run && run.calculated_by === userId;
  /** 정정 run 승인 가능 여부(2인 분리). 이유 문장은 버튼 옆 설명. */
  const corrApproveReason = (r: BillingRunRow) => !canApprove ? "확정 권한이 필요함" : r.calculated_by === userId && !selfApprove ? "정정한 사람은 직접 확정할 수 없음(다른 담당자가 확정)" : null;

  const runAction = async <T,>(kind: NonNullable<typeof busy>, fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string; hint?: string }>, onOk: (d: T) => void) => {
    setBusy(kind); setError(null); save.saving();
    try {
      const r = await fn();
      if (!r.ok) { setError(r.hint === "inputs_changed" ? `${r.message} 위의 "계산 다시 하기"를 누르세요.` : r.message); save.failed(r.hint === "inputs_changed" ? "입력이 바뀜 - 다시 계산 필요" : "저장 실패"); return false; }
      save.saved(); onOk(r.data); router.refresh(); return true;
    } catch {
      setError("서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요."); save.failed("저장 실패"); return false;
    } finally { setBusy(null); }
  };

  const calculate = () =>
    runAction("calc", async () => {
      let periodId = ctx.periodRow?.id;
      if (!periodId) {
        const p = await ensurePeriod(businessId, building.id, ctx.period);
        if (!p.ok) return p;
        periodId = p.data.id;
      }
      return calculatePeriod(businessId, periodId);
    }, (d) => toast.success(d.reused ? "입력이 그대로라 이전 계산을 다시 씁니다." : `계산했습니다 — ${d.bills}호실, 수정할 사항 ${d.block_count}건, 확인할 것 ${d.warning_count}건`));

  const transition = (next: Exclude<PeriodStatus, "approved">, label: string) =>
    ctx.periodRow && runAction("status", () => setPeriodStatus(businessId, ctx.periodRow!.id, next), () => toast.success(`${label}했습니다.`));
  const approveCorrection = (r: BillingRunRow) =>
    runAction("approve", () => approveRun(businessId, r.id), () => toast.success(`${r.revision}번째 정정 금액을 확정했습니다. 미수금·선납금에 반영됐습니다.`));

  const header = (
    <>
      <BuildingPeriodBar buildings={ctx.buildings} buildingId={building.id} period={ctx.period} tz={tz} status={status}>
        <SavedStatus state={save.state} />
      </BuildingPeriodBar>
      <PageHeader
        title="관리비 계산·확정"
        description={`${building.name} · ${periodLabel(ctx.period)}${run ? ` · ${run.revision}번째 계산` : ""}`}
        meta={run && <RunStatusPill status={run.status} />}
        actions={
          canWrite && !locked ? (
            <Button size="md" variant={run ? "secondary" : "primary"} loading={busy === "calc"} onClick={calculate} disabled={busy !== null}>
              <RefreshCw size={16} aria-hidden />
              {run ? "계산 다시 하기" : "관리비 계산하기"}
            </Button>
          ) : undefined
        }
      />
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      {locked && (
        <Alert kind="warning" className="mb-3">
          <Lock size={14} className="mr-1 inline-block align-[-2px]" aria-hidden />
          {periodLabel(ctx.period)} 금액은 확정되어 잠겼습니다. {canApprove ? <>정정하려면 해당 줄의 &quot;금액 정정&quot;으로 달라진 만큼만 다시 청구하세요(정정 후 다시 확정).</> : <>금액 정정은 확정 권한이 있는 담당자가 합니다. 정정이 필요하면 그 담당자에게 요청하세요.</>}
        </Alert>
      )}
    </>
  );

  if (!run) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title="아직 계산하지 않았습니다."
            description="검침값과 비용을 다 적으면 관리비를 계산할 수 있습니다. 빠진 것이 있으면 계산한 뒤 '수정할 사항'으로 알려 줍니다."
            action={canWrite ? <Button size="lg" loading={busy === "calc"} onClick={calculate}>관리비 계산하기</Button> : <LinkButton href={`${base}${ctx.qs}`} size="md" variant="secondary">이번 달 할 일로</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const approveDisabledReason = !canApprove ? "금액을 확정할 권한이 필요합니다." : blocks.length > 0 ? `수정할 사항 ${blocks.length}건을 먼저 수정해야 확정할 수 있습니다.` : isCalculator && !selfApprove ? "계산한 사람은 직접 확정할 수 없습니다. 다른 담당자가 확정해야 합니다." : null;

  const footer = (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-[var(--bd)] bg-sf/95 px-4 py-3 backdrop-blur sm:-mx-[var(--page-x)] sm:px-[var(--page-x)]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id="approve-hint" className="break-keep text-[length:var(--fs-body)] text-t2">
          {approved
            ? <>확정됨 · {regular.length}호실 · 이번 달 납부액 합계 <Money value={totalDue} strong className="text-t" />{status === "approved" && " · 다음은 명세서 발송"}</>
            : approveDisabledReason ?? <>{regular.length}호실 · 이번 달 납부액 합계 <Money value={totalDue} strong className="text-t" /> 을 확정합니다</>}
        </p>
        <div className="flex flex-wrap gap-2">
          {!approved && canWrite && status === "draft" && (
            <Button size="lg" variant="secondary" loading={busy === "status"} disabled={busy !== null} onClick={() => transition("review", "확인 요청")}>다른 담당자에게 확인 요청</Button>
          )}
          {!approved && (
            <Button size="lg" disabled={!!approveDisabledReason || busy !== null} aria-describedby="approve-hint" onClick={() => setApproveOpen(true)}>
              <CheckCircle2 size={18} aria-hidden />이번 달 금액 확정하기
            </Button>
          )}
          {approved && status === "approved" && (
            <>
              <LinkButton href={`${base}/statements${ctx.qs}`} size="lg" variant="secondary">명세서 발송</LinkButton>
              {canApprove && <Button size="lg" loading={busy === "status"} disabled={busy !== null} onClick={() => transition("finalized", "명세서 확정")}>명세서 확정하기</Button>}
            </>
          )}
          {approved && status === "finalized" && canApprove && (
            <Button size="lg" loading={busy === "status"} disabled={busy !== null} onClick={() => transition("closed", "이달 마감")}>이달 마감하기</Button>
          )}
        </div>
      </div>
    </div>
  );

  const row = (b: BillRow) => {
    const lvl = levelOf(b.unit_id);
    const prev = prevByUnit[b.unit_id];
    const diff = b.current_charge != null && prev != null ? b.current_charge - prev : null;
    const fixes = corrBills.filter((c) => c.bill.corrects_bill_id === b.id || (c.bill.unit_id === b.unit_id && c.bill.revision > b.revision));
    return { lvl, diff, fixes };
  };

  const table = (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <thead className={cn(THEAD, "sticky top-0 z-[1]")}>
          <tr>
            <th className={TH} scope="col">호실</th>
            <th className={TH} scope="col">납부자</th>
            <th className={cn(TH, "text-right")} scope="col">이번 달 관리비</th>
            <th className={cn(TH, "text-right")} scope="col">전월까지 미납액</th>
            <th className={cn(TH, "text-right max-lg:hidden")} scope="col">연체료</th>
            <th className={cn(TH, "text-right max-lg:hidden")} scope="col">선납금·감면액</th>
            <th className={cn(TH, "text-right")} scope="col">이번 달 납부액</th>
            <th className={cn(TH, "text-right max-xl:hidden")} scope="col">지난달보다</th>
            <th className={TH} scope="col">상태</th>
            <th className={cn(TH, "text-right")} scope="col">보기·정정</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const { lvl, diff, fixes } = row(b);
            return (
              <React.Fragment key={b.id}>
                <tr className={cn(TR, lvl === "error" && "border-l-[3px] border-l-[var(--et)]", lvl === "warn" && "border-l-[3px] border-l-[var(--wt)]")}>
                  <td className={cn(TD, "font-semibold tabular-nums text-t")}>{unitNo[b.unit_id] ?? "—"}호</td>
                  <td className={cn(TD, "text-t")}>{b.bill_to_party_id ? partyName[b.bill_to_party_id] ?? "—" : <span className="text-et">납부자 없음</span>}</td>
                  <MoneyCell value={b.current_charge} />
                  <MoneyCell value={b.prior_unpaid} tone={b.prior_unpaid ? "unpaid" : "default"} />
                  <MoneyCell value={b.late_fee} className="max-lg:hidden" />
                  <MoneyCell value={b.credit ? -b.credit : 0} className="max-lg:hidden" />
                  <MoneyCell value={b.amount_due} strong />
                  <DiffCell value={diff} className="max-xl:hidden" />
                  <td className={TD}><RowStatusPill level={lvl} /></td>
                  <td className={cn(TD, "text-right whitespace-nowrap")}>
                    <TextAction onClick={() => setTraceFor(b)}>왜 이 금액인가</TextAction>
                    {approved && canApprove && <TextAction onClick={() => setCorrectFor(b)}>금액 정정</TextAction>}
                  </td>
                </tr>
                {fixes.map(({ bill: c, run: cr, detail: cd }) => (
                  <tr key={c.id} className={cn(TR, "bg-sf2/40 text-t2", cr.status === "draft" && "border-l-[3px] border-l-[var(--wt)]")}>
                    <td className={cn(TD, "pl-6 text-[length:var(--fs-meta)]")}>↳ {c.revision}차 정정</td>
                    <td className={cn(TD, "break-keep text-[length:var(--fs-meta)]")}>{corrWho(cr, cd) || (cr.status === "draft" ? "다른 담당자 확정 필요" : "")}</td>
                    <MoneyCell value={c.current_charge} />
                    <td className={cn(TD, "max-lg:hidden")} colSpan={3} />
                    <td className={cn(TD, "lg:hidden")} />
                    <MoneyCell value={c.amount_due} strong />
                    <td className={cn(TD, "max-xl:hidden")} />
                    <td className={TD}>{cr.status === "draft" ? <Badge kind="warning">승인 대기</Badge> : cr.status === "approved" ? <Badge kind="success">반영됨</Badge> : <Badge kind="error">취소됨</Badge>}</td>
                    <td className={cn(TD, "text-right whitespace-nowrap")}>
                      <TextAction onClick={() => setTraceFor(c)}>왜 이 금액인가</TextAction>
                      {cr.status === "draft" && !corrApproveReason(cr) && <TextAction onClick={() => approveCorrection(cr)}>확정</TextAction>}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--t)] font-semibold text-t">
            <td className={TD} colSpan={2}>합계 {regular.length}호실{approvedCorr.length > 0 && ` + 반영된 정정 ${approvedCorr.length}건`}</td>
            <MoneyCell value={sum("current_charge")} strong />
            <MoneyCell value={sum("prior_unpaid")} strong />
            <MoneyCell value={sum("late_fee")} strong className="max-lg:hidden" />
            <MoneyCell value={-sum("credit")} strong className="max-lg:hidden" />
            <MoneyCell value={totalDue} strong />
            <td className={cn(TD, "max-xl:hidden")} />
            <td className={TD} colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <>
      {header}
      <SummaryStrip items={[
        { label: "이번 달 납부액 합계", value: fmtMoney(totalDue) },
        { label: "이번 달 관리비", value: fmtMoney(sum("current_charge")) },
        { label: "호실 수", value: `${regular.length}호실` },
        { label: "수정할 사항", value: `${blocks.length}건`, tone: blocks.length ? "danger" : "muted" },
        { label: "확인할 것", value: `${warnings.length}건`, tone: warnings.length ? "default" : "muted" },
      ]} />
      <BlockWarnList blocks={blocks} warnings={warnings} base={base} qs={ctx.qs} className="mb-4" />
      {pendingRuns.length > 0 && (
        <section role="status" aria-labelledby="pending-corr-h" className="mb-4 rounded-[var(--r-md)] border-l-[3px] border-l-[var(--wt)] bg-wb/60 px-4 py-3">
          <h3 id="pending-corr-h" className="mb-1.5 text-[length:var(--fs-body)] font-semibold text-wt">확정 기다리는 정정 금액 {pendingRuns.length}건 — 정정한 사람이 아닌 다른 담당자가 확정해야 반영됩니다</h3>
          <ul className="flex flex-col gap-1.5">
            {pendingRuns.map(({ run: r, bills: rb, detail: d }) => {
              const why = corrApproveReason(r);
              const delta = d?.delta ?? rb.reduce((s, b) => s + (b.amount_due ?? 0), 0);
              const who = corrWho(r, d ?? null);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-body)] text-t">
                  <span className="min-w-0 flex-1 break-keep">
                    {r.revision}차 정정 · {(d?.unit_no ? [d.unit_no] : rb.map((b) => unitNo[b.unit_id] ?? "?")).map((u) => `${u}호`).join(", ")} · 정정 차액 <Money value={delta} strong />
                    {who && <span className="block text-[length:var(--fs-meta)] text-t2">{who}{d?.entered_at ? ` · ${d.entered_at.slice(0, 16).replace("T", " ")}` : ""}</span>}
                  </span>
                  {why ? <span className="text-[length:var(--fs-meta)] text-t2">{why}</span> : (
                    <Button size="sm" variant="secondary" loading={busy === "approve"} disabled={busy !== null} onClick={() => approveCorrection(r)}>{r.revision}차 정정 확정하기</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <Card className={cn("sm:p-0", MOBILE_BARE)}>
        {sorted.length === 0 ? (
          <EmptyState title="관리비를 부과할 호실이 없습니다." description="쓰는 호실·계약 중인 호실이 없거나 전부 멈췄습니다. 위의 '수정할 사항'을 보세요." />
        ) : (
          <TableOrCards
            rows={sorted}
            keyOf={(b) => b.id}
            table={table}
            card={(b) => {
              const { lvl, diff } = row(b);
              return (
                <MobileCard
                  title={`${unitNo[b.unit_id] ?? "—"}호 · ${b.bill_to_party_id ? partyName[b.bill_to_party_id] ?? "—" : "납부자 없음"}`}
                  badge={<RowStatusPill level={lvl} />}
                  fields={[
                    ["이번 달 관리비", fmtMoney(b.current_charge)],
                    ["전월까지 미납액", <Money key="u" value={b.prior_unpaid} tone={b.prior_unpaid ? "unpaid" : "default"} />],
                    ["선납금·감면액", <Money key="c" value={b.credit ? -b.credit : 0} />],
                    ["이번 달 납부액", <Money key="d" value={b.amount_due} strong className="text-[length:var(--fs-money)]" />],
                    ["지난달보다", fmtDiff(diff)],
                  ]}
                  actions={<>
                    <Button size="sm" variant="secondary" onClick={() => setTraceFor(b)}>왜 이 금액인가</Button>
                    {approved && canApprove && <Button size="sm" variant="ghost" onClick={() => setCorrectFor(b)}>금액 정정</Button>}
                  </>}
                />
              );
            }}
          />
        )}
      </Card>
      {footer}

      <Modal open={!!traceFor} onClose={() => setTraceFor(null)} title={traceFor ? `${unitNo[traceFor.unit_id] ?? ""}호 — 왜 이 금액인가` : ""} className="sm:max-w-[520px]">
        {traceFor?.trace ? (
          <TraceList trace={traceFor.trace} calculatedAt={run.calculated_at} calculatedBy={run.calculated_by ? (run.calculated_by === userId ? "나" : "다른 담당자") : null} />
        ) : (
          <p className="text-[length:var(--fs-body)] text-t2">계산 내용을 볼 권한이 없거나 아직 계산하지 않았습니다.</p>
        )}
      </Modal>

      <ApproveModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        count={regular.length}
        total={totalDue}
        period={ctx.period}
        needReason={isCalculator && selfApprove}
        busy={busy === "approve"}
        onConfirm={async (reason) => {
          const ok = await runAction("approve", () => approveRun(businessId, run.id, reason || undefined), () => toast.success("이번 달 금액을 확정했습니다. 호실마다 미수금이 생기고 금액이 잠겼습니다."));
          if (ok) setApproveOpen(false);
        }}
      />

      <CorrectModal
        bill={correctFor}
        unitLabel={correctFor ? `${unitNo[correctFor.unit_id] ?? ""}호` : ""}
        onClose={() => setCorrectFor(null)}
        busy={busy === "correct"}
        onSubmit={async (lines, reason) => {
          const ok = await runAction("correct", () => correctBill(businessId, correctFor!.id, lines, reason), (d) => toast.success(`${d.revision}번째 정정 금액을 만들었습니다(정정 차액 ${fmtMoney(d.delta)}). 다른 담당자가 확정해야 반영됩니다.`));
          if (ok) setCorrectFor(null);
        }}
      />
    </>
  );
}

function ApproveModal({ open, onClose, count, total, period, needReason, busy, onConfirm }: { open: boolean; onClose: () => void; count: number; total: number; period: string; needReason: boolean; busy: boolean; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (open) setReason(""); }, [open]);
  const can = !needReason || reason.trim().length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${periodLabel(period)} 금액 확정`}
      footer={<>
        <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>취소</Button>
        <Button size="md" loading={busy} disabled={!can} onClick={() => onConfirm(reason.trim())}>확정하기</Button>
      </>}
    >
      <p className="break-keep text-[length:var(--fs-body)] leading-relaxed text-t">
        <strong className="tabular-nums">{count}호실</strong>, 이번 달 납부액 합계 <strong className="tabular-nums">{fmtMoney(total)}</strong>을 확정합니다.
        확정하면 호실마다 미수금이 생기고 선납금이 빠지며, 그 뒤에는 &quot;금액 정정&quot;으로만 바꿀 수 있습니다.
      </p>
      {needReason && (
        <div className="mt-4">
          <Alert kind="warning" className="mb-3">계산한 사람이 직접 확정합니다(직접 확정 허용). 이유를 남겨야 합니다.</Alert>
          <Input label="확정하는 이유" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 담당자 한 명, 대표가 확인함" />
        </div>
      )}
    </Modal>
  );
}

type Draft = { name: string; std_category: StdCategory; supply: string; vat: string; exempt: string };
const emptyLine = (): Draft => ({ name: "", std_category: "other", supply: "0", vat: "0", exempt: "0" });
const toInt = (s: string) => { const n = Math.trunc(Number(String(s).replace(/[^0-9-]/g, ""))); return Number.isFinite(n) ? n : 0; };

function CorrectModal({ bill, unitLabel, onClose, busy, onSubmit }: { bill: BillRow | null; unitLabel: string; onClose: () => void; busy: boolean; onSubmit: (lines: CorrectionLine[], reason: string) => void }) {
  const [lines, setLines] = React.useState<Draft[]>([emptyLine()]);
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { if (bill) { setLines([emptyLine()]); setReason(""); setErr(null); } }, [bill]);
  const delta = lines.reduce((s, l) => s + toInt(l.supply) + toInt(l.vat) + toInt(l.exempt), 0);
  const upd = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = () => {
    if (!reason.trim()) { setErr("정정 사유를 적으세요."); return; }
    const out: CorrectionLine[] = lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), std_category: l.std_category, supply: toInt(l.supply), vat: toInt(l.vat), exempt: toInt(l.exempt) }));
    if (out.length === 0) { setErr("고칠 항목 이름을 적으세요."); return; }
    if (out.every((l) => l.supply === 0 && l.vat === 0 && l.exempt === 0)) { setErr("정정 차액이 0원입니다. 금액을 적으세요(줄이면 음수)."); return; }
    setErr(null); onSubmit(out, reason.trim());
  };
  return (
    <Modal
      open={!!bill}
      onClose={onClose}
      title={`${unitLabel} 금액 정정`}
      className="sm:max-w-[640px]"
      footer={<>
        <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>취소</Button>
        <Button size="md" loading={busy} onClick={submit}>정정 차액 {fmtMoney(delta)}으로 정정</Button>
      </>}
    >
      <p className="mb-3 break-keep text-[length:var(--fs-body)] text-t2">이미 확정된 금액은 그대로 두고 <strong>달라진 만큼</strong>만 새로 만듭니다. 정정한 사람이 아닌 <strong>다른 담당자가 확정</strong>해야 반영됩니다. 추가 청구는 숫자만, 감액은 앞에 −를 붙입니다. 부가세 있는 줄의 부가세는 공급가액의 10%(±1원), 부가세 없는 줄은 0이어야 합니다.</p>
      {err && <Alert kind="error" className="mb-3">{err}</Alert>}
      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <fieldset key={i} className="rounded-[var(--r-md)] border border-[var(--bd)] p-3">
            <legend className="px-1 text-[length:var(--fs-meta)] text-t3">항목 {i + 1}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input label="항목 이름" required value={l.name} onChange={(e) => upd(i, { name: e.target.value })} wrapperClassName="mb-0" />
              <label className="flex flex-col gap-1.5 text-[length:var(--fs-body)] font-medium text-t2">분류
                <select className={CONTROL} value={l.std_category} onChange={(e) => upd(i, { std_category: e.target.value as StdCategory })}>
                  {STD_CATEGORIES.map((c) => <option key={c} value={c}>{STD_CATEGORY_LABEL[c]}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input label="공급가액 차이" inputMode="numeric" value={l.supply} onChange={(e) => upd(i, { supply: e.target.value })} wrapperClassName="mb-0" className="text-right tabular-nums" />
              <Input label="부가세 차이" inputMode="numeric" value={l.vat} onChange={(e) => upd(i, { vat: e.target.value })} wrapperClassName="mb-0" className="text-right tabular-nums" />
              <Input label="면세 금액 차이" inputMode="numeric" value={l.exempt} onChange={(e) => upd(i, { exempt: e.target.value })} wrapperClassName="mb-0" className="text-right tabular-nums" />
            </div>
            {lines.length > 1 && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden />항목 지우기</Button>
            )}
          </fieldset>
        ))}
        <Button size="sm" variant="secondary" className="self-start" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={14} aria-hidden />항목 추가</Button>
        <label className="flex flex-col gap-1.5 text-[length:var(--fs-body)] font-medium text-t2"><span>정정 사유 <span className="text-et" aria-hidden>*</span></span>
          <textarea className={TEXTAREA} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 8월 전기 검침값을 잘못 적음" />
        </label>
      </div>
    </Modal>
  );
}
