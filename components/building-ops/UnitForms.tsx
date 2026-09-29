"use client";

/**
 * 호실 상세의 입력 조각: 기본 정보 수정, 계약 등록, 연체 조건 입력·승인, 청구서 받는 곳/세금계산서 상대 정보 수정.
 * 전부 서버 액션이 cap 을 다시 검사한다. 연체 승인은 입력한 사람과 다른 사람만 가능(서버 approver_must_differ 문구를 그대로 보여준다).
 */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert, SelectField, CardHead, TEXTAREA } from "@/components/rental/listkit";
import { approveLateTerms, createContract, createParty, updateContract, updateParty, updateUnit } from "@/lib/domain/building-actions";
import type { ContractRow, LateMethod, LateRateUnit, PartyRow, UnitRow, UnitUseKind } from "@/lib/domain/building-types";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { emptyLateForm, lateFormComplete, lateFormFrom, lateFormToPatch, lateStatusOf, type LateForm } from "./late-terms";
import { USE_KIND_LABEL, parseRange } from "./unit-parse";

export function UnitBasicForm({ businessId, unit, canWrite }: { businessId: string; unit: UnitRow; canWrite: boolean }) {
  const { run, pending, error } = useRunAction();
  const [f, setF] = React.useState({ dong: unit.dong ?? "", floor: unit.floor ?? "", unit_no: unit.unit_no, use: unit.use_kind, ex: String(unit.area_exclusive), co: String(unit.area_common), share: String(unit.share), weight: String(unit.weight), memo: unit.memo ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="기본 정보" description="면적·지분·비율은 관리비를 호실에 나눌 때 쓰는 숫자입니다. 바꾸면 다음 계산부터 적용됩니다." />
      <form className={FORM_ROW} onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateUnit(businessId, unit.id, { dong: f.dong.trim() || null, floor: f.floor.trim() || null, unit_no: f.unit_no.trim(), use_kind: f.use, area_exclusive: Number(f.ex) || 0, area_common: Number(f.co) || 0, share: Number(f.share) || 0, weight: Number(f.weight) || 0, memo: f.memo.trim() || null }), { success: "저장했습니다." });
      }}>
        <Input label="동" value={f.dong} onChange={set("dong")} disabled={!canWrite} maxLength={20} wrapperClassName={FW.short} />
        <Input label="층" value={f.floor} onChange={set("floor")} disabled={!canWrite} maxLength={20} wrapperClassName={FW.short} />
        <Input label="호실 번호" required value={f.unit_no} onChange={set("unit_no")} disabled={!canWrite} maxLength={20} wrapperClassName={FW.short} />
        <SelectField label="용도" value={f.use} onChange={(e) => setF((p) => ({ ...p, use: e.target.value as UnitUseKind }))} disabled={!canWrite} wrapperClassName={FW.select}>
          {(Object.keys(USE_KIND_LABEL) as UnitUseKind[]).map((k) => <option key={k} value={k}>{USE_KIND_LABEL[k]}</option>)}
        </SelectField>
        <Input label="전용면적(㎡)" type="number" step="any" min={0} value={f.ex} onChange={set("ex")} disabled={!canWrite} className={MONEY_INPUT} wrapperClassName={FW.short} />
        <Input label="공용면적(㎡)" type="number" step="any" min={0} value={f.co} onChange={set("co")} disabled={!canWrite} className={MONEY_INPUT} wrapperClassName={FW.short} />
        <Input label="지분(%)" type="number" step="any" min={0} value={f.share} onChange={set("share")} disabled={!canWrite} className={MONEY_INPUT} wrapperClassName={FW.short} />
        <Input label="나누는 비율" hint="보통 1, 더 내면 2" type="number" step="any" min={0} value={f.weight} onChange={set("weight")} disabled={!canWrite} className={MONEY_INPUT} wrapperClassName={FW.short} />
        <div className="w-full sm:max-w-[720px]">
          <label htmlFor="unit-memo" className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">메모</label>
          <textarea id="unit-memo" className={`${TEXTAREA} mb-3 min-h-[80px]`} value={f.memo} onChange={set("memo")} disabled={!canWrite} maxLength={500} />
          {error && <Alert kind="error" className="mb-3">{error}</Alert>}
          {canWrite ? <Button type="submit" loading={pending}>저장</Button> : <Alert kind="warning">고칠 권한이 없어 볼 수만 있습니다.</Alert>}
        </div>
      </form>
    </Card>
  );
}

