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
import { useRunAction } from "./client-common";
import { emptyLateForm, lateFormComplete, lateFormFrom, lateFormToPatch, lateStatusOf, type LateForm } from "./late-terms";
import { USE_KIND_LABEL, parseRange } from "./unit-parse";

export function UnitBasicForm({ businessId, unit, canWrite }: { businessId: string; unit: UnitRow; canWrite: boolean }) {
  const { run, pending, error } = useRunAction();
  const [f, setF] = React.useState({ dong: unit.dong ?? "", floor: unit.floor ?? "", unit_no: unit.unit_no, use: unit.use_kind, ex: String(unit.area_exclusive), co: String(unit.area_common), share: String(unit.share), weight: String(unit.weight), memo: unit.memo ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="기본 정보" description="면적·지분·가중치는 관리비 배분의 기준입니다. 바꾸면 다음 계산부터 반영됩니다." />
      <form className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateUnit(businessId, unit.id, { dong: f.dong.trim() || null, floor: f.floor.trim() || null, unit_no: f.unit_no.trim(), use_kind: f.use, area_exclusive: Number(f.ex) || 0, area_common: Number(f.co) || 0, share: Number(f.share) || 0, weight: Number(f.weight) || 0, memo: f.memo.trim() || null }), { success: "저장했습니다." });
      }}>
        <Input label="동" value={f.dong} onChange={set("dong")} disabled={!canWrite} maxLength={20} />
        <Input label="층" value={f.floor} onChange={set("floor")} disabled={!canWrite} maxLength={20} />
        <Input label="호실 번호" required value={f.unit_no} onChange={set("unit_no")} disabled={!canWrite} maxLength={20} />
        <SelectField label="용도" value={f.use} onChange={(e) => setF((p) => ({ ...p, use: e.target.value as UnitUseKind }))} disabled={!canWrite}>
          {(Object.keys(USE_KIND_LABEL) as UnitUseKind[]).map((k) => <option key={k} value={k}>{USE_KIND_LABEL[k]}</option>)}
        </SelectField>
        <Input label="전용면적(㎡)" type="number" step="any" min={0} value={f.ex} onChange={set("ex")} disabled={!canWrite} className="tabular-nums" />
        <Input label="공용면적(㎡)" type="number" step="any" min={0} value={f.co} onChange={set("co")} disabled={!canWrite} className="tabular-nums" />
        <Input label="지분(%)" type="number" step="any" min={0} value={f.share} onChange={set("share")} disabled={!canWrite} className="tabular-nums" />
        <Input label="가중치" type="number" step="any" min={0} value={f.weight} onChange={set("weight")} disabled={!canWrite} className="tabular-nums" />
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor="unit-memo" className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">메모</label>
          <textarea id="unit-memo" className={`${TEXTAREA} mb-4 min-h-[80px]`} value={f.memo} onChange={set("memo")} disabled={!canWrite} maxLength={500} />
          {error && <Alert kind="error" className="mb-3">{error}</Alert>}
          {canWrite ? <Button type="submit" loading={pending}>저장</Button> : <Alert kind="warning">쓰기 권한이 없어 볼 수만 있습니다.</Alert>}
        </div>
      </form>
    </Card>
  );
}

const RATE_UNIT: Record<LateRateUnit, string> = { annual: "연", monthly: "월", daily: "일" };
const METHOD: Record<LateMethod, string> = { simple: "단리", compound_monthly: "월 복리" };

