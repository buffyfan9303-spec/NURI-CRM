"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowLeft, TriangleAlert, Play } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { advanceFactoryProcess, advanceFactoryProcessNext, rewindFactoryProcess, reopenFactoryOrder, planFactoryProcess } from "@/lib/domain/factory-actions";
import { FACTORY_PROCESS_STAGES, type ProcessBoardRow, type FactoryOrderRow, type FactoryProcessStage } from "@/lib/domain/factory-types";
import type { MemberOption } from "@/lib/domain/calendar-shared";

interface BoardCard {
  orderId: string;
  orderNo: string;
  customerName: string | null;
  dueDate: string | null;
  stage: FactoryProcessStage;
  status: "todo" | "doing" | "done" | "hold" | "skip";
  plannedMinutes: number | null;
  actualMinutes: number | null;
  assignee: string | null;
  startedAt: string | null;
  delayed: boolean;
  /** 주문이 '완료'(출고 done) — 완료 열에 표시되고 "완료 취소(재개)"만 가능하다. */
  completed: boolean;
}

function buildCards(rows: ProcessBoardRow[], unstarted: FactoryOrderRow[]): BoardCard[] {
  const byOrder = new Map<string, ProcessBoardRow[]>();
  for (const r of rows) {
    const list = byOrder.get(r.orderId) ?? [];
    list.push(r);
    byOrder.set(r.orderId, list);
  }

  const now = Date.now();
  const cards: BoardCard[] = [];

  for (const [orderId, procs] of byOrder) {
    const byStage = new Map(procs.map((p) => [p.stage, p]));
    let current = procs[0];
    for (const stage of FACTORY_PROCESS_STAGES) {
      const p = byStage.get(stage);
      if (!p || p.status !== "done") {
        current = p ?? { ...procs[0], stage, status: "todo", plannedMinutes: null, actualMinutes: null, assignee: null, startedAt: null, finishedAt: null, id: `virtual-${orderId}-${stage}` };
        break;
      }
      current = p; // 전부 완료면 마지막(출고) 유지
    }
    const delayed =
      current.status === "doing" && !!current.startedAt && current.plannedMinutes != null &&
      (now - new Date(current.startedAt).getTime()) / 60000 > current.plannedMinutes;
    cards.push({
      completed: current.orderStatus === "완료",
      orderId,
      orderNo: current.orderNo,
      customerName: current.customerName,
      dueDate: current.dueDate,
      stage: current.stage,
      status: current.status,
      plannedMinutes: current.plannedMinutes,
      actualMinutes: current.actualMinutes,
      assignee: current.assignee,
      startedAt: current.startedAt,
      delayed,
    });
  }

  for (const o of unstarted) {
    cards.push({
      orderId: o.id, orderNo: o.orderNo, customerName: o.customerName, dueDate: o.dueDate,
      stage: "작지", status: "todo", plannedMinutes: null, actualMinutes: null, assignee: null, startedAt: null, delayed: false, completed: false,
    });
  }

  return cards;
}

