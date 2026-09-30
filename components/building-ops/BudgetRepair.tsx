"use client";

/** 연 예산 입력표(분류별) + 장기수선충당금 장부. 저장 규칙·권한·기능 켜짐은 서버 액션이 다시 검사한다. */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, CONTROL_SM, SelectField, TABLE, THEAD, TH, TD } from "@/components/rental/listkit";
import { addRepairFundEntry, upsertBudget } from "@/lib/domain/building-actions";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import type { BudgetLine } from "@/components/building/owners-report";
import type { RepairFundKind } from "@/lib/domain/building-types";
import { useRunAction } from "./client-common";
import { num, won } from "./format";

const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const digits = (v: string) => v.replace(/[^\d]/g, "");

export function BudgetTable({ businessId, buildingId, year, canEdit, lines }: { businessId: string; buildingId: string; year: number; canEdit: boolean; lines: BudgetLine[] }) {
  const { run, pending, error } = useRunAction();
  const initial = React.useMemo(() => Object.fromEntries(lines.map((l) => [l.cat, l.budget ? String(l.budget) : ""])), [lines]);
  const [vals, setVals] = React.useState<Record<string, string>>(initial);
  React.useEffect(() => setVals(initial), [initial]);
  const changed = lines.filter((l) => (vals[l.cat] ?? "") !== initial[l.cat]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const l of changed) {
      const r = await run(() => upsertBudget(businessId, buildingId, { year, std_category: l.cat, amount: Number(vals[l.cat] || 0) }), { refresh: false });
      if (!r.ok) return;
    }
    await run(async () => ({ ok: true as const, data: undefined }), { success: `${changed.length}개 분류의 예산을 저장했습니다.` });
  };
  const shown = lines.filter((l) => canEdit || l.budget || l.actual);
  const bud = (l: BudgetLine) => Number(vals[l.cat] || 0);
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title={`${year}년 예산`} description="분류마다 한 해 예산을 적으면 아래 실적(연초부터 이번 달까지 확정한 금액)과 비교합니다. 비워 두면 0원입니다." />
      <form onSubmit={save}>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="분류별 예산과 실적(옆으로 밀어 보기)">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>분류</th><th className={`${TH} text-right`}>{year}년 예산(원)</th><th className={`${TH} text-right`}>실적(연초~이번 달)</th><th className={`${TH} text-right`}>남은 예산</th><th className={`${TH} text-right`}>쓴 비율</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.cat} className="border-b border-[var(--bd)]">
                  <td className={TD}>{l.label}</td>
                  <td className={`${TD} text-right`}>
                    {canEdit
                      ? <input aria-label={`${l.label} 예산`} inputMode="numeric" value={vals[l.cat] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [l.cat]: digits(e.target.value) }))} className={`${CONTROL_SM} ${MONEY_INPUT} ml-auto w-[150px]`} />
                      : <span className="tabular-nums">{num(l.budget)}</span>}
                  </td>
                  <td className={NUM}>{num(l.actual)}</td>
                  <td className={`${NUM} ${bud(l) - l.actual < 0 ? "font-semibold text-et" : ""}`}>{num(bud(l) - l.actual)}</td>
                  <td className={NUM}>{bud(l) > 0 ? `${Math.round((l.actual / bud(l)) * 100)}%` : <span className="text-t3">-</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--t)] bg-sf2 font-bold text-t">
                <td className={TD}>합계</td>
                <td className={NUM}>{num(lines.reduce((s, l) => s + bud(l), 0))}</td>
                <td className={NUM}>{num(lines.reduce((s, l) => s + l.actual, 0))}</td>
                <td className={NUM}>{num(lines.reduce((s, l) => s + bud(l) - l.actual, 0))}</td>
                <td className={TD} />
              </tr>
            </tfoot>
          </table>
        </div>
        {error && <Alert kind="error" className="mt-3">{error}</Alert>}
        {canEdit
          ? <div className={`${FORM_ACTIONS} mt-3`}><Button type="submit" loading={pending} disabled={changed.length === 0}>{changed.length ? `예산 저장(${changed.length}곳 바뀜)` : "예산 저장"}</Button></div>
          : <p className="mt-3 text-[length:var(--fs-meta)] text-t3">예산을 고치는 권한이 없어 보기만 할 수 있습니다.</p>}
      </form>
    </Card>
  );
}