/** 연체 조건 입력칸. 기본값 없음 — 계약서 문구대로 전부 사람이 입력한다. */
export function LateTermsFields({ value, onChange, disabled }: { value: LateForm; onChange: (v: LateForm) => void; disabled?: boolean }) {
  const set = <K extends keyof LateForm>(k: K, v: LateForm[K]) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4" disabled={disabled}>
      <legend className="mb-2 text-[length:var(--fs-body)] font-semibold text-t">연체 조건(계약서 기준으로 입력)</legend>
      <Input label="이율(%)" type="number" step="any" min={0} value={value.rate} onChange={(e) => set("rate", e.target.value)} className="tabular-nums" />
      <SelectField label="이율 단위" value={value.unit} onChange={(e) => set("unit", e.target.value as LateForm["unit"])}>
        <option value="">선택</option>{(Object.keys(RATE_UNIT) as LateRateUnit[]).map((k) => <option key={k} value={k}>{RATE_UNIT[k]} 이율</option>)}
      </SelectField>
      <SelectField label="계산 방식" value={value.method} onChange={(e) => set("method", e.target.value as LateForm["method"])}>
        <option value="">선택</option>{(Object.keys(METHOD) as LateMethod[]).map((k) => <option key={k} value={k}>{METHOD[k]}</option>)}
      </SelectField>
      <Input label="유예일수" type="number" step={1} min={0} value={value.grace} onChange={(e) => set("grace", e.target.value)} className="tabular-nums" hint="납부기한 다음 날부터 이 일수는 연체료를 매기지 않습니다." />
      <SelectField label="연체료 기준 금액" value={value.basis} onChange={(e) => set("basis", e.target.value as LateForm["basis"])}>
        <option value="">선택</option><option value="principal">원금만</option><option value="principal_and_fee">원금과 이전 연체료 합계</option>
      </SelectField>
      <SelectField label="일부 납부 시 충당 순서" value={value.order} onChange={(e) => set("order", e.target.value as LateForm["order"])}>
        <option value="">선택</option><option value="oldest_first">오래된 채권부터</option><option value="fee_first">연체료부터</option>
      </SelectField>
      <Input label="상한(원금 대비 %)" type="number" step="any" min={0} value={value.capNone ? "" : value.capPct} disabled={value.capNone} onChange={(e) => set("capPct", e.target.value)} className="tabular-nums" />
      <label className="mb-4 flex min-h-[44px] items-center gap-2 self-end text-[length:var(--fs-body)] text-t">
        <input type="checkbox" checked={value.capNone} onChange={(e) => set("capNone", e.target.checked)} className="h-[20px] w-[20px]" />
        상한 없음(계약서에 상한이 없을 때만)
      </label>
    </fieldset>
  );
}

