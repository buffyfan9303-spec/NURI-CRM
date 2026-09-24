"use client";

/**
 * 미용실 수납 입력 모달 — 예약 목록·정산·고객 상세가 같은 폼을 쓴다(금액·수단·오류·저장중 한 곳).
 * 금액 판정은 서버(recordSalonPayment)가 한다. 성공하면 onDone → 호출부가 router.refresh().
 */
import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SelectField, Alert } from "@/components/rental/listkit";
import { recordSalonPayment } from "@/lib/domain/salon-actions";
import { formatKRW, parseKRW } from "@/lib/domain/money";

export const PAY_METHODS = ["카드", "현금", "계좌이체"] as const;

export interface PayTarget {
  appointmentId: string;
  customerId: string;
  customerName: string | null;
  serviceName: string | null;
  /** 잔액을 알면 기본값으로 채운다(정산·고객 상세). 모르면 예약가. */
  suggested: number;
  outstanding?: number | null;
}

export function PayModal({ businessId, target, onClose, onDone }: { businessId: string; target: PayTarget | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<string>(PAY_METHODS[0]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 대상이 바뀔 때마다 이전 입력이 남지 않게 초기화(CLICK-PATH-215와 같은 원칙).
  React.useEffect(() => {
    if (target) { setAmount(String(target.suggested)); setMethod(PAY_METHODS[0]); setError(null); }
  }, [target]);

  const submit = async () => {
    if (!target) return;
    const amt = parseKRW(amount);
    if (amt <= 0) { setError("수납액을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await recordSalonPayment(businessId, { appointmentId: target.appointmentId, customerId: target.customerId, amount: amt, method });
      if (!r.ok) { setError(r.message); return; }
      onDone();
    } catch {
      // QA2-S02: 서버 액션이 throw하면 예외가 조용히 빠져나가 모달이 무반응처럼 보였다.
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="수납 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>수납 등록</Button>
        </>
      }
    >
      {target && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-1">
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[var(--r-md)] bg-sf2 px-3.5 py-3 text-[12.5px]">
            <dt className="text-t3">고객</dt>
            <dd className="truncate font-medium text-t">{target.customerName ?? "고객 미지정"}</dd>
            <dt className="text-t3">시술</dt>
            <dd className="truncate text-t">{target.serviceName ?? "-"}</dd>
            {target.outstanding != null && (
              <>
                <dt className="text-t3">남은 잔액</dt>
                <dd className={"tabular-nums " + (target.outstanding > 0 ? "font-semibold text-et" : "text-t")}>{formatKRW(target.outstanding)}</dd>
              </>
            )}
          </dl>
          {error && <Alert className="mb-3">{error}</Alert>}
          <Input label="수납 금액(원)" required inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <SelectField label="결제 수단" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </SelectField>
        </form>
      )}
    </Modal>
  );
}
