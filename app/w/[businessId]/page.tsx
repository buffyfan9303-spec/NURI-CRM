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
import { getSalonDashboard } from "@/lib/domain/salon-dashboard";
import { getAcademyDashboard } from "@/lib/domain/academy-dashboard";
import { getUnmannedDashboard } from "@/lib/domain/unmanned-dashboard";
import { todayKeyInTz, addDaysToKey } from "@/lib/utils/datetime";
import { RentalHome } from "@/components/home/RentalHome";
import { FactoryHome } from "@/components/home/FactoryHome";
import { UnmannedHome } from "@/components/home/UnmannedHome";
import { SalonHome } from "@/components/home/SalonHome";
import { AcademyHome } from "@/components/home/AcademyHome";
import { getAccess } from "./access";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: { businessId: string };
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
      const [todayResult, processBoardResult, inProgressRes, dashboard] = await Promise.all([
        getFactoryToday(access.businessId, tz),
        listProcessBoard(access.businessId),
        listFactoryOrders(access.businessId, { status: ["진행중"] }),
        getFactoryDashboard(access.businessId, tz),
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
    default:
      return null;
  }
}
