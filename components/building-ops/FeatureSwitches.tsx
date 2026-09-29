"use client";

/**
 * 건물 관리비 선택 기능 스위치 31개. 켜고 끄는 권한(staff.manage)은 서버 액션이 다시 검사한다.
 * 외부 계약이 필요한 5개는 꺼진 상태에서는 켤 수 없다(스위치 비활성 + "외부 계약 필요" 표시). 이미 켜져 있으면 끌 수는 있다.
 */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { CardHead } from "@/components/rental/listkit";
import { setBuildingFeature } from "@/lib/domain/building-actions";
import { BUILDING_FEATURE_NEEDS_CONTRACT, type BuildingFeatureKey, type BuildingFeatureStatus } from "@/lib/domain/building-types";
import { useRunAction } from "./client-common";
import { FEATURE_GROUPS, FEATURE_INFO } from "./feature-labels";

export function BuildingFeatureSwitches({ businessId, status }: { businessId: string; status: Record<BuildingFeatureKey, BuildingFeatureStatus> }) {
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="건물 관리비 선택 기능" description="필요한 기능만 켭니다. 켜면 해당 메뉴와 계산이 열리고, 끄면 메뉴에서 사라집니다. 이미 입력한 자료는 지워지지 않습니다." />
      <div className="flex flex-col gap-5">
        {FEATURE_GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mb-2 text-[length:var(--fs-meta)] font-semibold text-t3">{g.title}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.keys.map((k) => <Row key={k} businessId={businessId} k={k} status={status[k]} />)}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function Row({ businessId, k, status }: { businessId: string; k: BuildingFeatureKey; status: BuildingFeatureStatus }) {
  const id = React.useId();
  const { run, pending, error } = useRunAction();
  const info = FEATURE_INFO[k];
  const on = status === "on" || status === "external_contract_required";
  const needsContract = BUILDING_FEATURE_NEEDS_CONTRACT.includes(k);
  const disabled = pending || (needsContract && !on);
  return (
    <li className="flex flex-col gap-1 rounded-[var(--r-md)] border border-[var(--bd)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 text-[length:var(--fs-body)] text-t2" style={{ wordBreak: "keep-all" }}>
          {info.label}
          <span className="ml-1.5 text-[length:var(--fs-meta)] text-t3" aria-hidden>{pending ? "저장 중" : on ? "사용" : "미사용"}</span>
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-busy={pending}
          disabled={disabled}
          onClick={() => run(() => setBuildingFeature(businessId, k, !on), { success: `${info.label}: ${on ? "껐습니다" : "켰습니다"}.` })}
          className="group -m-[10px] inline-flex shrink-0 items-center rounded-full p-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={cn("relative inline-flex h-[24px] w-[40px] items-center rounded-full border transition-colors duration-2 ease-out", on ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]" : "border-[var(--bd-strong)] bg-sf3")} aria-hidden>
            <span className={cn("absolute left-[1px] top-[1px] flex h-[20px] w-[20px] items-center justify-center rounded-full bg-sf shadow-card transition-transform duration-2 ease-out motion-reduce:transition-none", on && "translate-x-[16px]")}>
              {pending && <Loader2 size={12} className="animate-spin text-t3" />}
            </span>
          </span>
        </button>
      </div>
      {(needsContract || info.approval || info.note) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-meta)] text-t3">
          {needsContract && <Badge kind="warning">외부 계약 필요</Badge>}
          {status === "external_contract_required" && <span>켜져 있지만 계약 전이라 동작하지 않습니다.</span>}
          {info.approval && <Badge kind="info">승인 후 동작</Badge>}
          {info.note && <span style={{ wordBreak: "keep-all" }}>{info.note}</span>}
        </div>
      )}
      {error && <p role="alert" className="text-[length:var(--fs-meta)] text-et">{error}</p>}
    </li>
  );
}
