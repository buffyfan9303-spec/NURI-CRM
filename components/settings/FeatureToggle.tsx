"use client";

/**
 * 사업장 기능 스위치(CLICK-PATH-202). staff.manage만 렌더 경로에 도달하고,
 * 서버 RPC crm.set_business_feature가 다시 권한·화이트리스트를 검사한다.
 *
 * 모양은 진짜 스위치(트랙 40×24 + 손잡이 20px, Linear·Cal.com 설정의 토글). 저장 중엔 손잡이 자리에 스피너,
 * 실패는 줄 아래 붉은 문구. 상태 글자("사용/미사용")를 함께 두어 색만으로 전하지 않는다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
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
  const id = React.useId();
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
    <li className="flex flex-col gap-1 rounded-[var(--r-md)] border border-[var(--bd)] px-3 py-2 text-[12.5px]">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 cursor-pointer text-t2">
          {label}
          <span className="ml-1.5 text-[length:var(--fs-meta)] text-t3" aria-hidden>{busy ? "저장 중…" : on ? "사용" : "미사용"}</span>
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-busy={busy}
          disabled={busy}
          onClick={toggle}
          className={cn(
            // 터치 영역은 44px 로 넓히되(패딩), 보이는 트랙은 40×24.
            "group inline-flex shrink-0 items-center rounded-full p-[10px] -m-[10px] disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          )}
        >
          <span
            className={cn(
              "relative inline-flex h-[24px] w-[40px] items-center rounded-full border transition-colors duration-2 ease-out",
              on ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]" : "border-[var(--bd-strong)] bg-sf3"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "absolute left-[1px] top-[1px] flex h-[20px] w-[20px] items-center justify-center rounded-full bg-sf shadow-card transition-transform duration-2 ease-out motion-reduce:transition-none",
                on && "translate-x-[16px]"
              )}
            >
              {busy && <Loader2 size={12} className="animate-spin text-t3" />}
            </span>
          </span>
        </button>
      </div>
      {error && <p role="alert" className="text-[length:var(--fs-meta)] text-et">{error}</p>}
    </li>
  );
}
