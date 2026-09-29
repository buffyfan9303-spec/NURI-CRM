/**
 * 업종별 작업공간 홈. §5.5: 업무 홈은 실제 오늘 업무로 채운다 — 설정표·capability
 * 나열·빈 요약 카드 반복은 여기 두지 않는다(그건 settings/page.tsx로 옮겼다).
 *
 * 최대 폭 제한을 두지 않는다(§5.2) — 1920px에서도 셸이 준 가용 폭을 그대로 쓴다.
 */
import { redirect } from "next/navigation";
import { listFactoryOrders, listProcessBoard } from "@/lib/domain/factory";
import { getRentalToday } from "@/lib/domain/rental";
import { getFactoryToday } from "@/lib/domain/factory";
import { getUnmannedToday } from "@/lib/domain/unmanned";
import { getSalonToday, listRevisitDue } from "@/lib/domain/salon";
import { getAcademyToday, getConsultationStats } from "@/lib/domain/academy";
import { getRentalDashboard } from "@/lib/domain/rental-dashboard";
import { getFactoryDashboard } from "@/lib/domain/factory-dashboard";
import { listAssignableMembers } from "@/lib/domain/calendar";
import { getSalonDashboard } from "@/lib/domain/salon-dashboard";
import { getAcademyDashboard } from "@/lib/domain/academy-dashboard";
import { getUnmannedDashboard } from "@/lib/domain/unmanned-dashboard";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import { RentalHome } from "@/components/home/RentalHome";
import { FactoryHome } from "@/components/home/FactoryHome";
import { UnmannedHome } from "@/components/home/UnmannedHome";
import { SalonHome } from "@/components/home/SalonHome";
import { AcademyHome } from "@/components/home/AcademyHome";
import { BuildingHome } from "@/components/building/BuildingHome";
import { resolveBuildingContext } from "@/components/building/context";
import { getTodo, resolveBuildingFeatures } from "@/lib/domain/building";
import { getAccess } from "./access";

export default async function WorkspaceDashboardPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  /** 건물 관리비: ?b=<building_id>&p=YYYY-MM(components/building/context.ts). 다른 업종은 쓰지 않는다. */
  searchParams?: { b?: string; p?: string };
}) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) redirect("/select"); // layout이 이미 걸렀어야 하지만 이중 방어.

  const base = `/w/${access.businessId}`;
  const tz = access.timezone;
  const canManage = access.caps.includes("staff.manage");
  const canWrite = access.caps.includes("write");

  const canReadRevenue = access.caps.includes("revenue.read");

  switch (access.industry) {
    case "rental": {
      const [result, dashboard] = await Promise.all([
        getRentalToday(access.businessId, tz),
        getRentalDashboard(access.businessId, tz, canReadRevenue),
      ]);
      return (
        <RentalHome
          result={result}
          dashboard={dashboard}
          base={base}
          tz={tz}
          businessName={access.businessName}
          canManage={canManage}
          canWrite={canWrite}
        />
      );
    }
    case "factory": {
      // F25: 접수 상태 주문이 대시보드 어디에도 안 보였다 — 접수+진행중을 "진행 수주(접수 포함)"로 센다.
      // F15: 공정 담당자 uuid 를 이름으로 보여 주기 위해 구성원 목록도 함께 읽는다.
      const [todayResult, processBoardResult, inProgressRes, dashboard, membersRes] = await Promise.all([
        getFactoryToday(access.businessId, tz),
        listProcessBoard(access.businessId),
        listFactoryOrders(access.businessId, { status: ["접수", "진행중"] }),
        getFactoryDashboard(access.businessId, tz),
        listAssignableMembers(access.businessId),
      ]);
      return (
        <FactoryHome
          todayResult={todayResult}
          processBoardResult={processBoardResult}
          inProgressOrderCount={inProgressRes.ok ? inProgressRes.data.length : 0}
          dashboard={dashboard}
          todayKey={todayKeyInTz(tz)}
          base={base}
          businessName={access.businessName}
          canManage={canManage}
          canWrite={canWrite}
          canReadRevenue={canReadRevenue}
          members={membersRes.ok ? membersRes.members : []}
        />
      );
    }
    case "unmanned": {
      const [result, dashboard] = await Promise.all([
        getUnmannedToday(access.businessId, tz),
        getUnmannedDashboard(access.businessId, tz, canReadRevenue),
      ]);
      return <UnmannedHome result={result} dashboard={dashboard} base={base} tz={tz} businessName={access.businessName} canManage={canManage} canWrite={canWrite} />;
    }
    case "salon": {
      const [result, dashboard, revisitRes] = await Promise.all([
        getSalonToday(access.businessId, tz, canReadRevenue),
        getSalonDashboard(access.businessId, tz, canReadRevenue),
        listRevisitDue(access.businessId),
      ]);
      return (
        <SalonHome
          result={result}
          dashboard={dashboard}
          base={base}
          tz={tz}
          businessName={access.businessName}
          canManage={canManage}
          canWrite={canWrite}
          revisitDue={revisitRes.ok ? revisitRes.data : []}
        />
      );
    }
    case "academy": {
      const canReadPii = access.caps.includes("pii.read");
      const todayKey = todayKeyInTz(tz);
      const [result, dashboard, consultStatsRes] = await Promise.all([
        getAcademyToday(access.businessId, tz, canReadRevenue),
        getAcademyDashboard(access.businessId, tz, canReadRevenue, canReadPii),
        getConsultationStats(access.businessId, addDaysToKey(todayKey, -90), todayKey),
      ]);
      return (
        <AcademyHome
          result={result}
          dashboard={dashboard}
          base={base}
          tz={tz}
          businessName={access.businessName}
          canManage={canManage}
          canWrite={canWrite}
          consultStats={consultStatsRes.ok ? consultStatsRes.data : null}
        />
      );
    }
    case "building": {
      // 0031 건물 관리비 홈 = 이번 달 할 일(5단계). 건물·청구월은 URL(?b&p) → 첫 건물·이번 달.
      const ctx = await resolveBuildingContext(access.businessId, tz, searchParams);
      if (!ctx.ok) return <BuildingHome base={base} tz={tz} ctx={{ buildings: [], building: null, period: "", periodRow: null, qs: "" }} todo={ctx} />;
      const todo = ctx.data.building ? await getTodo(ctx.data.building.id, ctx.data.period) : null;
      return <BuildingHome base={base} tz={tz} ctx={ctx.data} todo={todo} lateFeeOn={resolveBuildingFeatures(access.settings).late_fee === "on"} />;
    }
    default:
      return null;
  }
}
