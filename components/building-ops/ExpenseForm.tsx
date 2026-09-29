"use client";

/** 비용 입력: 항목 선택 → 공급가액·부가세 → 저장(createExpense). 삭제는 delete 권한(deleteExpense, 서버 재검사). */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, SelectField, CardHead, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { createExpense, deleteExpense } from "@/lib/domain/building-actions";
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
  const type = types.find((t) => t.id === typeId);
  const supplyNum = Number(supply.replace(/,/g, ""));
  const validSupply = supply.trim() !== "" && Number.isInteger(supplyNum) && supplyNum > 0;
  // 부가세는 과세 항목일 때만 10% 를 제안한다. 세금계산서 금액이 다르면 고쳐 쓴다(서버는 입력값 그대로 저장).
  const suggestVat = type?.taxable && validSupply ? Math.round(supplyNum * 0.1) : 0;
  const vatNum = vat.trim() === "" ? suggestVat : Number(vat.replace(/,/g, ""));
  const validVat = Number.isInteger(vatNum) && vatNum >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => createExpense(businessId, buildingId, { period, charge_type_id: typeId, supply: supplyNum, vat: vatNum, vendor: vendor.trim() || undefined, doc_no: docNo.trim() || undefined }), { success: "비용을 저장했습니다." });
    if (r.ok) { setSupply(""); setVat(""); setVendor(""); setDocNo(""); }
  }

  return (
    <div className="space-y-4">
      {locked && <Alert kind="warning">이 청구월은 승인·확정돼 비용을 바꿀 수 없습니다. 정정은 관리비 계산·확인 화면에서 새 수정본으로 처리합니다.</Alert>}
      <Card className="p-4 sm:p-5">
        <CardHead title="비용 입력" description="한전·수도·청소 용역 등 이번 달 건물이 쓴 비용을 항목별로 입력합니다." />
        {types.length === 0 ? (
          <EmptyState title="비용을 넣을 항목이 없습니다." description="관리비 항목 설정에서 '비용 배분' 방식의 항목을 먼저 만드세요." />
        ) : (
          <form onSubmit={submit} className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField label="항목" required value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={locked}>
              <option value="">선택</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
            <Input label="공급가액(원)" inputMode="numeric" required value={supply} onChange={(e) => setSupply(e.target.value)} disabled={locked} className="text-right tabular-nums" error={supply && !validSupply ? "1원 이상의 정수를 입력하세요." : undefined} />
            <Input label="부가세(원)" inputMode="numeric" value={vat} placeholder={String(suggestVat)} onChange={(e) => setVat(e.target.value)} disabled={locked} className="text-right tabular-nums" hint={type?.taxable ? "비워 두면 10%를 넣습니다." : "면세 항목은 0원입니다."} error={vat && !validVat ? "0원 이상의 정수를 입력하세요." : undefined} />
            <Input label="거래처" value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={locked} maxLength={60} />
            <Input label="증빙 번호(세금계산서·영수증)" value={docNo} onChange={(e) => setDocNo(e.target.value)} disabled={locked} maxLength={60} />
            <div className="flex flex-col justify-end sm:col-span-2 lg:col-span-3">
              {error && <Alert kind="error" className="mb-3">{error}</Alert>}
              <div><Button type="submit" loading={pending} disabled={locked || !typeId || !validSupply || !validVat}>비용 저장</Button></div>
            </div>
          </form>
        )}
      </Card>
      <Card className="p-4 sm:p-5">
        <CardHead title="이번 달 입력한 비용" action={<Badge kind="info">{rows.length}건</Badge>} />
        {rows.length === 0 ? (
          <EmptyState title="이번 달에 입력한 비용이 없습니다." description="위에서 항목을 고르고 금액을 입력하세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr><th className={TH}>항목</th><th className={TH}>거래처</th><th className={`${TH} text-right`}>공급가액</th><th className={`${TH} text-right`}>부가세</th><th className={`${TH} text-right`}>합계</th><th className={TH}><span className="sr-only">삭제</span></th></tr>
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
