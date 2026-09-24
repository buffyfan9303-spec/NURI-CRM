"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Minus, Plus, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { KIND_LABEL, type ScanBatchItem, type ScanKind, type ScanMode, type ScanCommitHandoff } from "@/lib/scan/types";
import { updateScanBatchItemQty, removeScanBatchItem, commitScanBatch } from "@/lib/scan/actions";

/** 확정 후 실제 출고/반납/재고조정을 해야 할 업무 화면 — 스캔은 그 목록만 만들고, 상태를 바꾸는
 * 진짜 동작은 각 업무의 기존 확정 RPC를 쓰는 화면에서 한다(0014_scan.sql §5, 프롬프트 §8). */
const HANDOFF_PATH: Partial<Record<ScanKind, { path: string; label: string }>> = {
  rental_unit: { path: "reservations", label: "예약 화면에서 출고/반납 처리" },
  us_product: { path: "stock", label: "재고 화면에서 조정/실사 확정" },
  material: { path: "materials", label: "자재 재고 화면에서 처리" },
  factory_order: { path: "production", label: "공정 화면에서 확인" },
};

export function BatchReviewList({
  businessId,
  session,
  mode,
  items,
  canWrite,
  onChanged,
  commitLabel = "확정",
}: {
  businessId: string;
  session: string;
  /** CP-230: 서버가 이 모드로 확정을 분기한다(unmanned_audit=실사 기록, rental_*=예약 handoff). */
  mode: ScanMode;
  items: ScanBatchItem[];
  canWrite: boolean;
  onChanged: () => void;
  /** 모드별 확정 동작 이름("출고 확정"/"반납 접수" 등) — 일반 스캔과 업무 확정을 시각적으로 구분한다(§5.8). */
  commitLabel?: string;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState<ScanBatchItem[] | null>(null);
  const [handoff, setHandoff] = React.useState<ScanCommitHandoff | undefined>(undefined);

  const changeQty = async (item: ScanBatchItem, delta: number) => {
    const next = item.qty + delta;
    setError(null);
    if (next < 1) return removeItem(item.id);
    setBusyId(item.id);
    const r = await updateScanBatchItemQty(businessId, item.id, next);
    setBusyId(null);
    if (!r.ok) return setError(r.message);
    onChanged();
  };

  const removeItem = async (itemId: string) => {
    setError(null);
    setBusyId(itemId);
    const r = await removeScanBatchItem(businessId, itemId);
    setBusyId(null);
    if (!r.ok) return setError(r.message);
    onChanged();
  };

  const confirmCommit = async () => {
    setCommitting(true);
    setError(null);
    const r = await commitScanBatch(businessId, session, mode);
    setCommitting(false);
    setConfirmOpen(false);
    if (!r.ok) return setError(r.message);
    setReceipt(r.data);
    setHandoff(r.data.handoff);
    onChanged();
  };

  const kindsPresent = Array.from(new Set(items.map((i) => i.kind)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold text-t">담은 목록 ({items.length})</h2>
      </div>

      {items.length > 0 && (
        <p className="text-[11.5px] text-t3">
          {kindsPresent.length > 0 ? `${items.length}건 담김 · ${commitLabel} 전에 아래 목록에서 미일치·누락을 확인하세요.` : ""}
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-[var(--r-md)] border border-[var(--bd)] bg-eb px-3 py-2 text-[12px] text-et">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState title="담은 항목이 없습니다." description="스캔하거나 코드를 입력하면 여기 쌓입니다." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-t">{item.label ?? item.targetId}</p>
                <p className="text-[11px] text-t3">{KIND_LABEL[item.kind]}</p>
              </div>
              {canWrite && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="수량 감소"
                    disabled={busyId === item.id}
                    onClick={() => changeQty(item, -1)}
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] text-t2 hover:bg-sf disabled:opacity-50"
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <span className="w-7 text-center text-[13px] font-semibold text-t">{item.qty}</span>
                  <button
                    type="button"
                    aria-label="수량 증가"
                    disabled={busyId === item.id}
                    onClick={() => changeQty(item, 1)}
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] text-t2 hover:bg-sf disabled:opacity-50"
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="제거"
                    disabled={busyId === item.id}
                    onClick={() => removeItem(item.id)}
                    className="ml-1 flex h-[44px] w-[44px] items-center justify-center rounded-[var(--r-sm)] text-et hover:bg-eb disabled:opacity-50"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && items.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--bd)] pt-3">
          <span className="text-[11.5px] text-t3">미일치·누락이 없는지 확인한 뒤 눌러 주세요. 재고·금액은 여기서 바뀌지 않습니다.</span>
          <Button onClick={() => setConfirmOpen(true)} className="shrink-0">
            <Check size={14} aria-hidden />
            {commitLabel}
          </Button>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`${commitLabel}할까요?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={confirmCommit} loading={committing}>
              {commitLabel}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-t2">
          확정하면 이 검토 목록이 비워집니다. <strong className="text-t">재고·금액은 여기서 바뀌지 않습니다</strong> — 실제 출고·반납·재고조정은
          아래 안내된 화면에서 기존 확정 절차로 처리하세요.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {kindsPresent.map((k) => {
            const h = HANDOFF_PATH[k];
            if (!h) return null;
            return (
              <li key={k} className="text-[12.5px]">
                <Link href={`/w/${businessId}/${h.path}`} className="text-[var(--accent-ink)] underline underline-offset-2">
                  {h.label} →
                </Link>
              </li>
            );
          })}
        </ul>
      </Modal>

      <Modal open={!!receipt} onClose={() => { setReceipt(null); setHandoff(undefined); }} title={`${commitLabel} 완료`}>
        <p className="mb-3 text-[13px] text-t2">아래 {receipt?.length ?? 0}건이 목록에서 제거되었습니다(검토 완료 처리).</p>
        <ul className="flex flex-col gap-1 text-[12.5px] text-t">
          {receipt?.map((r) => (
            <li key={r.id}>
              {r.label ?? r.targetId} · {KIND_LABEL[r.kind]} × {r.qty}
            </li>
          ))}
        </ul>
        {/* CP-230: handoff — 재고·금액은 여기서 안 바뀐다. unmanned_audit는 실사 기록 결과, rental_*는 예약 상세로 가는 링크만 보여준다. */}
        {handoff?.stockTakeId != null && (
          <p className="mt-3 rounded-[var(--r-md)] border border-[var(--bd)] bg-ib px-3 py-2 text-[12.5px] text-it">
            진행중 실사에 {handoff.countedLines ?? 0}건이 카운트로 기록됐습니다. 재고는 실사 완료 처리에서 반영됩니다.
          </p>
        )}
        {handoff?.stockTakeId === null && (
          <p className="mt-3 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3 py-2 text-[12.5px] text-t2">
            진행중인 실사가 없어 카운트를 기록하지 못했습니다. 재고·실사 화면에서 먼저 실사를 시작하세요.
          </p>
        )}
        {handoff?.reservations && handoff.reservations.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <p className="text-[12.5px] font-medium text-t2">해당 예약에서 출고/반납을 확정하세요:</p>
            <ul className="flex flex-col gap-1">
              {handoff.reservations.map((r) => (
                <li key={r.reservationId} className="text-[12.5px]">
                  <Link href={`/w/${businessId}/reservations/${r.reservationId}`} className="text-[var(--accent-ink)] underline underline-offset-2">
                    예약 상세로 이동(항목 {r.itemIds.length}건) →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
