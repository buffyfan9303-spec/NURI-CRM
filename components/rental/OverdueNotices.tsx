"use client";

/**
 * 홈 "반납 지연" 카드 — 연체 예약마다 독촉 문구(R2)를 만들어 복사/문자/전화로 보낸다.
 * 연체료는 revenue.read 가 있을 때만 서버(calcLateFeeAction)에서 받아 문구에 넣는다.
 */
import * as React from "react";
import Link from "next/link";
import { MessageSquare } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MessageActions } from "@/components/common/MessageActions";
import { rentalOverdueNotice } from "@/lib/domain/messages";
import { calcLateFeeAction } from "@/lib/domain/rental-actions";
import { formatInTz } from "@/lib/utils/datetime";

export interface OverdueRow {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  periodEndIso: string;
  daysLate: number;
}

export function OverdueNotices({
  businessId,
  businessName,
  tz,
  rows,
  canReadRevenue,
}: {
  businessId: string;
  businessName: string;
  tz: string;
  rows: OverdueRow[];
  canReadRevenue: boolean;
}) {
  const [target, setTarget] = React.useState<OverdueRow | null>(null);
  const [lateFee, setLateFee] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);

  const open = async (r: OverdueRow) => {
    setTarget(r);
    setLateFee(null);
    if (!canReadRevenue) return;
    setLoading(true);
    const q = await calcLateFeeAction(businessId, r.id);
    setLoading(false);
    if (q.ok) setLateFee(q.data.amount);
  };

  if (rows.length === 0) return <p className="text-[12.5px] text-t3">반납이 지연된 예약이 없습니다.</p>;

  const text = target
    ? rentalOverdueNotice({ businessName, customerName: target.customerName, periodEndIso: target.periodEndIso, daysLate: target.daysLate, lateFee, tz })
    : "";

  return (
    <>
      <ul className="flex flex-col divide-y divide-[var(--bd)]">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-1.5">
            <Link href={`/w/${businessId}/reservations/${r.id}`} className="flex min-h-[40px] min-w-0 flex-1 flex-col justify-center rounded-[var(--r-sm)] px-1 hover:bg-sf2 [@media(pointer:coarse)]:min-h-[44px]">
              <span className="truncate text-[13px] font-medium text-t">{r.customerName ?? "고객 미지정"}</span>
              <span className="truncate text-[11.5px] text-et">반납 예정 {formatInTz(r.periodEndIso, tz, "M. d.")} · {r.daysLate}일 지남</span>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => open(r)} aria-label={`${r.customerName ?? "고객"} 독촉 문구`}>
              <MessageSquare size={13} aria-hidden />독촉
            </Button>
          </li>
        ))}
      </ul>
      <Modal open={!!target} onClose={() => setTarget(null)} title="반납 지연 독촉 문구" footer={<Button variant="secondary" onClick={() => setTarget(null)}>닫기</Button>}>
        {loading ? (
          <p className="py-4 text-center text-[12.5px] text-t3">연체료를 계산하는 중…</p>
        ) : (
          <MessageActions text={text} phone={target?.customerPhone ?? undefined} title="문구(수정 가능)" />
        )}
      </Modal>
    </>
  );
}
