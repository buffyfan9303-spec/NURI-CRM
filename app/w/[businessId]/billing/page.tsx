/**
 * 건물 관리비 — 관리비 계산·확인(§4.6). revenue.read 게이트. 계산·승인·정정·상태 전이는 BillingBoard(클라이언트)가 액션으로.
 * 전월 대비 열은 전월 승인본 청구(regular)에서 호실별 당월 부과액을 뽑아 비교한다.
 */
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { getLatestRun, getPeriod, listBills, listCorrectionRunDetails, listCorrectionRuns, listParties, listUnits, resolveBuildingFeatures } from "@/lib/domain/building";
import type { BillRow, BillingRunRow, CorrectionRunRow } from "@/lib/domain/building-types";
import type { CorrectionRun } from "@/components/building/BillingBoard";
import { resolveBuildingContext } from "@/components/building/context";
import { addMonths } from "@/components/building/period";
import { BillingBoard } from "@/components/building/BillingBoard";
import { LinkButton } from "@/components/building/StepCard";
import { getAccess } from "../access";

const TITLE = "관리비 계산·확정";

export default async function BillingPage({ params, searchParams }: { params: { businessId: string }; searchParams?: { b?: string; p?: string } }) {
  const access = await getAccess(params.businessId, "revenue.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={`${msg.detail} (매출을 볼 권한이 필요합니다)`} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }
  if (access.industry !== "building") {
    return <PageBody><PageHeader title={TITLE} /><Card><EmptyState title="이 업종에는 관리비 계산 화면이 없습니다." /></Card></PageBody>;
  }
  const base = `/w/${access.businessId}`;
  const ctx = await resolveBuildingContext(access.businessId, access.timezone, searchParams);
  const fail = (message?: string) => (
    <PageBody><PageHeader title={TITLE} /><Card><ErrorState title="불러오지 못했습니다." description={message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>
  );
  if (!ctx.ok) return fail(ctx.message);
  const { building, period, periodRow } = ctx.data;
  if (!building) {
    return <PageBody><PageHeader title={TITLE} /><Card><EmptyState title="아직 건물이 없습니다." description="건물과 호실을 먼저 등록하세요." action={<LinkButton href={`${base}/units`} size="md">호실·입주자로</LinkButton>} /></Card></PageBody>;
  }

  let run: BillingRunRow | null = null;
  let bills: BillRow[] = [];
  const corrections: CorrectionRun[] = [];
  if (periodRow) {
    const r = await getLatestRun(periodRow.id);
    if (!r.ok) return fail(r.message);
    run = r.data;
    if (run) {
      const b = await listBills(run.id);
      if (!b.ok) return fail(b.message);
      bills = b.data;
      // 0033: 정정은 별도 run(초안 → 다른 담당자 승인). 정정 청구는 그 run 에 붙어 있다.
      // 0034: 사유·입력자/승인자 표시이름은 bld_correction_runs RPC 로(소속 아니면 []).
      const [cr, details] = await Promise.all([listCorrectionRuns(periodRow.id), listCorrectionRunDetails(periodRow.id)]);
      if (!cr.ok) return fail(cr.message);
      const detailById = new Map<string, CorrectionRunRow>(details.ok ? details.data.map((d) => [d.id, d]) : []);
      const cb = await Promise.all(cr.data.map((x) => listBills(x.id)));
      cr.data.forEach((x, i) => { const y = cb[i]; corrections.push({ run: x, bills: y.ok ? y.data : [], detail: detailById.get(x.id) ?? null }); });
    }
  }
  // 전월 승인본(있으면)의 호실별 당월 부과액 — 전월 대비 열.
  const prevByUnit: Record<string, number> = {};
  const prevPeriod = await getPeriod(building.id, addMonths(period, -1));
  if (prevPeriod.ok && prevPeriod.data) {
    const pr = await getLatestRun(prevPeriod.data.id);
    if (pr.ok && pr.data?.status === "approved") {
      const pb = await listBills(pr.data.id);
      if (pb.ok) for (const b of pb.data) if (b.bill_kind === "regular" && b.current_charge != null && !(b.unit_id in prevByUnit)) prevByUnit[b.unit_id] = b.current_charge;
    }
  }
  const [units, parties] = await Promise.all([listUnits(building.id, { includeInactive: true }), listParties(access.businessId)]);
  if (!units.ok) return fail(units.message);
  if (!parties.ok) return fail(parties.message);

  return (
    <PageBody wide>
      <BillingBoard
        businessId={access.businessId}
        base={base}
        tz={access.timezone}
        ctx={ctx.data}
        run={run}
        bills={bills}
        corrections={corrections}
        unitNo={Object.fromEntries(units.data.map((u) => [u.id, u.unit_no]))}
        partyName={Object.fromEntries(parties.data.map((p) => [p.id, p.name]))}
        prevByUnit={prevByUnit}
        canWrite={access.caps.includes("write")}
        canApprove={access.caps.includes("billing.approve")}
        userId={access.userId}
        selfApprove={resolveBuildingFeatures(access.settings).self_approve === "on"}
      />
    </PageBody>
  );
}
