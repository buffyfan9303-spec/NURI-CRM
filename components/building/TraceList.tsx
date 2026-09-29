/**
 * "왜 이 금액인가"(§4.6): 원천 → 분자/분모(배분식) → 반올림·1원 조정 → 세액 → 전월 미수·연체·선납 → 납부 요청액.
 * BillTrace(v_bld_bills.trace) 만으로 그린다. 서버·클라이언트 공용.
 */
import * as React from "react";
import type { BillTrace, BillTraceLine } from "@/lib/domain/building-types";
import { STD_CATEGORY_LABEL } from "@/lib/domain/building-types";
import { cn } from "@/lib/utils/cn";
import { FourNumbers, Money, fmtMoney } from "./Money";

const TAX_LABEL: Record<string, string> = { taxable: "부가세 있음", exempt: "부가세 없음", non_taxable: "부가세 대상 아님", pass_through: "받은 그대로 넘김" };
const METHOD_LABEL: Record<string, string> = { fixed: "정액", area: "면적", share: "지분", weight: "나누는 비율", equal: "똑같이", meter_usage: "계량기 사용량", direct: "직접 적음" };

const num = (v: unknown) => (typeof v === "number" ? v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

/** basis(jsonb, SQL bld_calculate) 를 사람 문장으로. 키: method·source_total|source_supply+source_vat·numerator/denominator·rate·basis(기준량)·raw*·adjust*·tax. */
function basisText(b: Record<string, unknown>): string {
  const parts: string[] = [];
  const method = typeof b.method === "string" ? METHOD_LABEL[b.method] ?? b.method : null;
  const srcTotal = n(b.source_total) ?? (b.source_supply != null ? (n(b.source_supply) ?? 0) + (n(b.source_vat) ?? 0) : null);
  if (srcTotal != null) parts.push(`들어온 비용 ${fmtMoney(srcTotal)}`);
  if (b.rate != null && b.basis != null) parts.push(`${num(b.basis)} × ${fmtMoney(n(b.rate))}${b.rate_includes_vat ? "(부가세 포함)" : ""}`);
  else if (b.rate != null) parts.push(`정액 ${fmtMoney(n(b.rate))}`);
  if (b.numerator != null && b.denominator != null) parts.push(`${method ?? "나누기"}: 이 호실 ${num(b.numerator)} / 전체 ${num(b.denominator)}`);
  else if (method && b.rate == null) parts.push(method);
  const raw = n(b.raw) ?? (b.raw_supply != null ? (n(b.raw_supply) ?? 0) + (n(b.raw_vat) ?? 0) : null);
  if (raw != null && !Number.isInteger(raw)) parts.push(`계산값 ${raw.toFixed(2)} → ${b.rounding === "round" ? "반올림" : "내림"}`);
  const adj = (n(b.adjust) ?? 0) + (n(b.adjust_supply) ?? 0) + (n(b.adjust_vat) ?? 0);
  if (adj !== 0) parts.push(`남는 1원 맞춤 ${adj > 0 ? "+" : "−"}${Math.abs(adj)}`);
  if (typeof b.tax === "string") parts.push(TAX_LABEL[b.tax] ?? b.tax);
  return parts.join(" · ");
}

function LineRow({ l }: { l: BillTraceLine }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-[var(--bd)] py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-keep text-[length:var(--fs-body)] font-medium text-t">
          {l.name}
          <span className="ml-1.5 text-[length:var(--fs-meta)] font-normal text-t3">{STD_CATEGORY_LABEL[l.std_category]}</span>
        </span>
        <Money value={l.amount} strong className="text-[length:var(--fs-money)]" />
      </div>
      <p className="break-keep text-[length:var(--fs-meta)] text-t2">
        {basisText(l.basis ?? {})}
        {l.vat > 0 && ` · 부가세 빼기 전 ${fmtMoney(l.supply)} + 부가세 ${fmtMoney(l.vat)}`}
        {l.exempt > 0 && ` · 부가세 없는 금액 ${fmtMoney(l.exempt)}`}
      </p>
    </li>
  );
}

export function TraceList({ trace, calculatedBy, calculatedAt, className }: { trace: BillTrace; calculatedBy?: string | null; calculatedAt?: string | null; className?: string }) {
  const late = trace.late_fee;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <section>
        <h3 className="mb-1 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-t3">① 항목마다 이렇게 계산했습니다</h3>
        <ol className="rounded-[var(--r-md)] border border-[var(--bd)] px-3">
          {trace.lines.map((l, i) => <LineRow key={`${l.charge_type_id}-${i}`} l={l} />)}
          {trace.lines.length === 0 && <li className="py-3 text-[length:var(--fs-body)] text-t3">부과 항목이 없습니다.</li>}
        </ol>
      </section>
      <section>
        <h3 className="mb-1 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-t3">② 이번 달 낼 돈까지</h3>
        <FourNumbers
          supply={trace.current_charge.supply}
          vat={trace.current_charge.vat}
          exempt={trace.current_charge.exempt}
          rows={[
            { label: "이번 달 관리비", value: trace.current_charge.total },
            { label: "지난달까지 안 낸 돈", value: trace.prior_unpaid, tone: trace.prior_unpaid > 0 ? "unpaid" : "default" },
            { label: late.enabled ? (late.terms_ready ? "연체료" : "연체료(조건 확정 전이라 0원)") : "연체료(안 씀)", value: late.total },
            { label: "미리 낸 돈·깎은 돈", value: -trace.credit.applied, tone: trace.credit.applied > 0 ? "credit" : "default" },
          ]}
          total={trace.amount_due}
          totalLabel="이번 달 낼 돈"
        />
        {late.items.length > 0 && (
          <ul className="mt-2 text-[length:var(--fs-meta)] text-t2">
            {late.items.map((it, i) => (
              <li key={it.receivable_id ?? i}>
                {it.period ? `${it.period} 안 낸 돈 ` : ""}{it.principal != null ? `${fmtMoney(it.principal)} × ` : ""}{it.days}일{it.rate != null ? ` × ${it.rate}%/${it.unit === "annual" ? "년" : it.unit === "monthly" ? "월" : "일"}` : ""} = {fmtMoney(it.amount)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[length:var(--fs-meta)] text-t3">
          부가세율 {Math.round(trace.vat_rate * 100)}% · 기준일 {trace.asof}
          {calculatedAt && ` · 계산 ${calculatedAt.slice(0, 16).replace("T", " ")}`}
          {calculatedBy && ` (${calculatedBy})`}
        </p>
      </section>
    </div>
  );
}