export function ProductionBoard({
  businessId,
  rows,
  unstarted,
  members,
  canWrite,
}: {
  businessId: string;
  rows: ProcessBoardRow[];
  unstarted: FactoryOrderRow[];
  members: MemberOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const cards = React.useMemo(() => buildCards(rows, unstarted), [rows, unstarted]);
  const byStage = React.useMemo(() => {
    const m = new Map<FactoryProcessStage, BoardCard[]>();
    for (const s of FACTORY_PROCESS_STAGES) m.set(s, []);
    for (const c of cards) if (!c.completed) m.get(c.stage)?.push(c);
    return m;
  }, [cards]);
  const completedCards = React.useMemo(() => cards.filter((c) => c.completed), [cards]);

  const assigneeCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) {
      if (c.completed || c.status !== "doing" || !c.assignee) continue;
      m.set(c.assignee, (m.get(c.assignee) ?? 0) + 1);
    }
    return m;
  }, [cards]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusyKey(key);
    setError(null);
    const r = await fn();
    setBusyKey(null);
    if (!r.ok) { setError(r.message ?? "처리 중 오류가 발생했습니다."); return; }
    router.refresh();
  };

  const start = (card: BoardCard) =>
    run(`start-${card.orderId}`, () => advanceFactoryProcess(businessId, card.orderId, "작지", "doing"));

  // "다음"/"이전"은 한 트랜잭션 RPC(0021). 출고 완료 = 주문 '완료' 확정이라 확인을 받는다(OrderDetail 의 주문 취소와 같은 confirm 패턴).
  const advance = (card: BoardCard) => {
    if (card.stage === "출고" && !confirm(`${card.orderNo} 출고를 완료하면 주문이 '완료'로 확정됩니다. 계속할까요?`)) return;
    run(`adv-${card.orderId}`, () => advanceFactoryProcessNext(businessId, card.orderId, card.stage, card.actualMinutes ?? undefined));
  };

  const rewind = (card: BoardCard) =>
    run(`back-${card.orderId}`, () => rewindFactoryProcess(businessId, card.orderId, card.stage));

  const reopen = (card: BoardCard) => {
    if (!confirm(`${card.orderNo} 완료를 취소하고 출고 진행중으로 되돌릴까요? (출고일이 해제됩니다)`)) return;
    run(`reopen-${card.orderId}`, () => reopenFactoryOrder(businessId, card.orderId));
  };

  const setAssignee = (card: BoardCard, userId: string) =>
    run(`assign-${card.orderId}`, () => planFactoryProcess(businessId, card.orderId, card.stage, { assignee: userId || null }));

  const setPlanned = (card: BoardCard, minutes: number) =>
    run(`plan-${card.orderId}`, () => planFactoryProcess(businessId, card.orderId, card.stage, { plannedMinutes: minutes }));

  if (cards.length === 0) {
    return <EmptyState title="진행 중인 공정이 없습니다." description="접수·진행중 상태의 주문이 생기면 여기 표시됩니다." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="rounded-[var(--r-md)] bg-eb px-3 py-2 text-[12.5px] text-et">{error}</div>}

      {assigneeCounts.size > 0 && (
        <Card className="flex flex-wrap gap-3 p-3 text-[12px] text-t2">
          <span className="font-semibold text-t3">담당자별 진행 중:</span>
          {Array.from(assigneeCounts.entries()).map(([uid, n]) => (
            <span key={uid}>{uid.slice(0, 8)}… {n}건</span>
          ))}
        </Card>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {FACTORY_PROCESS_STAGES.map((stage) => (
          <div key={stage} className="w-[240px] flex-shrink-0">
            <div className="mb-2 flex items-center justify-between rounded-t-[var(--r-md)] border border-b-0 border-[var(--bd)] bg-sf2 px-3 py-2">
              <span className="text-[12.5px] font-semibold text-t">{stage}</span>
              <span className="rounded-[10px] bg-sf3 px-2 py-0.5 text-[10.5px] font-bold text-t2">{byStage.get(stage)?.length ?? 0}</span>
            </div>
            <div className="flex min-h-[80px] flex-col gap-2 rounded-b-[var(--r-md)] border border-t-0 border-[var(--bd)] bg-sf p-2">
              {(byStage.get(stage) ?? []).map((card) => (
                <div
                  key={card.orderId}
                  className={cn(
                    "rounded-[var(--r-md)] border p-2.5 text-[12px]",
                    card.delayed ? "border-et bg-eb" : "border-[var(--bd)]"
                  )}
                >
                  <Link href={`/w/${businessId}/orders/${card.orderId}`} className="font-semibold text-t hover:underline">
                    {card.orderNo}
                  </Link>
                  <div className="text-t3">{card.customerName ?? "-"}</div>
                  {card.dueDate && <div className="text-t3">납기 {card.dueDate}</div>}
                  {card.delayed && (
                    <div className="mt-1 flex items-center gap-1 font-bold text-et">
                      <TriangleAlert size={12} /> 예정시간 초과
                    </div>
                  )}
                  {canWrite && (
                    <>
                      {card.status === "todo" && card.stage === "작지" ? (
                        <Button size="sm" variant="secondary" className="mt-2 w-full" loading={busyKey === `start-${card.orderId}`} onClick={() => start(card)}>
                          <Play size={12} />작지 시작
                        </Button>
                      ) : (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="flex-1 px-1" disabled={card.stage === "작지"} loading={busyKey === `back-${card.orderId}`} onClick={() => rewind(card)}>
                              <ArrowLeft size={12} />이전
                            </Button>
                            <Button size="sm" variant="secondary" className="flex-1 px-1" loading={busyKey === `adv-${card.orderId}`} onClick={() => advance(card)}>
                              다음<ArrowRight size={12} />
                            </Button>
                          </div>
                          <select
                            className="h-8 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-1.5 text-[11px] text-t"
                            value={card.assignee ?? ""}
                            onChange={(e) => setAssignee(card, e.target.value)}
                          >
                            <option value="">담당자 미배정</option>
                            {members.map((m) => (
                              <option key={m.userId} value={m.userId}>{m.role} · {m.userId.slice(0, 8)}{m.isSelf ? " (나)" : ""}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            placeholder="예정(분)"
                            className="h-8 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-1.5 text-[11px] text-t"
                            defaultValue={card.plannedMinutes ?? ""}
                            onBlur={(e) => { const v = Number(e.target.value); if (v > 0) setPlanned(card, v); }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="w-[240px] flex-shrink-0">
          <div className="mb-2 flex items-center justify-between rounded-t-[var(--r-md)] border border-b-0 border-[var(--bd)] bg-sf2 px-3 py-2">
            <span className="text-[12.5px] font-semibold text-t">완료 <span className="font-normal text-t3">(최근 14일)</span></span>
            <span className="rounded-[10px] bg-sf3 px-2 py-0.5 text-[10.5px] font-bold text-t2">{completedCards.length}</span>
          </div>
          <div className="flex min-h-[80px] flex-col gap-2 rounded-b-[var(--r-md)] border border-t-0 border-[var(--bd)] bg-sf p-2">
            {completedCards.map((card) => (
              <div key={card.orderId} className="rounded-[var(--r-md)] border border-[var(--bd)] p-2.5 text-[12px] opacity-80">
                <Link href={`/w/${businessId}/orders/${card.orderId}`} className="font-semibold text-t hover:underline">
                  {card.orderNo}
                </Link>
                <div className="text-t3">{card.customerName ?? "-"}</div>
                {canWrite && (
                  <Button size="sm" variant="ghost" className="mt-2 w-full" loading={busyKey === `reopen-${card.orderId}`} onClick={() => reopen(card)}>
                    <ArrowLeft size={12} />완료 취소(재개)
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
