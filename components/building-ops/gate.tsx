/**
 * 건물 관리비 화면 공통 관문(서버). 각 page.tsx 가 맨 처음 부른다.
 * 접근 확인(권한 cap) → 업종 확인 → 건물 목록 → 건물·청구월 결정(?b= ?p=) 순서로 진행하고,
 * 막히면 화면 대신 보여줄 노드(node)를, 통과하면 ctx 를 돌려준다. 권한·금액 판정은 서버(RLS·RPC)가 다시 한다.
 */
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryButton } from "@/components/rental/listkit";
import { accessMessage, type AccessOk, type Cap } from "@/lib/auth/access";
import { getAccess } from "@/app/w/[businessId]/access";
import { getPeriod, listBuildings, resolveBuildingFeatures } from "@/lib/domain/building";
import type { BuildingFeatureKey, BuildingFeatureStatus, BuildingRow, PeriodStatus } from "@/lib/domain/building-types";
import { BuildingPeriodBar } from "@/components/building/BuildingPeriodBar";
import { currentPeriod, isPeriod } from "@/components/building/period";
import { CreateBuildingCard } from "./client-common";

export interface BuildingCtx {
  access: AccessOk;
  businessId: string;
  buildings: BuildingRow[];
  building: BuildingRow;
  period: string;
  /** 선택한 청구월의 상태. 청구월 행이 없거나 읽지 못하면 null(띠에는 "자료 수집 전"). */
  periodStatus: PeriodStatus | null;
  features: Record<BuildingFeatureKey, BuildingFeatureStatus>;
  can: (cap: Cap) => boolean;
}
export type SearchParams = { b?: string; p?: string; [k: string]: string | string[] | undefined };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function Blocked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageBody>
      <PageHeader title={title} />
      <Card>{children}</Card>
    </PageBody>
  );
}

export async function buildingGate(
  businessId: string,
  cap: Cap,
  sp: SearchParams,
  title: string,
  opts: { needBuilding?: boolean } = {}
): Promise<{ node: ReactNode; ctx?: undefined } | { ctx: BuildingCtx; node?: undefined }> {
  const access = await getAccess(businessId, cap);
  if (!access.ok) {
    if (access.reason === "unauthenticated") return { node: null };
    const msg = accessMessage(access);
    return {
      node: (
        <Blocked title={title}>
          {access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}
        </Blocked>
      ),
    };
  }
  if (access.industry !== "building") {
    return { node: <Blocked title={title}><EmptyState title="이 화면은 건물관리 업종 전용입니다." description="다른 업종은 각 업종 메뉴를 이용하세요." /></Blocked> };
  }
  const bl = await listBuildings(businessId);
  if (!bl.ok) {
    return { node: <Blocked title={title}><ErrorState title="건물 목록을 불러오지 못했습니다." description={bl.message} /><div className="flex justify-center pb-6"><RetryButton /></div></Blocked> };
  }
  const buildings = bl.data.filter((b) => b.active);
  if (buildings.length === 0) {
    const canCreate = access.caps.includes("billing.configure") || access.caps.includes("write");
    return {
      node: (
        <PageBody>
          <PageHeader title={title} />
          <CreateBuildingCard businessId={businessId} canCreate={canCreate} />
        </PageBody>
      ),
    };
  }
  const bParam = one(sp.b);
  const building = buildings.find((b) => b.id === bParam) ?? buildings[0];
  const pParam = one(sp.p);
  const period = pParam && isPeriod(pParam) ? pParam : currentPeriod(access.timezone);
  void opts;
  const pr = await getPeriod(building.id, period);
  return {
    ctx: {
      access, businessId, buildings, building, period, periodStatus: pr.ok ? pr.data?.status ?? null : null,
      features: resolveBuildingFeatures(access.settings),
      can: (c: Cap) => access.caps.includes(c),
    },
  };
}

/** 페이지 머리 = 제목 + 건물·월 띠. */
export function BuildingHeader({ ctx, title, description, actions, showPeriod = true }: { ctx: BuildingCtx; title: string; description?: string; actions?: ReactNode; showPeriod?: boolean }) {
  return (
    <PageHeader title={title} description={description} actions={actions}>
      <BuildingPeriodBar buildings={ctx.buildings.map((b) => ({ id: b.id, name: b.name }))} buildingId={ctx.building.id} period={ctx.period} tz={ctx.access.timezone} status={ctx.periodStatus} showPeriod={showPeriod} />
    </PageHeader>
  );
}

/** 승인 이후 청구월은 입력을 잠근다(서버도 period_locked 로 거부한다). */
export const isLockedStatus = (s: string | null | undefined) => s === "approved" || s === "finalized" || s === "closed";

/** 읽기 실패 카드(서버가 준 문구 그대로 + 다시 시도). */
export function ReadFail({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <ErrorState title={title} description={message} />
      <div className="flex justify-center pb-6"><RetryButton /></div>
    </Card>
  );
}
