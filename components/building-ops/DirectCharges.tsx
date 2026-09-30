"use client";

/**
 * 호실별 따로 넣는 금액(감면·일회성): 청구월·호실·'직접 입력' 항목·금액(음수=감면)·사유.
 * 저장 = upsertDirectCharge(같은 항목·호실이면 덮어씀), 삭제 = deleteDirectCharge(delete 권한). 확정된 달은 서버(DB 트리거)도 거부한다.
 * 계산은 '직접 입력' 항목만 이 표를 읽는다 — 그래서 항목 목록도 그 방식만 보여 준다.
 */
import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, SelectField, CardHead, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { upsertDirectCharge, deleteDirectCharge } from "@/lib/domain/building-actions";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { won } from "./format";
import { DIRECT_LOCKED_NOTE, directErrorText, parseSignedWon } from "./direct-charge-ui";

export interface DirectLine { id: string; typeId: string; unitId: string; amount: number | null; reason: string | null }

export function DirectCharges({
  businessId, buildingId, period, types, units, rows, locked, canDelete,
}: {
  businessId: string; buildingId: string; period: string; types: { id: string; name: string }[]; units: { id: string; label: string }[]; rows: DirectLine[]; locked: boolean; canDelete: boolean;
}) {
  const { run, pending, error, setError } = useRunAction();
  const [typeId, setTypeId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const unitName = new Map(units.map((u) => [u.id, u.label]));
  const parsed = amount.trim() === "" ? null : parseSignedWon(amount);
  const existing = rows.find((r) => r.typeId === typeId && r.unitId === unitId);
  const canSave = !locked && !!typeId && !!unitId && parsed?.ok === true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !parsed?.ok) return;
    const r = await run(() => upsertDirectCharge(businessId, buildingId, { period, charge_type_id: typeId, unit_id: unitId, amount: parsed.value, reason: reason.trim() || undefined }), { success: existing ? "고쳐 저장했습니다." : "저장했습니다." });
    if (r.ok) { setUnitId(""); setAmount(""); setReason(""); }
    else setError(directErrorText(r.hint, r.message));
  }
  function edit(r: DirectLine) {
    setTypeId(r.typeId); setUnitId(r.unitId); setAmount(r.amount === null ? "" : String(r.amount)); setReason(r.reason ?? ""); setError(null);
  }

  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="호실별 따로 넣는 금액(감면·일회성)" description="호실마다 금액이 다른 항목입니다. 깎아 주는 돈(감면)은 앞에 −를 붙여 적습니다. 이번 달 관리비 계산에 그대로 들어갑니다." action={<Badge kind="info">{rows.length}건</Badge>} />
      {locked && <Alert kind="warning" className="mb-3">{DIRECT_LOCKED_NOTE}</Alert>}
      {types.length === 0 ? (
        <EmptyState
          title="'직접 입력' 항목이 없습니다."
          description="'관리비 항목 정하기'에서 '직접 입력' 항목(예: 감면, 수리비)을 먼저 만드세요."
          action={<Link href={`/w/${businessId}/charges`} className="text-[length:var(--fs-body)] font-medium text-t underline">관리비 항목 정하기로</Link>}
        />
      ) : (
        <>
          <form onSubmit={submit} className={FORM_ROW}>
            <SelectField label="항목" required value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={locked} wrapperClassName={FW.select}>
              <option value="">선택</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
            <SelectField label="호실" required value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={locked} wrapperClassName={FW.select}>
              <option value="">선택</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </SelectField>
            <Input
              label="금액(원)" inputMode="text" required value={amount} onChange={(e) => setAmount(e.target.value)} disabled={locked}
              wrapperClassName={FW.money} className={MONEY_INPUT} placeholder="예: -10,000"
              hint={parsed?.ok ? (parsed.value < 0 ? `깎아 줌 ${won(-parsed.value)}` : `더 받음 ${won(parsed.value)}`) : "감면이면 − 붙여 입력"}
              error={parsed && !parsed.ok ? parsed.message : undefined}
            />
            <Input label="사유" value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} maxLength={120} hint="예: 공사 소음 보상, 1회성 수리비" wrapperClassName={FW.memo} />
            <div className={`${FORM_ACTIONS} flex-col items-stretch sm:items-start`}>
              {error && <Alert kind="error">{error}</Alert>}
              {existing && <Alert kind="warning">이 항목·호실은 이미 {won(existing.amount)}이 들어 있습니다. 저장하면 새 금액으로 바뀝니다.</Alert>}
              <div><Button type="submit" loading={pending} disabled={!canSave}>{existing ? "고쳐 저장" : "금액 저장"}</Button></div>
            </div>
          </form>
          <div className="mt-5">
            {rows.length === 0 ? (
              <EmptyState title="이 달에 따로 넣은 금액이 없습니다." description="위에서 항목·호실·금액을 적고 저장하세요." />
            ) : (
              <div className="relative overflow-x-auto">
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr><th className={TH}>호실</th><th className={TH}>항목</th><th className={`${TH} text-right`}>금액</th><th className={TH}>사유</th><th className={TH}><span className="sr-only">고치기·삭제</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => <Row key={r.id} r={r} unit={unitName.get(r.unitId) ?? "-"} type={typeName.get(r.typeId) ?? "(쓰지 않는 항목)"} businessId={businessId} locked={locked} canDelete={canDelete} onEdit={() => edit(r)} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Row({ r, unit, type, businessId, locked, canDelete, onEdit }: { r: DirectLine; unit: string; type: string; businessId: string; locked: boolean; canDelete: boolean; onEdit: () => void }) {
  const { run, pending, error, setError } = useRunAction();
  const [confirm, setConfirm] = React.useState(false);
  async function del() {
    const res = await run(() => deleteDirectCharge(businessId, r.id), { success: "삭제했습니다." });
    if (!res.ok) setError(directErrorText(res.hint, res.message));
  }
  return (
    <tr className={TR}>
      <td className={`${TD} whitespace-nowrap font-medium`}>{unit}</td>
      <td className={TD}>{type}</td>
      <td className={`${TD} text-right font-semibold tabular-nums`}>{won(r.amount)}</td>
      <td className={TD}>{r.reason ?? "-"}</td>
      <td className={`${TD} whitespace-nowrap`}>
        {!locked && (
          <span className="inline-flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={onEdit}>고치기</Button>
            {canDelete && (confirm ? (
              <>
                <Button type="button" size="sm" variant="danger" loading={pending} onClick={() => void del()}>삭제 확정</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>취소</Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>삭제</Button>
            ))}
          </span>
        )}
        {error && <p role="alert" className="mt-1 text-[length:var(--fs-meta)] text-et">{error}</p>}
      </td>
    </tr>
  );
}