const RATE_UNIT: Record<LateRateUnit, string> = { annual: "연", monthly: "월", daily: "일" };
const METHOD: Record<LateMethod, string> = { simple: "단리(안 낸 돈에만)", compound_monthly: "월 복리(연체료에도 또)" };

/** 연체 조건 입력칸. 기본값 없음 — 계약서 문구대로 전부 사람이 입력한다. */
export function LateTermsFields({ value, onChange, disabled }: { value: LateForm; onChange: (v: LateForm) => void; disabled?: boolean }) {
  const set = <K extends keyof LateForm>(k: K, v: LateForm[K]) => onChange({ ...value, [k]: v });
  return (
    <fieldset className={`${FORM_ROW} mb-4`} disabled={disabled}>
      <legend className="mb-2 text-[length:var(--fs-body)] font-semibold text-t">늦게 내면 붙는 돈(연체료) — 계약서에 적힌 대로</legend>
      <Input label="이율(%)" type="number" step="any" min={0} value={value.rate} onChange={(e) => set("rate", e.target.value)} className={MONEY_INPUT} wrapperClassName={FW.short} />
      <SelectField label="이율 기준" wrapperClassName={FW.select} value={value.unit} onChange={(e) => set("unit", e.target.value as LateForm["unit"])}>
        <option value="">선택</option>{(Object.keys(RATE_UNIT) as LateRateUnit[]).map((k) => <option key={k} value={k}>{RATE_UNIT[k]} 이율</option>)}
      </SelectField>
      <SelectField label="계산 방식" wrapperClassName={FW.select} value={value.method} onChange={(e) => set("method", e.target.value as LateForm["method"])}>
        <option value="">선택</option>{(Object.keys(METHOD) as LateMethod[]).map((k) => <option key={k} value={k}>{METHOD[k]}</option>)}
      </SelectField>
      <Input label="봐주는 날수" type="number" step={1} min={0} value={value.grace} onChange={(e) => set("grace", e.target.value)} className={MONEY_INPUT} wrapperClassName={FW.short} hint="납부기한 뒤 이 날수까지는 안 붙음" />
      <SelectField label="무엇에 붙이나" wrapperClassName={FW.select} value={value.basis} onChange={(e) => set("basis", e.target.value as LateForm["basis"])}>
        <option value="">선택</option><option value="principal">안 낸 관리비에만</option><option value="principal_and_fee">안 낸 관리비+이전 연체료</option>
      </SelectField>
      <SelectField label="일부만 내면 먼저 갚는 것" wrapperClassName={FW.select} value={value.order} onChange={(e) => set("order", e.target.value as LateForm["order"])}>
        <option value="">선택</option><option value="oldest_first">오래된 달부터</option><option value="fee_first">연체료부터</option>
      </SelectField>
      <Input label="최대(안 낸 돈의 %)" wrapperClassName={FW.short} type="number" step="any" min={0} value={value.capNone ? "" : value.capPct} disabled={value.capNone} onChange={(e) => set("capPct", e.target.value)} className={MONEY_INPUT} />
      <label className="flex min-h-[44px] items-center gap-2 self-end sm:mt-[30px] text-[length:var(--fs-body)] text-t">
        <input type="checkbox" checked={value.capNone} onChange={(e) => set("capNone", e.target.checked)} className="h-[20px] w-[20px]" />
        최대 없음(계약서에 없을 때만)
      </label>
    </fieldset>
  );
}

const STATUS_PILL = { approved: ["success", "확정됨"], pending: ["warning", "확정 기다림"], incomplete: ["error", "덜 적음"], unset: ["info", "안 정함"] } as const;

