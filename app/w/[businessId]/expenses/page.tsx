/** 비용 입력(building 전용). 항목은 '비용 배분(expense)' 방식만. 쓰기는 createExpense/deleteExpense(서버 cap 재검사). */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, isLockedStatus, type SearchParams } from "@/components/building-ops/gate";
import { ExpenseForm } from "@/components/building-ops/ExpenseForm";
import { getPeriod, listChargeTypes, listExpenses } from "@/lib/domain/building";

export default async function ExpensesPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "write", searchParams, "비용 입력");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [tRes, eRes, pRes] = await Promise.all([listChargeTypes(ctx.building.id), listExpenses(ctx.building.id, ctx.period), getPeriod(ctx.building.id, ctx.period)]);
  if (!tRes.ok || !eRes.ok || !pRes.ok) {
    const message = !tRes.ok ? tRes.message : !eRes.ok ? eRes.message : !pRes.ok ? pRes.message : "";
    return (
      <PageBody>
        <BuildingHeader ctx={ctx} title="비용 입력" />
        <ReadFail title="비용 자료를 불러오지 못했습니다." message={message} />
      </PageBody>
    );
  }
  const expenseTypes = tRes.data.filter((t) => t.source_kind === "expense");
  const names = new Map(tRes.data.map((t) => [t.id, t.name]));
  return (
    <PageBody wide>
      <BuildingHeader ctx={ctx} title="비용 입력" description="이번 달 건물이 낸 돈(전기·수도·청소 등)을 항목별로 적습니다." />
      <ExpenseForm
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        period={ctx.period}
        types={expenseTypes.map((t) => ({ id: t.id, name: t.name, taxable: t.tax_treatment === "taxable" }))}
        rows={eRes.data.map((e) => ({ id: e.id, typeName: names.get(e.charge_type_id) ?? "(삭제된 항목)", supply: e.supply, vat: e.vat, amount: e.amount, vendor: e.vendor, docNo: e.doc_no }))}
        locked={isLockedStatus(pRes.data?.status)}
        canDelete={ctx.can("delete")}
      />
    </PageBody>
  );
}
