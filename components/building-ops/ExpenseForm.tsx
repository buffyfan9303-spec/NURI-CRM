"use client";

/** 비용 입력: 항목 선택 → 부가세 빼기 전 금액·부가세 → 저장(createExpense). 칸 폭은 FieldWidths(한 줄에 흐름). 삭제는 delete 권한(deleteExpense, 서버 재검사). */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, SelectField, CardHead, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { createExpense, deleteExpense } from "@/lib/domain/building-actions";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { won } from "./format";

export interface ExpenseTypeOpt { id: string; name: string; taxable: boolean }
export interface ExpenseLine { id: string; typeName: string; supply: number | null; vat: number | null; amount: number | null; vendor: string | null; docNo: string | null }

export function ExpenseForm({
  businessId, buildingId, period, types, rows, locked, canDelete,
}: {
  businessId: string; buildingId: string; period: string; types: ExpenseTypeOpt[]; rows: ExpenseLine[]; locked: boolean; canDelete: boolean;
}) {
  const { run, pending, error } = useRunAction();
  const [typeId, setTypeId] = React.useState("");
  const [supply, setSupply] = React.useState("");
  const [vat, setVat] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [docNo, setDocNo] = React.useState("");
  // 같은 증빙번호가 이번 달에 이미 있으면 한 번 경고한다(나눠 결제한 경우가 있어 막지는 않는다).
  const [dupAsked, setDupAsked] = React.useState(false);
  const dupDoc = docNo.trim() !== "" && rows.some((r) => r.docNo?.trim() === docNo.trim());
  const type = types.find((t) => t.id === typeId);
  const supplyNum = Number(supply.replace(/,/g, ""));
  const validSupply = supply.trim() !== "" && Number.isInteger(supplyNum) && supplyNum > 0;
  // 부가세는 과세 항목일 때만 10% 를 제안한다. 세금계산서 금액이 다르면 고쳐 쓴다(서버는 입력값 그대로 저장).
  const suggestVat = type?.taxable && validSupply ? Math.round(supplyNum * 0.1) : 0;
  const vatNum = vat.trim() === "" ? suggestVat : Number(vat.replace(/,/g, ""));
  const validVat = Number.isInteger(vatNum) && vatNum >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (dupDoc && !dupAsked) { setDupAsked(true); return; }
    const r = await run(() => createExpense(businessId, buildingId, { period, charge_type_id: typeId, supply: supplyNum, vat: vatNum, vendor: vendor.trim() || undefined, doc_no: docNo.trim() || undefined }), { success: "비용을 저장했습니다." });
    if (r.ok) { setSupply(""); setVat(""); setVendor(""); setDocNo(""); setDupAsked(false); }
  }

  return (
    <div className="space-y-4">
      {locked && <Alert kind="warning">이 달 금액은 이미 확정돼 비용을 바꿀 수 없습니다. 고칠 일이 있으면 관리비 계산 화면에서 "금액 고치기"로 다시 확정하세요.</Alert>}
      <Card className="p-4 sm:p-5">
        <CardHead title="비용 입력" description="한전 전기요금·수도요금·청소 용역비처럼 이번 달 건물이 낸 돈을 항목별로 적습니다." />
        {types.length === 0 ? (
          <EmptyState title="비용을 넣을 항목이 없습니다." description="관리비 항목 정하기 화면에서 '매달 실제로 낸 돈'으로 계산하는 항목을 먼저 만드세요." />
        ) : (
          <form onSubmit={submit} className={FORM_ROW}>
            <SelectField label="항목" required value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={locked} wrapperClassName={FW.select}>
              <option value="">선택</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
            <Input label="부가세 빼기 전 금액(원)" inputMode="numeric" required value={supply} onChange={(e) => setSupply(e.target.value)} disabled={locked} wrapperClassName={FW.money} className={MONEY_INPUT} error={supply && !validSupply ? "1원 이상, 소수점 없이 적으세요." : undefined} />
            <Input label="부가세(원)" inputMode="numeric" value={vat} placeholder={String(suggestVat)} onChange={(e) => setVat(e.target.value)} disabled={locked} wrapperClassName={FW.money} className={MONEY_INPUT} hint={type?.taxable ? "비워 두면 10%를 넣습니다." : "부가세 없는 항목은 0원입니다."} error={vat && !validVat ? "0원 이상, 소수점 없이 적으세요." : undefined} />
            <Input label="낸 곳(거래처)" value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={locked} maxLength={60} wrapperClassName={FW.name} />
            <Input label="영수증 번호" hint="세금계산서·영수증에 적힌 번호(선택)" wrapperClassName={FW.doc} value={docNo} onChange={(e) => { setDocNo(e.target.value); setDupAsked(false); }} disabled={locked} maxLength={60} />
            <div className={`${FORM_ACTIONS} flex-col items-stretch sm:items-start`}>
              {error && <Alert kind="error">{error}</Alert>}
              {dupDoc && <Alert kind="warning">같은 영수증 번호({docNo.trim()})로 이번 달에 이미 입력한 비용이 있습니다. 중복 입력이 아니라면 &quot;그래도 저장&quot;을 누르세요.</Alert>}
              <div className="flex items-center gap-2"><Button type="submit" loading={pending} disabled={locked || !typeId || !validSupply || !validVat}>{dupDoc && dupAsked ? "그래도 저장" : "비용 저장"}</Button>{type && validSupply && validVat && <span className="text-[length:var(--fs-body)] text-t2 tabular-nums">합계 {won(supplyNum + vatNum)}</span>}</div>
            </div>
          </form>
        )}
      </Card>
      <Card className="p-4 sm:p-5">
        <CardHead title="이번 달 입력한 비용" action={<Badge kind="info">{rows.length}건</Badge>} />
        {rows.length === 0 ? (
          <EmptyState title="이번 달에 입력한 비용이 없습니다." description="위에서 항목을 고르고 금액을 적으세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr><th className={TH}>항목</th><th className={TH}>낸 곳</th><th className={`${TH} text-right`}>부가세 빼기 전</th><th className={`${TH} text-right`}>부가세</th><th className={`${TH} text-right`}>합계</th><th className={TH}><span className="sr-only">삭제</span></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => <ExpenseRowView key={r.id} r={r} businessId={businessId} canDelete={canDelete && !locked} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ExpenseRowView({ r, businessId, canDelete }: { r: ExpenseLine; businessId: string; canDelete: boolean }) {
  const { run, pending, error } = useRunAction();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <tr className={TR}>
      <td className={`${TD} font-medium`}>{r.typeName}{r.docNo ? <span className="ml-1 text-t3">#{r.docNo}</span> : null}</td>
      <td className={TD}>{r.vendor ?? "-"}</td>
      <td className={`${TD} text-right tabular-nums`}>{won(r.supply)}</td>
      <td className={`${TD} text-right tabular-nums`}>{won(r.vat)}</td>
      <td className={`${TD} text-right font-semibold tabular-nums`}>{won(r.amount)}</td>
      <td className={TD}>
        {canDelete ? (
          confirm ? (
            <span className="inline-flex gap-1">
              <Button type="button" size="sm" variant="danger" loading={pending} onClick={() => void run(() => deleteExpense(businessId, r.id), { success: "삭제했습니다." })}>삭제 확정</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>취소</Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>삭제</Button>
          )
        ) : null}
        {error && <p role="alert" className="mt-1 text-[length:var(--fs-meta)] text-et">{error}</p>}
      </td>
    </tr>
  );
}
