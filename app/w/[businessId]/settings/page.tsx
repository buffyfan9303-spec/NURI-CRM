/**
 * 사업장 설정 — 예전에 업무 홈을 차지하던 "내 capability"·"활성 기능 스위치"를
 * 여기로 옮겼다(§5.5: 그 정보는 실제 업무가 아니라 설정이다). staff.manage 없으면
 * ForbiddenState(계약 §5, 서버 강제 실증) — 일반 직원 홈에는 이 화면 자체가 노출되지 않는다.
 */
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { accessMessage, CAP_LABEL } from "@/lib/auth/access";
import { INDUSTRY_DEFS, resolveFeatures, type IndustryFeatures } from "@/lib/industry/config";
import { FeatureToggle } from "@/components/settings/FeatureToggle";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardHead } from "@/components/rental/listkit";
import { RentalMoneySettings } from "@/components/rental/RentalMoneySettings";
import { BuildingFeatureSwitches } from "@/components/building-ops/FeatureSwitches";
import { resolveBuildingFeatures } from "@/lib/domain/building";
import { getFeePolicy, getCancelPolicy } from "@/lib/domain/rental-money";
import { getAccess } from "../access";

const FEATURE_LABEL: Record<keyof IndustryFeatures, string> = {
  attendance: "직원 근태",
  attendanceConfigurable: "근태 설정 가능",
  periodInventory: "기간 재고(예약 점유)",
  stockInventory: "수량 재고",
  unitTracking: "개체 단위 관리",
  deposit: "보증금 회계",
  resourceBooking: "자원 예약 충돌 검사",
  scan: "카메라 스캔",
  studentAttendance: "학생 출결",
};

/** resourceBooking 내부 값 → 화면 문구(C7: 내부 값 노출 금지). */
const BOOKING_LABEL: Record<IndustryFeatures["resourceBooking"], string> = {
  none: "미사용",
  unit: "개체 단위",
  "staff+seat": "직원+좌석",
  "teacher+room": "강사+강의실",
};

export default async function SettingsPage({ params }: { params: { businessId: string } }) {
  const access = await getAccess(params.businessId, "staff.manage");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null; // layout이 이미 리다이렉트했어야 한다.
    const msg = accessMessage(access);
    return (
      <div className="p-4 md:p-6">
        <Card className="px-2 py-2">
          {access.reason === "forbidden" ? (
            <ForbiddenState title={msg.title} description={msg.detail} />
          ) : (
            <ErrorState title={msg.title} description={msg.detail} />
          )}
        </Card>
      </div>
    );
  }

  const def = INDUSTRY_DEFS[access.industry];
  const features = resolveFeatures(access.industry, access.settings);
  // 렌탈만: 연체료 기준·취소 위약금 단계표(0027). 다른 업종은 조회하지 않는다.
  const [feeRes, cancelRes] = access.industry === "rental"
    ? await Promise.all([getFeePolicy(access.businessId), getCancelPolicy(access.businessId)])
    : [null, null];

  const capChips = access.caps.map((c) => (
    <span key={c} className="rounded-[var(--r-sm)] bg-sf2 px-2 py-1 text-[12px] font-medium text-t2 shadow-[inset_0_0_0_1px_var(--bd)]">
      {CAP_LABEL[c] ?? c}
    </span>
  ));

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4 p-4 md:p-6">
      <PageHeader
        className="mb-0 sm:mb-0"
        title="사업장 설정"
        description={`${access.businessName} · ${def.name}. 직원별 개별 권한은 "직원·권한 관리" 화면에서 조정합니다.`}
      />

      <Card className="p-4 sm:p-5">
        <CardHead title="내가 할 수 있는 일" description="지금 로그인한 계정에 부여된 권한입니다. 원시 코드가 아니라 실제로 할 수 있는 동작으로 표시합니다." />
        {access.caps.length === 0 ? (
          <p className="text-[12.5px] text-t3">부여된 권한이 없습니다.</p>
        ) : (
          <>
            {/* 휴대폰은 접어 두고(C7), PC 는 펼쳐 보인다. <details> 는 CSS 로 강제 open 이 안 돼 두 번 그린다. */}
            <details className="sm:hidden">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-[13px] font-medium text-[var(--accent-ink)] [&::-webkit-details-marker]:hidden">
                권한 {access.caps.length}개 보기
              </summary>
              <div className="flex flex-wrap gap-1.5 pt-1">{capChips}</div>
            </details>
            <div className="hidden flex-wrap gap-1.5 sm:flex">{capChips}</div>
          </>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHead title={`${def.name} 활성 기능`} description="업종 기본값에 이 사업장의 설정을 반영한 최종값입니다(공장 근태처럼 업종상 켤 수 없는 항목도 있습니다)." />
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(FEATURE_LABEL) as (keyof IndustryFeatures)[]).map((key) => {
            const value = features[key];
            const on = value !== false && value !== "none";
            {/* 근태는 업종상 설정 가능(attendanceConfigurable)할 때만 여기서 켜고 끌 수 있다.
                출처는 crm.businesses.settings.features 하나뿐(CLICK-PATH-202). */}
            if (key === "attendance" && features.attendanceConfigurable) {
              return (
                <FeatureToggle
                  key={key}
                  businessId={access.businessId}
                  featureKey="attendance"
                  label={FEATURE_LABEL[key]}
                  initialOn={on}
                />
              );
            }
            return (
              <li
                key={key}
                className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--bd)] px-3 py-2 text-[12.5px]"
              >
                <span className="text-t2">{FEATURE_LABEL[key]}</span>
                <Badge kind={on ? "success" : "info"}>
                  {typeof value === "string" ? (BOOKING_LABEL[value] ?? value) : on ? "사용" : "미사용"}
                </Badge>
              </li>
            );
          })}
        </ul>
      </Card>

      {access.industry === "building" && <BuildingFeatureSwitches businessId={access.businessId} status={resolveBuildingFeatures(access.settings)} />}

      {access.industry === "rental" && (
        <RentalMoneySettings
          businessId={access.businessId}
          feePolicy={feeRes && feeRes.ok ? feeRes.data : null}
          cancelPolicy={cancelRes && cancelRes.ok ? cancelRes.data : null}
        />
      )}
    </div>
  );
}
