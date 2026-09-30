/**
 * 보고서 ?view=law14 — 상가건물 임대차보호법 시행령 제8조 관리비 14개 항목 내역(서버).
 * 임차인이 관리비 내역을 요청하면 이 화면에서 호실 하나를 골라 인쇄해 준다. 전체 표는 임대인·관리사무소가 한눈에 보는 용도.
 * 항목 매핑·"월 10만 원 미만이면 금액 대신 포함 항목만" 규칙은 명세서 PDF와 같은 lib/pdf/statement-p0.ts 의 law14Table 이다(복제 없음).
 * 확정한 청구만 센다. 금액은 서버가 확정한 청구 줄의 합이고 이 화면에서 새로 계산하지 않는다.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageBody } from "@/components/ui/PageHeader";
import { CardHead, SummaryStrip, PrintButton } from "@/components/rental/listkit";
import { TABLE, THEAD, TH, TD } from "@/components/building/table-kit";
import { BuildingHeader, ReadFail, type BuildingCtx } from "@/components/building-ops/gate";
import { ReportTabs } from "@/components/building-ops/report-views";
import { num, won, unitLabel } from "@/components/building-ops/format";
import { periodLabel } from "@/components/building/period";
import { approvedBills } from "@/components/building/settlement-load";
import { law14Building, law14ByUnit } from "@/components/building/law14";
import { listParties, listUnits } from "@/lib/domain/building";
import { LAW14, LAW14_MIN_TOTAL } from "@/lib/pdf/statement-p0";
import { cn } from "@/lib/utils/cn";

const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const NUMH = `${TH} text-right`;
const BTN = "inline-flex min-h-[44px] items-center rounded-[var(--r-md)] border border-[var(--bd-strong)] bg-sf px-4 text-[length:var(--fs-body)] font-medium text-t shadow-card hover:bg-sf2";
const CONTROL = "min-h-[44px] w-full min-w-[200px] max-w-[320px] rounded-[var(--r-md)] border border-[var(--bd-strong)] bg-sf px-3 text-[length:var(--fs-body)] text-t";
const LAW_NOTE = "상가건물 임대차보호법 시행령 제8조의 관리비 14개 항목";
const HIDDEN_NOTE = `월 관리비가 ${won(LAW14_MIN_TOTAL)} 미만이라 항목별 금액 대신 포함된 항목만 표시합니다.`;

export async function Law14View({ ctx, unitId }: { ctx: BuildingCtx; unitId?: string }) {
  const title = "상가 14항목 내역";
  const desc = "임차인이 관리비 내역을 요청하면 14개 항목별 금액으로 알려 줘야 합니다. 호실별 금액을 항목마다 한 표로 보고 인쇄합니다.";
  const head = (actions?: React.ReactNode) => <><BuildingHeader ctx={ctx} title={title} description={desc} actions={actions} /><ReportTabs ctx={ctx} view="law14" /></>;

  const [bRes, uRes, pRes] = await Promise.all([approvedBills(ctx.building.id, ctx.period), listUnits(ctx.building.id, { includeInactive: true }), listParties(ctx.businessId)]);
  const fail = [bRes, uRes, pRes].find((x) => !x.ok);
  if (fail && !fail.ok) return <PageBody>{head()}<ReadFail title="불러오지 못했습니다." message={fail.message} /></PageBody>;
  if (!bRes.ok || !uRes.ok || !pRes.ok) return null;
  if (!bRes.data) {
    return (
      <PageBody>
        {head()}
        <Card><EmptyState title={`${periodLabel(ctx.period)} 금액이 아직 확정되지 않았습니다.`} description="관리비 계산·확정 화면에서 이번 달 금액을 확정하면 이 표가 채워집니다. 위에서 다른 달을 고를 수도 있습니다." /></Card>
      </PageBody>
    );
  }

  const units = new Map(uRes.data.map((u) => [u.id, unitLabel(u)]));
  const parties = new Map(pRes.data.map((p) => [p.id, p.name]));
  const rows = law14ByUnit(bRes.data, (id) => units.get(id) ?? "(호실)", (id) => (id ? parties.get(id) ?? "—" : "내는 분 없음"));
  const one = unitId ? rows.find((r) => r.unitId === unitId) : undefined;
  const commercial = ctx.building.kind === "commercial";

  const picker = (
    <form method="get" action={`/w/${ctx.businessId}/reports`} className="bld-noprint mb-4 flex flex-wrap items-end gap-2">
      <input type="hidden" name="b" value={ctx.building.id} />
      <input type="hidden" name="p" value={ctx.period} />
      <input type="hidden" name="view" value="law14" />
      <div>
        <label htmlFor="law14-unit" className="mb-1 block text-[length:var(--fs-meta)] font-medium text-t2">호실 하나만 보기(임차인 요청용)</label>
        <select id="law14-unit" name="unit" defaultValue={one?.unitId ?? ""} className={CONTROL}>
          <option value="">전체 호실</option>
          {rows.map((r) => <option key={r.unitId} value={r.unitId}>{r.unitLabel} · {r.party}</option>)}
        </select>
      </div>
      <button type="submit" className={BTN}>보기</button>
      {one && <Link href={`/w/${ctx.businessId}/reports?b=${ctx.building.id}&p=${ctx.period}&view=law14`} className={BTN}>전체 호실로</Link>}
    </form>
  );
  const kindNote = !commercial && (
    <p className="mb-3 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3 py-2 text-[length:var(--fs-meta)] text-t2">
      이 건물은 상가 건물이 아니라서 명세서 PDF에는 14항목 표가 들어가지 않습니다. 이 화면은 참고용으로 같은 방식으로 묶어 보여 줍니다.
    </p>
  );

  /* ── 호실 하나: 임차인에게 주는 한 장(A4 세로) */
  if (one) {
    const t = one.table;
    return (
      <PageBody>
        {head(<PrintButton label="인쇄(A4 세로)" />)}
        {picker}
        {kindNote}
        <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
        <div id="print-area" className="bld-owners">
          <h1 className="mb-1 text-[18px] font-bold text-t print:text-[15pt]">{ctx.building.name} · {periodLabel(ctx.period)} 관리비 내역</h1>
          <p className="mb-3 text-[length:var(--fs-body)] text-t2">호실 {one.unitLabel} · 내는 분 {one.party} · 근거 {LAW_NOTE}</p>
          <Card className="mb-4 p-4">
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={cn(TH, "w-[52px]")}>번호</th><th className={TH}>항목</th><th className={NUMH}>{t.amountsHidden ? "포함 여부" : "금액(원)"}</th></tr></thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.no} className="border-b border-[var(--bd)]">
                    <td className={cn(TD, "tabular-nums text-t2")}>{r.no}</td>
                    <td className={TD}>{r.label}</td>
                    <td className={NUM}>{t.amountsHidden ? (r.included ? "포함" : <span className="text-t3">해당 없음</span>) : r.included ? num(r.amount) : <span className="text-t3">-</span>}</td>
                  </tr>
                ))}
                {t.outside.map((o) => (
                  <tr key={o.kind} className="border-b border-[var(--bd)] text-t2">
                    <td className={TD} /><td className={TD}>{o.label}</td>
                    <td className={NUM}>{t.amountsHidden && o.kind === "other" ? "포함" : num(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
              {!t.amountsHidden && (
                <tfoot><tr className="border-t-2 border-[var(--t)] font-bold text-t"><td className={TD} /><td className={TD}>월 관리비 합계(임대료 제외)</td><td className={NUM}>{num(t.monthlyFee)}</td></tr></tfoot>
              )}
            </table>
            {t.amountsHidden && <p className="mt-2 text-[length:var(--fs-meta)] text-t2">{HIDDEN_NOTE} 금액을 원하면 요청 시 따로 알려 줍니다.</p>}
            <p className="mt-2 text-[length:var(--fs-meta)] text-t3">금액은 부가세를 포함하고 확정한 청구 기준입니다. 임대료는 관리비가 아니라서 합계에 넣지 않았습니다.</p>
          </Card>
        </div>
      </PageBody>
    );
  }

  /* ── 전체 호실: 관리사무소용 표(A4 가로) */
  const bt = law14Building(rows);
  const hasRent = bt.rent !== 0 || rows.some((r) => r.table.outside.some((o) => o.kind === "rent"));
  return (
    <PageBody wide>
      {head(<PrintButton label="인쇄(A4 가로)" />)}
      {picker}
      {kindNote}
      <style>{"@media print { @page { size: A4 landscape; margin: 7mm; } }"}</style>
      <div id="print-area" className="bld-report">
        <h1 className="mb-2 hidden text-[18px] font-bold text-t print:block">{ctx.building.name} · {periodLabel(ctx.period)} 관리비 14항목 내역</h1>
        <SummaryStrip items={[
          { label: "월 관리비 합계(임대료 제외)", value: won(bt.monthlyFee) },
          { label: "호실 수", value: `${rows.length}호실` },
          { label: `${won(LAW14_MIN_TOTAL)} 미만 호실`, value: `${bt.hiddenUnits}호실`, tone: bt.hiddenUnits > 0 ? "default" : "muted", hint: "항목별 금액 대신 포함 여부만 표시" },
        ]} />
        <Card className="mb-4 p-4">
          <CardHead title="호실별 × 14개 항목" description={`${LAW_NOTE}입니다. 단위는 원, 부가세를 포함합니다.`} />
          <div className="bld-dense -mx-4 overflow-x-auto px-4" tabIndex={0} role="region" aria-label="호실별 14항목 내역(옆으로 밀어 보기)">
            <table className={cn(TABLE, "text-[length:13px]")}>
              <thead className={THEAD}>
                <tr>
                  <th className={cn(TH, "sticky left-0 z-[1] bg-sf2")}>호실·내는 분</th>
                  {LAW14.map((x) => <th key={x.no} className={NUMH}>{x.no}. {x.label}</th>)}
                  <th className={cn(NUMH, "border-l border-[var(--bd)]")} title="14항목에 없는 그 밖의 항목">그 밖의 항목</th>
                  <th className={NUMH}>월 관리비 합계</th>
                  {hasRent && <th className={NUMH} title="임대료는 관리비가 아니라 따로 적습니다">임대료(별도)</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const other = r.table.outside.find((o) => o.kind === "other")?.amount ?? 0;
                  const rent = r.table.outside.find((o) => o.kind === "rent")?.amount ?? 0;
                  const hide = r.table.amountsHidden;
                  return (
                    <tr key={r.unitId} className="border-b border-[var(--bd)]">
                      <td className={cn(TD, "sticky left-0 bg-sf")}>
                        <Link href={`/w/${ctx.businessId}/reports?b=${ctx.building.id}&p=${ctx.period}&view=law14&unit=${r.unitId}`} className="block whitespace-nowrap font-semibold text-t underline-offset-2 hover:underline">{r.unitLabel}</Link>
                        <span className="block max-w-[112px] truncate text-t2" title={r.party}>{r.party}</span>
                      </td>
                      {r.table.rows.map((x) => (
                        <td key={x.no} className={NUM}>{hide ? (x.included ? <span className="text-t2">포함</span> : <span className="text-t3">-</span>) : x.included && x.amount ? num(x.amount) : <span className="text-t3">-</span>}</td>
                      ))}
                      <td className={cn(NUM, "border-l border-[var(--bd)]")}>{other ? (hide ? <span className="text-t2">포함</span> : num(other)) : <span className="text-t3">-</span>}</td>
                      <td className={cn(NUM, "font-semibold text-t")}>{hide ? <span className="text-t2 font-normal">금액 생략</span> : num(r.table.monthlyFee)}</td>
                      {hasRent && <td className={NUM}>{rent ? num(rent) : <span className="text-t3">-</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--t)] bg-sf2 font-bold text-t">
                  <td className={cn(TD, "sticky left-0 bg-sf2 whitespace-nowrap")}>건물 합계 {rows.length}호실</td>
                  {bt.amounts.map((a, i) => <td key={i} className={NUM}>{num(a)}</td>)}
                  <td className={cn(NUM, "border-l border-[var(--bd)]")}>{num(bt.other)}</td>
                  <td className={NUM}>{num(bt.monthlyFee)}</td>
                  {hasRent && <td className={NUM}>{num(bt.rent)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[length:var(--fs-meta)] text-t3">
            {bt.hiddenUnits > 0 ? `${HIDDEN_NOTE} (${bt.hiddenUnits}호실) 맨 아래 건물 합계에는 그 호실의 금액도 들어 있습니다. ` : ""}
            &ldquo;-&rdquo;는 그 항목이 청구에 없다는 뜻입니다. 호실 이름을 누르면 그 호실만 인쇄할 수 있습니다.
          </p>
        </Card>
      </div>
    </PageBody>
  );
}
