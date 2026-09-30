/**
 * 건물 관리비 — 명세서 발송(§4.7). revenue.read 게이트. 승인된 run 의 청구만 보낼 수 있다(서버 RPC 도 거부).
 * 발송 이력(bld_deliveries)은 읽기 함수가 없어 여기서 직접 조회한다(RLS is_member) — lib/domain/building.ts 에 listDeliveries 가 생기면 교체.
 */
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage } from "@/lib/auth/access";
import { getServerSupabase } from "@/lib/supabase/server";
import { getLatestRun, listBills, listParties, listUnits, resolveBuildingFeatures } from "@/lib/domain/building";
import type { BillRow, BillingRunRow } from "@/lib/domain/building-types";
import { resolveBuildingContext } from "@/components/building/context";
import { StatementsBoard, type DeliveryRow } from "@/components/building/StatementsBoard";
import { LinkButton } from "@/components/building/StepCard";
import { getAccess } from "../access";

const TITLE = "명세서 발송";

export default async function StatementsPage({ params, searchParams }: { params: { businessId: string }; searchParams?: { b?: string; p?: string } }) {
  const access = await getAccess(params.businessId, "revenue.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return <PageBody><Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={`${msg.detail} (매출을 볼 권한이 필요합니다)`} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card></PageBody>;
  }
  if (access.industry !== "building") {
    return <PageBody><PageHeader title={TITLE} /><Card><EmptyState title="이 업종에는 명세서 화면이 없습니다." /></Card></PageBody>;
  }
  const base = `/w/${access.businessId}`;
  const ctx = await resolveBuildingContext(access.businessId, access.timezone, searchParams);
  const fail = (message?: string) => (
    <PageBody><PageHeader title={TITLE} /><Card><ErrorState title="불러오지 못했습니다." description={message} /><div className="flex justify-center pb-6"><RetryButton /></div></Card></PageBody>
  );
  if (!ctx.ok) return fail(ctx.message);
  const { building, periodRow } = ctx.data;
  if (!building) {
    return <PageBody><PageHeader title={TITLE} /><Card><EmptyState title="아직 건물이 없습니다." description="건물과 호실을 먼저 등록하세요." action={<LinkButton href={`${base}/units`} size="md">호실·입주자로</LinkButton>} /></Card></PageBody>;
  }
  let run: BillingRunRow | null = null;
  let bills: BillRow[] = [];
  let deliveries: DeliveryRow[] = [];
  if (periodRow) {
    const r = await getLatestRun(periodRow.id);
    if (!r.ok) return fail(r.message);
    run = r.data;
    if (run) {
      const b = await listBills(run.id);
      if (!b.ok) return fail(b.message);
      bills = b.data;
      if (bills.length) {
        const { data, error } = await getServerSupabase().schema("crm").from("bld_deliveries").select("bill_id,channel,status,note,created_at").in("bill_id", bills.map((x) => x.id)).order("created_at", { ascending: false });
        if (error) return fail("발송 기록을 불러오지 못했습니다.");
        deliveries = (data ?? []) as DeliveryRow[];
      }
    }
  }
  const [units, parties] = await Promise.all([listUnits(building.id, { includeInactive: true }), listParties(access.businessId)]);
  if (!units.ok) return fail(units.message);
  if (!parties.ok) return fail(parties.message);
  const f = resolveBuildingFeatures(access.settings);

  return (
    <PageBody wide>
      <StatementsBoard
        businessId={access.businessId}
        base={base}
        tz={access.timezone}
        ctx={ctx.data}
        run={run}
        bills={bills}
        deliveries={deliveries}
        unitNo={Object.fromEntries(units.data.map((u) => [u.id, u.unit_no]))}
        parties={Object.fromEntries(parties.data.map((p) => [p.id, { name: p.name, phone: p.phone, email: p.email }]))}
        canWrite={access.caps.includes("write")}
        canReadPii={access.caps.includes("pii.read")}
        emailOn={f.email_statement === "on"}
        alimtalkOn={f.alimtalk === "on"}
        bank={building.bank_name && building.bank_account ? `${building.bank_name} ${building.bank_account}${building.bank_holder ? ` ${building.bank_holder}` : ""}` : null}
        dueDate={periodRow?.due_date ?? null}
      />
    </PageBody>
  );
}
