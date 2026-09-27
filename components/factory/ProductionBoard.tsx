"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowLeft, TriangleAlert, Play } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterRow, StatusTab } from "@/components/rental/listkit";
import { cn } from "@/lib/utils/cn";
import { advanceFactoryProcess, advanceFactoryProcessNext, rewindFactoryProcess, reopenFactoryOrder, planFactoryProcess } from "@/lib/domain/factory-actions";
import { FACTORY_PROCESS_STAGES, type ProcessBoardRow, type FactoryOrderRow, type FactoryProcessStage } from "@/lib/domain/factory-types";
import type { MemberOption } from "@/lib/domain/calendar-shared";
import { PROCESS_STATUS_LABEL, assigneeLabel, memberLabel } from "./labels";

// F16: 칸반 카드 안 select/input 은 32px 였고 이름도 없었다 — 터치 화면 44px + aria-label.
const cardControlClass =
  "h-[36px] w-full rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-2 text-[12px] text-t outline-none focus:border-[var(--accent)] [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:text-[16px]";

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
  // 휴대폰 탭 — 처음엔 카드가 있는 첫 단계(없으면 작지).
  const [mobileStage, setMobileStage] = React.useState<FactoryProcessStage | "완료">(
    () => FACTORY_PROCESS_STAGES.find((s) => cards.some((c) => !c.completed && c.stage === s)) ?? "작지"
  );
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

  // 칸반 열 하나(머리 + 카드 목록). PC 는 7열+완료 가로 배치, 휴대폰(<sm)은 탭으로 한 단계씩 보인다(F3).
  const orderLink = (card: BoardCard) => (
    // 주문번호·고객명 블록 전체가 상세 링크(터치 44px). PC 는 원래 높이.
    <Link
      href={`/w/${businessId}/orders/${card.orderId}`}
      prefetch={false}
      className="-mx-1 -mt-1 flex flex-col justify-center rounded-[6px] px-1 py-0.5 hover:bg-sf2 max-sm:min-h-[44px] [@media(pointer:coarse)]:min-h-[44px]"
    >
      <span className="font-semibold text-t">{card.orderNo}</span>
      <span className="text-t2">{card.customerName ?? "-"}</span>
    </Link>
  );

  const columnHead = (label: React.ReactNode, count: number) => (
    <div className="mb-2 flex items-center justify-between rounded-t-[var(--r-md)] border border-b-0 border-[var(--bd)] bg-sf2 px-3 py-2 max-sm:hidden">
      <span className="text-[12.5px] font-semibold text-t">{label}</span>
      <span className="rounded-[10px] bg-sf3 px-2 py-0.5 text-[12px] font-bold text-t2">{count}</span>
    </div>
  );

  const stageColumn = (stage: FactoryProcessStage) => (
    <>
      {columnHead(stage, byStage.get(stage)?.length ?? 0)}
      <div className="flex min-h-[80px] flex-col gap-2 rounded-b-[var(--r-md)] border border-t-0 border-[var(--bd)] bg-sf p-2 max-sm:rounded-[var(--r-md)] max-sm:border-t">
        {(byStage.get(stage) ?? []).length === 0 && <p className="px-1 py-3 text-center text-[12.5px] text-t3 sm:hidden">이 단계에 있는 주문이 없습니다.</p>}
        {(byStage.get(stage) ?? []).map((card) => (
          <div
            key={card.orderId}
            className={cn(
              "rounded-[var(--r-md)] border p-2.5 text-[12px]",
              card.delayed ? "border-et bg-eb" : "border-[var(--bd)]"
            )}
          >
            {orderLink(card)}
            {card.dueDate && <div className="text-t2">납기 {card.dueDate}</div>}
            <div className="text-t3">
              {PROCESS_STATUS_LABEL[card.status]}
              {card.assignee && <> · {assigneeLabel(members, card.assignee)}</>}
            </div>
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
                      className={cardControlClass}
                      aria-label={`${card.orderNo} ${card.stage} 담당자`}
                      value={card.assignee ?? ""}
                      disabled={busyKey === `assign-${card.orderId}`}
                      onChange={(e) => setAssignee(card, e.target.value)}
                    >
                      <option value="">담당자 미배정</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>{memberLabel(m)}{m.isSelf ? " (나)" : ""}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="예정(분)"
                      aria-label={`${card.orderNo} ${card.stage} 예정 시간(분)`}
                      className={cardControlClass}
                      defaultValue={card.plannedMinutes ?? ""}
                      onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== card.plannedMinutes) setPlanned(card, v); }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );

  const completedColumn = (
    <>
      {columnHead(<>완료 <span className="font-normal text-t3">(최근 14일)</span></>, completedCards.length)}
      <div className="flex min-h-[80px] flex-col gap-2 rounded-b-[var(--r-md)] border border-t-0 border-[var(--bd)] bg-sf p-2 max-sm:rounded-[var(--r-md)] max-sm:border-t">
        {completedCards.length === 0 && <p className="px-1 py-3 text-center text-[12.5px] text-t3 sm:hidden">최근 14일에 완료된 주문이 없습니다.</p>}
        {completedCards.map((card) => (
          // F16: opacity-80 은 글자 대비를 3.5:1 로 떨어뜨렸다 — 배경 토큰(sf2)으로만 "지난 일"을 구분한다.
          <div key={card.orderId} className="rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 p-2.5 text-[12px]">
            {orderLink(card)}
            {canWrite && (
              <Button size="sm" variant="ghost" className="mt-2 w-full" loading={busyKey === `reopen-${card.orderId}`} onClick={() => reopen(card)}>
                <ArrowLeft size={12} />완료 취소(재개)
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="rounded-[var(--r-md)] bg-eb px-3 py-2 text-[12.5px] text-et">{error}</div>}

      {assigneeCounts.size > 0 && (
        <Card className="flex flex-wrap gap-3 p-3 text-[12px] text-t2">
          <span className="font-semibold text-t2">담당자별 진행 중:</span>
          {Array.from(assigneeCounts.entries()).map(([uid, n]) => (
            <span key={uid}>{assigneeLabel(members, uid)} {n}건</span>
          ))}
        </Card>
      )}

      {/* 휴대폰(<sm): 공정 단계 탭(가로 스크롤) + 선택한 단계 하나. 1994px 가로 스크롤 칸반은 PC·태블릿(sm+)만. */}
      <div className="flex flex-col gap-2 sm:hidden">
        <FilterRow>
          {FACTORY_PROCESS_STAGES.map((stage) => (
            <StatusTab key={stage} active={mobileStage === stage} onClick={() => setMobileStage(stage)} count={byStage.get(stage)?.length ?? 0}>{stage}</StatusTab>
          ))}
          <StatusTab active={mobileStage === "완료"} onClick={() => setMobileStage("완료")} count={completedCards.length}>완료</StatusTab>
        </FilterRow>
        <div>{mobileStage === "완료" ? completedColumn : stageColumn(mobileStage)}</div>
      </div>

      <div className="hidden gap-3 overflow-x-auto pb-2 sm:flex">
        {FACTORY_PROCESS_STAGES.map((stage) => (
          <div key={stage} className="w-[240px] flex-shrink-0">{stageColumn(stage)}</div>
        ))}
        <div className="w-[240px] flex-shrink-0">{completedColumn}</div>
      </div>
    </div>
  );
}