const STATUS_PILL = { approved: ["success", "승인됨"], pending: ["warning", "승인 대기"], incomplete: ["error", "입력 미완"], unset: ["info", "미설정"] } as const;

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
      <CardHead title={`${tenantName} 계약`} description={`${range.from} ~ ${range.to ?? "기한 없음"} · ${contract.status === "active" ? "진행 중" : "종료"}`} action={lateFeeOn ? <Badge kind={kind}>{`연체 조건 ${label}`}</Badge> : <Badge kind="info">연체료 기능 꺼짐</Badge>} />
      {lateFeeOn ? (
        <>
          <LateTermsFields value={late} onChange={setLate} disabled={!canWrite} />
          {error && <Alert kind="error" className="mb-3">{error}</Alert>}
          <div className="flex flex-wrap items-end gap-2">
            {canWrite && <Button type="button" variant="secondary" loading={pending} onClick={() => void run(() => updateContract(businessId, contract.id, lateFormToPatch(late)), { success: "연체 조건을 저장했습니다." })}>연체 조건 저장</Button>}
            {canApprove && st === "pending" && (
              <>
                <Input label="승인 사유(선택)" value={reason} onChange={(e) => setReason(e.target.value)} wrapperClassName="mb-0 min-w-[220px]" maxLength={120} />
                <Button type="button" loading={pending} onClick={() => void run(() => approveLateTerms(businessId, contract.id, reason.trim() || undefined), { success: "연체 조건을 승인했습니다." })}>연체 조건 승인</Button>
              </>
            )}
          </div>
          {st === "pending" && !canApprove && <p className="mt-3 text-[length:var(--fs-meta)] text-t3">승인은 관리비 승인 권한이 있는 다른 담당자가 합니다.</p>}
          {st === "approved" && <p className="mt-3 text-[length:var(--fs-meta)] text-t3">승인된 조건입니다. 값을 바꿔 저장하면 서버가 승인을 다시 받도록 처리합니다.</p>}
        </>
      ) : (
        <p className="text-[length:var(--fs-body)] text-t2">연체료 기능이 꺼져 있어 연체 조건을 받지 않습니다. 설정 화면의 선택 기능에서 켤 수 있습니다.</p>
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
      <CardHead title="입주 계약 등록" description="같은 호실의 계약 기간은 겹칠 수 없습니다. 보증금은 관리비 매출에 합산되지 않습니다." action={<Button type="button" variant={open ? "ghost" : "secondary"} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "닫기" : "계약 등록"}</Button>} />
      {open && (
        <form onSubmit={submit} className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="입주자(임차인)" required value={tenant} onChange={(e) => setTenant(e.target.value)}>
            <option value="">선택</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new">+ 새 입주자 등록</option>
          </SelectField>
          {tenant === "__new" && <Input label="새 입주자 상호(이름)" required value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />}
          <Input label="계약 시작일" type="date" required value={f.from} onChange={setv("from")} />
          <Input label="계약 종료일(비우면 기한 없음)" type="date" value={f.to} onChange={setv("to")} error={f.to && f.from && f.to <= f.from ? "종료일은 시작일보다 뒤여야 합니다." : undefined} />
          <Input label="월 임대료(원)" inputMode="numeric" value={f.rent} onChange={setv("rent")} className="text-right tabular-nums" />
          <Input label="보증금(원)" inputMode="numeric" value={f.deposit} onChange={setv("deposit")} className="text-right tabular-nums" />
          <SelectField label="중도 입주·퇴거 일할" value={f.proration} onChange={setv("proration")}>
            <option value="none">일할 안 함</option><option value="daily">일할 계산</option>
          </SelectField>
          <div className="sm:col-span-2 lg:col-span-4">
            {lateFeeOn && (
              <>
                <label className="mb-3 flex min-h-[44px] items-center gap-2 text-[length:var(--fs-body)] text-t"><input type="checkbox" className="h-[20px] w-[20px]" checked={lateOn} onChange={(e) => setLateOn(e.target.checked)} />연체 조건을 지금 입력(나중에 입력해도 됩니다)</label>
                {lateOn && <><LateTermsFields value={late} onChange={setLate} />{!lateFormComplete(late) && <p className="mb-3 text-[length:var(--fs-meta)] text-t3">일부만 입력하면 &lsquo;입력 미완&rsquo;으로 저장되고 연체료는 계산되지 않습니다.</p>}</>}
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
    <form className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
      e.preventDefault();
      void run(() => updateParty(businessId, party.id, { name: f.name.trim(), biz_type: f.type.trim() || null, biz_item: f.item.trim() || null, ...(canPii ? { biz_reg_no: f.biz || null, ceo_name: f.ceo.trim() || null, address: f.addr.trim() || null, email: f.email.trim() || null } : {}) }), { success: "저장했습니다." });
    }}>
      <Input label="상호" required value={f.name} onChange={set("name")} disabled={!canWrite} maxLength={60} />
      <Input label="사업자등록번호" inputMode="numeric" value={canPii ? f.biz : NO_PII} onChange={set("biz")} disabled={!canWrite || !canPii} maxLength={12} className="tabular-nums" hint={canPii ? "10자리, 하이픈 없이도 됩니다." : "개인정보 열람 권한이 필요합니다."} />
      <Input label="대표자" value={canPii ? f.ceo : NO_PII} onChange={set("ceo")} disabled={!canWrite || !canPii} maxLength={40} />
      <Input label="주소" value={canPii ? f.addr : NO_PII} onChange={set("addr")} disabled={!canWrite || !canPii} maxLength={120} />
      <Input label="업태" value={f.type} onChange={set("type")} disabled={!canWrite} maxLength={40} />
      <Input label="종목" value={f.item} onChange={set("item")} disabled={!canWrite} maxLength={40} />
      {canPii && <Input label="세금계산서 받을 이메일" type="email" value={f.email} onChange={set("email")} disabled={!canWrite} maxLength={80} />}
      <div className="sm:col-span-2 lg:col-span-3">
        {error && <Alert kind="error" className="mb-3">{error}</Alert>}
        {canWrite && <Button type="submit" loading={pending}>저장</Button>}
      </div>
    </form>
  );
}
