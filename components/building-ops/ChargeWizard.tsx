"use client";

/**
 * 관리비 항목 화면: 항목 목록 + 세무 승인 + 5단계 마법사(이름 → 출처 → 부담자 → 배분 → 세무·미리보기).
 * 저장과 승인은 서버 액션이 권한·작성자≠승인자를 다시 검사한다. 미리보기는 표시용이며 확정 금액은 청구 계산이 낸다.
 */
import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, SelectField, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { approveChargeTypeTax, createChargeType, updateChargeType } from "@/lib/domain/building-actions";
import { STD_CATEGORIES, STD_CATEGORY_LABEL, type AllocMethod, type ChargeTypeRow, type MeterKind, type Payer, type SourceKindCharge, type TaxTreatment } from "@/lib/domain/building-types";
import { MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { METER_KIND_LABEL, won } from "./format";
import { ALLOC_LABEL, PAYER_LABEL, SOURCE_LABEL, STEPS, TAX_LABEL, allocOptions, draftFrom, draftToInput, emptyDraft, firstBadStep, previewOf, stepError, type ChargeDraft, type PreviewUnit } from "./charge-wizard";

export interface ChargesProps {
  businessId: string; buildingId: string; rows: ChargeTypeRow[]; units: PreviewUnit[];
  parties: { id: string; name: string }[]; canConfigure: boolean; canApproveTax: boolean; selfApprove: boolean;
}

function Choice<T extends string>({ legend, value, options, onChange, hint }: { legend: string; value: T | ""; options: { v: T; label: string; hint?: string }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-1.5 text-[length:var(--fs-body)] font-medium text-t2">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.v} className={`flex min-h-[44px] cursor-pointer items-start gap-2 rounded-[var(--r-md)] border px-3 py-2 text-[length:var(--fs-body)] ${value === o.v ? "border-[var(--brand)] bg-sf2" : "border-[var(--bd)] bg-sf"}`}>
            <input type="radio" name={legend} className="mt-1" checked={value === o.v} onChange={() => onChange(o.v)} />
            <span><span className="font-medium text-t">{o.label}</span>{o.hint && <span className="block text-[length:var(--fs-meta)] text-t3">{o.hint}</span>}</span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-[length:var(--fs-meta)] text-t3">{hint}</p>}
    </fieldset>
  );
}

const SOURCE_HINT: Record<SourceKindCharge, string> = {
  expense: "비용 입력 화면에 적은 그 달 실제 금액을 호실에 나눕니다.",
  rate: "계약이나 고정 요금처럼 정해진 단가·정액으로 계산합니다.",
  direct: "호실마다 금액을 따로 적습니다. 나누는 방법은 '직접 적음'으로 정해집니다.",
};

export function ChargesBoard(p: ChargesProps) {
  const [editing, setEditing] = React.useState<{ id: string | null } | null>(null);
  const [showOff, setShowOff] = React.useState(false);
  const rows = p.rows.filter((r) => showOff || r.active);
  const editRow = editing?.id ? p.rows.find((r) => r.id === editing.id) : undefined;
  return (
    <div className="space-y-4">
      {editing ? (
        <Wizard key={editing.id ?? "new"} {...p} row={editRow} onClose={() => setEditing(null)} />
      ) : (
        <Card className="p-4 sm:p-5">
          <CardHead
            title="관리비 항목"
            description="관리비에 들어가는 항목입니다. 부가세 여부나 공급자를 바꾸면 부가세 확인을 다시 받아야 합니다."
            action={
              <>
                <Button type="button" size="sm" variant="ghost" aria-pressed={showOff} onClick={() => setShowOff((v) => !v)}>{showOff ? "사용하지 않는 항목 숨기기" : "사용하지 않는 항목 보기"}</Button>
                {p.canConfigure && <Button type="button" size="sm" onClick={() => setEditing({ id: null })}>항목 추가</Button>}
              </>
            }
          />
          {rows.length === 0 ? (
            <EmptyState title="등록된 항목이 없습니다." description={p.canConfigure ? "'항목 추가'를 눌러 차례대로 첫 항목을 만드세요. 항목이 있어야 관리비를 계산할 수 있습니다." : "관리자가 항목을 만들면 여기에 나타납니다."} />
          ) : (
            <div className="relative overflow-x-auto">
              <table className={TABLE}>
                <thead className={THEAD}><tr><th className={TH}>항목</th><th className={TH}>분류</th><th className={TH}>금액이 어디서</th><th className={TH}>나누는 방법</th><th className={TH}>누가 내나</th><th className={TH}>부가세</th><th className={TH}>부가세 확인</th><th className={TH}><span className="sr-only">작업</span></th></tr></thead>
                <tbody>{rows.map((r) => <ChargeRow key={r.id} r={r} p={p} onEdit={() => setEditing({ id: r.id })} />)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ChargeRow({ r, p, onEdit }: { r: ChargeTypeRow; p: ChargesProps; onEdit: () => void }) {
  const { run, pending, error, setError } = useRunAction();
  const [reason, setReason] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string | undefined>();
  const needsApproval = r.tax_treatment === "taxable" || r.tax_treatment === "exempt";
  const approved = !!r.tax_approved_at;
  return (
    <>
      <tr className={TR}>
        <td className={TD}>{r.name}{!r.active && <> <Badge kind="warning">미사용</Badge></>}</td>
        <td className={TD}>{STD_CATEGORY_LABEL[r.std_category]}</td>
        <td className={TD}>{SOURCE_LABEL[r.source_kind].split("(")[0]}</td>
        <td className={TD}>{ALLOC_LABEL[r.alloc_method]}{r.meter_kind ? ` · ${METER_KIND_LABEL[r.meter_kind]}` : ""}</td>
        <td className={TD}>{PAYER_LABEL[r.payer].split("(")[0]}</td>
        <td className={TD}>{TAX_LABEL[r.tax_treatment].split("(")[0]}</td>
        <td className={TD}>{!needsApproval ? <span className="text-t3">해당 없음</span> : approved ? <Badge kind="success">확인됨</Badge> : <Badge kind="warning">확인 대기</Badge>}</td>
        <td className={`${TD} whitespace-nowrap text-right`}>
          {p.canApproveTax && needsApproval && !approved && r.active && <Button type="button" size="sm" variant="secondary" loading={pending} onClick={async () => {
            setHint(undefined);
            const x = await run(() => approveChargeTypeTax(p.businessId, r.id, reason?.trim() || undefined), { success: "부가세 처리를 확인했습니다." });
            if (!x.ok) { setHint(x.hint); if (x.hint === "reason_required") { setReason((v) => v ?? ""); setError("만든 사람이 직접 확인하는 경우라 이유가 필요합니다. 아래에 이유를 적고 다시 누르세요."); } }
          }}>부가세 확인</Button>}{" "}
          {p.canConfigure && r.active && <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => { if (window.confirm(`"${r.name}" 항목을 그만 쓸까요? 이미 확정된 관리비는 그대로 두고, 다음 계산부터 빠집니다.`)) void run(() => updateChargeType(p.businessId, r.id, { active: false }), { success: "항목을 그만 씁니다." }); }}>그만 쓰기</Button>}{" "}
          {p.canConfigure && !r.active && <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => run(() => updateChargeType(p.businessId, r.id, { active: true }), { success: "항목을 다시 사용합니다." })}>다시 사용</Button>}{" "}
          {p.canConfigure && <Button type="button" size="sm" variant="ghost" onClick={onEdit}>수정</Button>}
        </td>
      </tr>
      {(error || reason !== null) && (
        <tr><td colSpan={8} className="px-3 pb-3">
          {error && <Alert kind="error">{error}
            {hint === "approver_must_differ" && (
              <span className="mt-1 block">담당자가 한 명뿐이면 <Link href={`/w/${p.businessId}/settings`} className="font-medium underline">선택 기능 설정</Link>에서 「직접 확정 허용」을 켜면 만든 사람이 이유를 남기고 직접 확인할 수 있습니다.</span>
            )}
          </Alert>}
          {reason !== null && <Input label="직접 확인하는 이유(필수)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} wrapperClassName="mt-2 w-full sm:w-[360px]" />}
        </td></tr>
      )}
    </>
  );
}

function Wizard(p: ChargesProps & { row?: ChargeTypeRow; onClose: () => void }) {
  const isEdit = !!p.row;
  const [step, setStep] = React.useState(0);
  const [d, setD] = React.useState<ChargeDraft>(() => (p.row ? draftFrom(p.row) : emptyDraft()));
  const [sample, setSample] = React.useState("1000000");
  const [touched, setTouched] = React.useState(false);
  const { run, pending, error } = useRunAction();
  const set = <K extends keyof ChargeDraft>(k: K, v: ChargeDraft[K]) => setD((o) => ({ ...o, [k]: v }));
  const err = touched ? stepError(step, d) : null;
  const next = () => { setTouched(true); if (!stepError(step, d)) { setStep(step + 1); setTouched(false); } };
  const preview = step === 4 ? previewOf(d, p.units, Number(sample)) : null;
  const taxChanged = isEdit && p.row && p.row.tax_approved_at && (p.row.tax_treatment !== d.tax_treatment || (p.row.supplier_party_id ?? "") !== d.supplier_party_id || p.row.rate_includes_vat !== d.rate_includes_vat);

  const save = async () => {
    const bad = firstBadStep(d);
    if (bad >= 0) { setStep(bad); setTouched(true); return; }
    const input = draftToInput(d);
    const r = await run(() => (isEdit ? updateChargeType(p.businessId, p.row!.id, input) : createChargeType(p.businessId, p.buildingId, input)), { success: isEdit ? "항목을 수정했습니다." : "항목을 만들었습니다." });
    if (r.ok) p.onClose();
  };

  return (
    <Card className="p-4 sm:p-5">
      <CardHead title={isEdit ? `항목 수정: ${p.row!.name}` : "항목 추가"} description={`${step + 1} / ${STEPS.length}단계 ${STEPS[step]}`} />
      <ol className="mb-4 flex flex-wrap gap-1.5" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-full border px-3 py-1 text-[length:var(--fs-meta)] ${i === step ? "border-[var(--brand)] bg-sf2 font-semibold text-t" : i < step ? "border-[var(--bd)] text-t2" : "border-[var(--bd)] text-t3"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="max-w-[720px]">
        {step === 0 && (
          <>
            <Input label="항목 이름" required value={d.name} maxLength={60} onChange={(e) => set("name", e.target.value)} wrapperClassName="w-full sm:w-[240px]" />
            <SelectField label="분류" required value={d.std_category} onChange={(e) => set("std_category", e.target.value as ChargeDraft["std_category"])} hint="법에서 정한 분류입니다. 보고서와 명세서에서 이 분류로 묶입니다." wrapperClassName="w-full sm:w-auto sm:min-w-[200px] sm:max-w-[280px]">
              <option value="">선택하세요</option>
              {STD_CATEGORIES.map((c) => <option key={c} value={c}>{STD_CATEGORY_LABEL[c]}</option>)}
            </SelectField>
            <Input label="메모(선택)" value={d.memo} maxLength={200} onChange={(e) => set("memo", e.target.value)} wrapperClassName="w-full sm:w-[360px]" />
          </>
        )}
        {step === 1 && (
          <Choice legend="금액은 어디서 나오나요" value={d.source_kind} onChange={(v) => setD((o) => ({ ...o, source_kind: v, alloc_method: allocOptions(v).includes(o.alloc_method as AllocMethod) ? o.alloc_method : v === "direct" ? "direct" : "" }))}
            options={(["expense", "rate", "direct"] as const).map((v) => ({ v, label: SOURCE_LABEL[v], hint: SOURCE_HINT[v] }))} />
        )}
        {step === 2 && (
          <Choice legend="누가 내나요" value={d.payer} onChange={(v: Payer) => set("payer", v)}
            options={(["tenant", "owner", "association"] as const).map((v) => ({ v, label: PAYER_LABEL[v] }))}
            hint="관리단이 부담하는 비용은 호실 관리비에 넣지 않습니다. 호실에 나누려면 입주자나 소유자를 고르세요." />
        )}
        {step === 3 && (
          <>
            <Choice legend="어떻게 나누나요" value={d.alloc_method} onChange={(v: AllocMethod) => set("alloc_method", v)}
              options={allocOptions(d.source_kind).map((v) => ({ v, label: ALLOC_LABEL[v] }))}
              hint={d.source_kind === "direct" ? "직접 적는 항목은 나누는 방법을 바꿀 수 없습니다." : undefined} />
            {d.alloc_method === "meter_usage" && (
              <SelectField label="어떤 계량기인가요" required value={d.meter_kind} onChange={(e) => set("meter_kind", e.target.value as MeterKind)} hint="그 달 모든 호실의 검침값을 적어야 계산됩니다." wrapperClassName="w-full sm:w-auto sm:min-w-[128px] sm:max-w-[280px]">
                <option value="">선택하세요</option>
                {(Object.keys(METER_KIND_LABEL) as MeterKind[]).map((k) => <option key={k} value={k}>{METER_KIND_LABEL[k]}</option>)}
              </SelectField>
            )}
            {d.source_kind === "rate" && d.alloc_method === "fixed" && <Input label="호실마다 정액(원)" required inputMode="numeric" value={d.fixed_amount} onChange={(e) => set("fixed_amount", e.target.value.replace(/[^\d]/g, ""))} className={MONEY_INPUT} wrapperClassName="w-full sm:w-[200px]" />}
            {d.source_kind === "rate" && d.alloc_method && d.alloc_method !== "fixed" && (
              <>
                <Input label={d.alloc_method === "meter_usage" ? "사용량 1만큼의 값(원)" : "기준 1만큼의 값(원)"} required inputMode="decimal" value={d.unit_rate} onChange={(e) => set("unit_rate", e.target.value.replace(/[^\d.]/g, ""))} className={MONEY_INPUT} wrapperClassName="w-full sm:w-[200px]" />
                <label className="mb-4 flex min-h-[44px] items-center gap-2 text-[length:var(--fs-body)] text-t"><input type="checkbox" checked={d.rate_includes_vat} onChange={(e) => set("rate_includes_vat", e.target.checked)} />이 값에 부가세가 이미 들어 있음</label>
              </>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <Choice legend="부가세가 있나요" value={d.tax_treatment} onChange={(v: TaxTreatment) => set("tax_treatment", v)} options={(["taxable", "exempt", "non_taxable", "pass_through"] as const).map((v) => ({ v, label: TAX_LABEL[v] }))} />
            <SelectField label="세금계산서 발행처(선택)" value={d.supplier_party_id} onChange={(e) => set("supplier_party_id", e.target.value)} hint="세금계산서에 '공급자'로 적히는 곳입니다." wrapperClassName="w-full sm:w-auto sm:min-w-[128px] sm:max-w-[320px]">
              <option value="">정하지 않음</option>
              {p.parties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </SelectField>
            {(d.tax_treatment === "taxable" || d.tax_treatment === "exempt") && (
              <Alert kind="warning" className="mb-4">부가세 있음·없음 항목은 저장한 뒤, 만든 사람이 아닌 다른 담당자가 확인해야 세금계산서 대상에 들어갑니다.</Alert>
            )}
            {taxChanged && <Alert kind="warning" className="mb-4">부가세 여부, 발행처, 부가세 포함 여부를 바꾸면 부가세 확인을 다시 받아야 합니다.</Alert>}
            <h3 className="mb-2 text-[length:var(--fs-body)] font-semibold text-t">호실에 나누면 이렇게 됩니다 <Badge kind="info">참고용</Badge></h3>
            {d.source_kind === "expense" && d.payer !== "association" && d.alloc_method !== "meter_usage" && (
              <Input label="예시 총액(원)" inputMode="numeric" value={sample} onChange={(e) => setSample(e.target.value.replace(/[^\d]/g, ""))} className={MONEY_INPUT} wrapperClassName="w-full sm:w-[200px]" hint="나누는 모습을 보려는 예시 숫자입니다. 실제 금액은 비용 입력에서 적습니다." />
            )}
            {preview?.kind === "note" && <Alert kind="warning">{preview.text}</Alert>}
            {preview?.kind === "rows" && (
              <div className="max-h-[320px] overflow-auto">
                <table className={TABLE}>
                  <thead className={THEAD}><tr><th className={TH}>호실</th><th className={`${TH} text-right`}>예상 금액</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => <tr key={r.id} className={TR}><td className={TD}>{r.label}</td><td className={`${TD} text-right tabular-nums`}>{won(r.amount)}</td></tr>)}
                    <tr className={TR}><td className={`${TD} font-semibold`}>합계</td><td className={`${TD} text-right font-semibold tabular-nums`}>{won(preview.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {err && <Alert kind="error" className="mt-3">{err}</Alert>}
      {error && <Alert kind="error" className="mt-3">{error}</Alert>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={p.onClose}>취소</Button>
        {step > 0 && <Button type="button" variant="secondary" onClick={() => { setStep(step - 1); setTouched(false); }}>이전</Button>}
        {step < STEPS.length - 1 ? <Button type="button" onClick={next}>다음</Button> : <Button type="button" loading={pending} onClick={save}>{isEdit ? "수정 저장" : "항목 저장"}</Button>}
      </div>
    </Card>
  );
}