/** 활성 계약 카드: 연체 조건 입력 → 저장 → (다른 담당자가) 승인. */
export function ContractCard({ businessId, contract, tenantName, canWrite, canApprove, lateFeeOn }: { businessId: string; contract: ContractRow; tenantName: string; canWrite: boolean; canApprove: boolean; lateFeeOn: boolean }) {
  const { run, pending, error } = useRunAction();
  const [late, setLate] = React.useState<LateForm>(() => lateFormFrom(contract));
  const [reason, setReason] = React.useState("");
  const range = parseRange(contract.period);
  const st = lateStatusOf(contract);
  const [kind, label] = STATUS_PILL[st];
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title={`${tenantName} 계약`} description={`${range.from} ~ ${range.to ?? "기한 없음"} · ${contract.status === "active" ? "진행 중" : "종료"}`} action={lateFeeOn ? <Badge kind={kind}>{`연체료 조건 ${label}`}</Badge> : <Badge kind="info">연체료 안 씀</Badge>} />
      {lateFeeOn ? (
        <>
          <LateTermsFields value={late} onChange={setLate} disabled={!canWrite} />
          {error && <Alert kind="error" className="mb-3">{error}</Alert>}
          <div className="flex flex-wrap items-end gap-2">
            {canWrite && <Button type="button" variant="secondary" loading={pending} onClick={() => void run(() => updateContract(businessId, contract.id, lateFormToPatch(late)), { success: "연체료 조건을 저장했습니다." })}>연체료 조건 저장</Button>}
            {canApprove && st === "pending" && (
              <>
                <Input label="확정 메모(선택)" value={reason} onChange={(e) => setReason(e.target.value)} wrapperClassName={FW.memo} maxLength={120} />
                <Button type="button" loading={pending} onClick={() => void run(() => approveLateTerms(businessId, contract.id, reason.trim() || undefined), { success: "연체료 조건을 확정했습니다." })}>연체료 조건 확정</Button>
              </>
            )}
          </div>
          {st === "pending" && !canApprove && <p className="mt-3 text-[length:var(--fs-meta)] text-t3">확정은 적은 사람이 아닌 다른 담당자(확정 권한 있음)가 합니다.</p>}
          {st === "approved" && <p className="mt-3 text-[length:var(--fs-meta)] text-t3">확정된 조건입니다. 값을 바꿔 저장하면 다시 확정을 받아야 합니다.</p>}
        </>
      ) : (
        <p className="text-[length:var(--fs-body)] text-t2">연체료를 쓰지 않도록 꺼져 있습니다. 설정 화면의 선택 기능에서 켤 수 있습니다.</p>
      )}
    </Card>
  );
}

