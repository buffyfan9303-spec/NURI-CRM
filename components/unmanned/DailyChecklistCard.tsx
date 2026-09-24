"use client";

/**
 * 오늘 점검표(0023 U1) — 하루 1회 생성(멱등), 항목 체크·메모, 완료율. 방문 1회 체크리스트 모드.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Pencil, Check } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DailyChecklist, ChecklistItem } from "@/lib/domain/unmanned";
import { generateDailyChecklist, setChecklistItem } from "@/lib/domain/unmanned-actions";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { CardHead, Alert, CONTROL_SM } from "@/components/rental/listkit";

const KIND_LABEL: Record<ChecklistItem["kind"], string> = { fixed: "기본", low_stock: "재고 부족", expiry: "유통기한" };

export function DailyChecklistCard({
  businessId,
  checklist,
  todayKey,
  canWrite,
}: {
  businessId: string;
  checklist: DailyChecklist | null;
  todayKey: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null); // 진행 중인 항목 key 또는 "gen"
  const [error, setError] = React.useState<string | null>(null);
  const [memoFor, setMemoFor] = React.useState<string | null>(null);
  const [memo, setMemo] = React.useState("");

  const generate = async () => {
    setBusy("gen"); setError(null);
    const r = await generateDailyChecklist(businessId, todayKey);
    setBusy(null);
    if (!r.ok) { setError(r.message); return; }
    router.refresh();
  };

  const setItem = async (it: ChecklistItem, done: boolean, nextMemo?: string) => {
    if (!checklist) return;
    setBusy(it.key); setError(null);
    const r = await setChecklistItem(businessId, checklist.id, it.key, done, nextMemo ?? it.memo ?? undefined);
    setBusy(null);
    if (!r.ok) { setError(r.message); return; }
    setMemoFor(null);
    router.refresh();
  };

  const complete = !!checklist && checklist.total > 0 && checklist.done === checklist.total;

  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="오늘 점검표"
        description={
          checklist
            ? `${formatInTz(`${checklist.checkDate}T00:00:00Z`, "UTC", "M월 d일")} · 기본 항목 + 재고 부족 + 유통기한 임박(7일)이 자동 포함 · 마지막 저장 ${formatInTz(checklist.updatedAt, DEFAULT_TZ, "HH:mm")}`
            : "방문할 때 한 번에 확인할 항목입니다. 기본 항목과 재고 부족·유통기한 임박 품목이 자동으로 들어갑니다."
        }
        action={
          checklist ? (
            <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold tabular-nums " + (complete ? "bg-okb text-okt" : "bg-wb text-wt")}>
              {complete && <Check size={12} aria-hidden />}
              {checklist.done}/{checklist.total} · {checklist.rate}%
            </span>
          ) : undefined
        }
      />
      {error && <Alert className="mb-3">{error}</Alert>}
      {!checklist ? (
        <EmptyState
          title="오늘 점검표가 아직 없습니다."
          description={canWrite ? "오늘 점검표 만들기를 누르면 항목이 생성됩니다(하루 1회)." : "쓰기 권한(write)이 있는 사용자가 만들 수 있습니다."}
          action={canWrite && <Button size="sm" loading={busy === "gen"} onClick={generate}><ClipboardCheck size={14} aria-hidden />오늘 점검표 만들기</Button>}
        />
      ) : (
        <>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-sf2" role="progressbar" aria-valuenow={checklist.rate} aria-valuemin={0} aria-valuemax={100} aria-label="점검 완료율">
            <div className="h-full rounded-full bg-[var(--accent-strong)] transition-[width] duration-200" style={{ width: `${checklist.rate}%` }} />
          </div>
          <ul className="flex flex-col divide-y divide-[var(--bd)]">
            {checklist.items.map((it) => (
              <li key={it.key} className="py-1">
                <div className="flex items-center gap-3">
                  <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={it.done}
                      disabled={!canWrite || busy === it.key}
                      onChange={(e) => setItem(it, e.target.checked)}
                      className="h-[20px] w-[20px] shrink-0 accent-[var(--accent-strong)]"
                    />
                    <span className="min-w-0">
                      <span className={"block truncate text-[13px] " + (it.done ? "text-t3 line-through" : "font-medium text-t")}>{it.label}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-t3">
                        <span className="rounded-[5px] bg-sf2 px-1.5 py-px">{KIND_LABEL[it.kind]}</span>
                        {it.memo && memoFor !== it.key && <span className="truncate">메모: {it.memo}</span>}
                      </span>
                    </span>
                  </label>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${it.label} 메모`}
                      onClick={() => { if (memoFor === it.key) { setMemoFor(null); } else { setMemoFor(it.key); setMemo(it.memo ?? ""); } }}
                    >
                      <Pencil size={13} aria-hidden />
                      <span className="hidden sm:inline">메모</span>
                    </Button>
                  )}
                </div>
                {memoFor === it.key && (
                  <form onSubmit={(e) => { e.preventDefault(); setItem(it, it.done, memo); }} className="mb-2 ml-8 flex items-center gap-2">
                    <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(예: 우유 2개 폐기)" aria-label="메모" className={`${CONTROL_SM} min-w-0 flex-1`} />
                    <Button size="sm" type="submit" loading={busy === it.key}>저장</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