const KIND_LABEL: Record<RepairFundKind, string> = { contribution: "적립", spend: "사용", interest: "이자", adjust: "바로잡기" };
export interface FundLine { id: string; period: string; kind: RepairFundKind; amount: number | null; memo: string | null }

export function RepairFundLedger({ businessId, buildingId, period, canWrite, rows }: { businessId: string; buildingId: string; period: string; canWrite: boolean; rows: FundLine[] }) {
  const { run, pending, error } = useRunAction();
  const [month, setMonth] = React.useState(period);
  const [kind, setKind] = React.useState<RepairFundKind>("contribution");
  const [amount, setAmount] = React.useState("");
  const [memo, setMemo] = React.useState("");
  React.useEffect(() => setMonth(period), [period]);
  // 바로잡기만 앞의 −를 허용한다. 나머지는 숫자만.
  const signed = kind === "adjust" ? amount.replace(/(?!^[-−])[^\d]/g, "").replace("−", "-") : digits(amount);
  const value = Number(signed);
  const bad = signed === "" || signed === "-" || !Number.isSafeInteger(value) || value === 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bad) return;
    const r = await run(() => addRepairFundEntry(businessId, buildingId, { period: month, kind, amount: value, memo: memo.trim() || undefined }), { success: "장부에 적었습니다." });
    if (r.ok) { setAmount(""); setMemo(""); }
  };
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="장기수선충당금 장부" description="적립한 돈·이자·쓴 돈을 달마다 적습니다. 잔액 = 적립 + 이자 + 바로잡기 − 사용." />
      {canWrite && (
        <form onSubmit={submit} className={`mb-4 rounded-[var(--radius-md)] border border-[var(--bd)] bg-sf2/40 p-4 ${FORM_ROW}`}>
          <Input label="월" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} wrapperClassName={FW.date} />
          <SelectField label="종류" value={kind} onChange={(e) => setKind(e.target.value as RepairFundKind)} wrapperClassName={FW.select}>
            {(Object.keys(KIND_LABEL) as RepairFundKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </SelectField>
          <Input label="금액(원)" required inputMode={kind === "adjust" ? "text" : "numeric"} value={amount} onChange={(e) => setAmount(e.target.value)} className={MONEY_INPUT} wrapperClassName={FW.money} hint={kind === "adjust" ? "줄이는 돈이면 앞에 −를 붙이세요." : bad || !amount ? undefined : `${num(value)}원`} />
          <Input label="메모(선택)" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} hint="예: 옥상 방수 공사 대금" wrapperClassName={FW.memo} />
          {error && <Alert kind="error" className="w-full">{error}</Alert>}
          <div className={FORM_ACTIONS}><Button type="submit" loading={pending} disabled={bad}>장부에 적기</Button></div>
        </form>
      )}
      {rows.length === 0 ? <EmptyState title="아직 적은 기록이 없습니다." description={canWrite ? "위 칸에 첫 적립금을 적어 보세요." : undefined} /> : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="장기수선충당금 장부(옆으로 밀어 보기)">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>월</th><th className={TH}>종류</th><th className={`${TH} text-right`}>금액</th><th className={TH}>메모</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--bd)]">
                  <td className={TD}>{r.period}</td><td className={TD}>{KIND_LABEL[r.kind]}</td>
                  <td className={`${NUM} ${r.kind === "spend" ? "text-et" : ""}`}>{r.kind === "spend" ? "−" : ""}{won(r.amount)}</td>
                  <td className={`${TD} text-t2`}>{r.memo ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