export function ContractCreate({ businessId, buildingId, unitId, parties, canWrite, lateFeeOn }: { businessId: string; buildingId: string; unitId: string; parties: { id: string; name: string }[]; canWrite: boolean; lateFeeOn: boolean }) {
  const { run, pending, error, setError } = useRunAction();
  const [open, setOpen] = React.useState(false);
  const [tenant, setTenant] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [f, setF] = React.useState({ from: "", to: "", rent: "", deposit: "", proration: "none" as "none" | "daily", memo: "" });
  const [late, setLate] = React.useState<LateForm>(emptyLateForm());
  const [lateOn, setLateOn] = React.useState(false);
  if (!canWrite) return null;
  const setv = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const dateOk = f.from !== "" && (f.to === "" || f.to > f.from);
  const tenantOk = tenant === "__new" ? newName.trim() !== "" : tenant !== "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let tenantId = tenant;
    if (tenant === "__new") {
      const p = await run(() => createParty(businessId, { name: newName.trim(), kind: "corp" }), { refresh: false });
      if (!p.ok) return;
      tenantId = p.data.id;
    }
    const r = await run(() => createContract(businessId, buildingId, {
      unit_id: unitId, tenant_party_id: tenantId, from: f.from, to: f.to || null, rent: Number(f.rent) || 0, deposit: Number(f.deposit) || 0, proration: f.proration, memo: f.memo.trim() || undefined,
      ...(lateFeeOn && lateOn ? lateFormToPatch(late) : {}),
    }), { success: "계약을 등록했습니다." });
    if (r.ok) { setOpen(false); setTenant(""); setNewName(""); }
  }
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="입주 계약 등록" description="같은 호실의 계약 기간은 겹칠 수 없습니다. 보증금은 관리비 합계에 들어가지 않습니다." action={<Button type="button" variant={open ? "ghost" : "secondary"} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "닫기" : "계약 등록"}</Button>} />
      {open && (
        <form onSubmit={submit} className={FORM_ROW}>
          <SelectField label="입주자" required value={tenant} onChange={(e) => setTenant(e.target.value)} wrapperClassName={FW.select}>
            <option value="">선택</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new">+ 새 입주자 등록</option>
          </SelectField>
          {tenant === "__new" && <Input label="새 입주자 상호(이름)" required value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} wrapperClassName={FW.name} />}
          <Input label="계약 시작일" type="date" required value={f.from} onChange={setv("from")} wrapperClassName={FW.date} />
          <Input label="계약 끝나는 날" hint="비우면 기한 없음" type="date" value={f.to} onChange={setv("to")} wrapperClassName={FW.date} error={f.to && f.from && f.to <= f.from ? "끝나는 날은 시작일보다 뒤여야 합니다." : undefined} />
          <Input label="월세(원)" inputMode="numeric" value={f.rent} onChange={setv("rent")} className={MONEY_INPUT} wrapperClassName={FW.money} />
          <Input label="보증금(원)" inputMode="numeric" value={f.deposit} onChange={setv("deposit")} className={MONEY_INPUT} wrapperClassName={FW.money} />
          <SelectField label="달 중간에 들고 날 때" value={f.proration} onChange={setv("proration")} wrapperClassName={FW.select}>
            <option value="none">한 달 치 그대로</option><option value="daily">있던 날만큼만</option>
          </SelectField>
          <div className="w-full">
            {lateFeeOn && (
              <>
                <label className="mb-3 flex min-h-[44px] items-center gap-2 text-[length:var(--fs-body)] text-t"><input type="checkbox" className="h-[20px] w-[20px]" checked={lateOn} onChange={(e) => setLateOn(e.target.checked)} />연체료 조건을 지금 적기(나중에 적어도 됩니다)</label>
                {lateOn && <><LateTermsFields value={late} onChange={setLate} />{!lateFormComplete(late) && <p className="mb-3 text-[length:var(--fs-meta)] text-t3">일부만 적으면 &lsquo;덜 적음&rsquo;으로 저장되고 연체료는 붙지 않습니다.</p>}</>}
              </>
            )}
            {error && <Alert kind="error" className="mb-3">{error}</Alert>}
            <Button type="submit" loading={pending} disabled={!tenantOk || !dateOk}>계약 등록</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** 세금계산서를 받을 상대(사업자) 정보 수정. 사업자번호 검증숫자는 서버가 검사한다.
 *  pii.read 가 없으면 서버가 사업자번호·대표자·주소를 null 로 내려준다(0034 S-02). 그때는 입력을 잠그고 저장 값에서도 뺀다(빈 값으로 덮어쓰기 방지). */
const NO_PII = "권한 없음";

export function PartyForm({ businessId, party, canWrite, canPii }: { businessId: string; party: PartyRow; canWrite: boolean; canPii: boolean }) {
  const { run, pending, error } = useRunAction();
  const [f, setF] = React.useState({ name: party.name, biz: party.biz_reg_no ?? "", ceo: party.ceo_name ?? "", addr: party.address ?? "", type: party.biz_type ?? "", item: party.biz_item ?? "", email: party.email ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form className={FORM_ROW} onSubmit={(e) => {
      e.preventDefault();
      void run(() => updateParty(businessId, party.id, { name: f.name.trim(), biz_type: f.type.trim() || null, biz_item: f.item.trim() || null, ...(canPii ? { biz_reg_no: f.biz || null, ceo_name: f.ceo.trim() || null, address: f.addr.trim() || null, email: f.email.trim() || null } : {}) }), { success: "저장했습니다." });
    }}>
      <Input label="상호" required value={f.name} onChange={set("name")} disabled={!canWrite} maxLength={60} wrapperClassName={FW.name} />
      <Input label="사업자등록번호" inputMode="numeric" value={canPii ? f.biz : NO_PII} onChange={set("biz")} disabled={!canWrite || !canPii} maxLength={12} className="tabular-nums" wrapperClassName={FW.doc} hint={canPii ? "10자리, - 없이 적어도 됩니다." : "개인정보를 볼 권한이 필요합니다."} />
      <Input label="대표자" value={canPii ? f.ceo : NO_PII} onChange={set("ceo")} disabled={!canWrite || !canPii} maxLength={40} wrapperClassName={FW.mid} />
      <Input label="주소" value={canPii ? f.addr : NO_PII} onChange={set("addr")} disabled={!canWrite || !canPii} maxLength={120} wrapperClassName={FW.memo} />
      <Input label="업태" value={f.type} onChange={set("type")} disabled={!canWrite} maxLength={40} wrapperClassName={FW.mid} />
      <Input label="종목" value={f.item} onChange={set("item")} disabled={!canWrite} maxLength={40} wrapperClassName={FW.mid} />
      {canPii && <Input label="세금계산서 받을 이메일" type="email" value={f.email} onChange={set("email")} disabled={!canWrite} maxLength={80} wrapperClassName={FW.name} />}
      <div className={FORM_ACTIONS}>
        {error && <Alert kind="error" className="w-full">{error}</Alert>}
        {canWrite && <Button type="submit" loading={pending}>저장</Button>}
      </div>
    </form>
  );
}
