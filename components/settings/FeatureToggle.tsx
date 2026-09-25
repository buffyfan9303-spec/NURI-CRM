"use client";

/**
 * 사업장 기능 스위치(CLICK-PATH-202). staff.manage만 렌더 경로에 도달하고,
 * 서버 RPC crm.set_business_feature가 다시 권한·화이트리스트를 검사한다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { setBusinessFeatureAction, type ConfigurableFeature } from "@/lib/domain/settings-actions";

export function FeatureToggle({
  businessId,
  featureKey,
  label,
  initialOn,
}: {
  businessId: string;
  featureKey: ConfigurableFeature;
  label: string;
  initialOn: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(initialOn);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    const next = !on;
    const r = await setBusinessFeatureAction(businessId, featureKey, next);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return;
    }
    setOn(next);
    setBusy(false);
    router.refresh();
  };

  return (
    <li className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--bd)] px-3 py-2 text-[12.5px]">
      <span className="text-t2">{label}</span>
      <div className="flex items-center gap-2">
        {error && <span className="text-[11px] text-et">{error}</span>}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={busy}
          onClick={toggle}
          className="inline-flex min-h-[28px] min-w-[44px] items-center justify-center rounded-full disabled:opacity-60 [@media(pointer:coarse)]:min-h-[44px]"
        >
          <Badge kind={on ? "success" : "info"}>{busy ? "저장 중…" : on ? "사용" : "미사용"}</Badge>
        </button>
      </div>
    </li>
  );
}
