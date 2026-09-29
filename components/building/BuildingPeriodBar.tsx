"use client";

/**
 * 모든 건물 화면 머리말 띠(§3-2): `[건물명 ▾] · [2026년 9월분 ▾] · 상태 pill · 저장 상태`.
 * 셀렉트를 바꾸면 URL `?b=&p=` 를 갱신한다(다른 쿼리는 유지). 12개월 이상이라 Segmented 가 아니라 select.
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CONTROL } from "@/components/rental/listkit";
import type { PeriodStatus } from "@/lib/domain/building-types";
import { PeriodStatusPill } from "./StatusPill";
import { periodLabel, periodOptions } from "./period";

export function BuildingPeriodBar({
  buildings,
  buildingId,
  period,
  tz,
  status,
  showPeriod = true,
  children,
}: {
  buildings: { id: string; name: string }[];
  buildingId: string | null;
  period: string;
  tz: string;
  /** 청구월 행 상태. 없으면 "자료 수집 전" 문구. */
  status?: PeriodStatus | null;
  /** false 면 청구월 셀렉트·상태 pill 을 숨기고 건물만(호실·항목·가져오기·민원·미수·수납처럼 월과 무관한 화면). */
  showPeriod?: boolean;
  /** 우측 끝(저장 상태 등). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const bId = React.useId();
  const pId = React.useId();
  const go = (key: "b" | "p", value: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };
  const sel = `${CONTROL} w-auto min-w-[160px] max-w-[280px] pr-8`;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[length:var(--fs-body)] text-t2">
      <label htmlFor={bId} className="sr-only">건물</label>
      {buildings.length > 1 ? (
        <select id={bId} value={buildingId ?? ""} onChange={(e) => go("b", e.target.value)} className={sel} aria-label="건물 선택">
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      ) : (
        <span id={bId} className="font-semibold text-t">{buildings[0]?.name ?? "건물 없음"}</span>
      )}
      {showPeriod && (
        <>
          <span aria-hidden>·</span>
          <label htmlFor={pId} className="sr-only">청구월</label>
          <select id={pId} value={period} onChange={(e) => go("p", e.target.value)} className={sel} aria-label="청구월 선택">
            {periodOptions(period, tz).map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
          {status ? <PeriodStatusPill status={status} /> : <span className="text-t3">자료 수집 전</span>}
        </>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
