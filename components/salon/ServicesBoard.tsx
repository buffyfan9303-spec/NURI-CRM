"use client";

/**
 * 시술 메뉴(서비스) — 4열 표(이름 / 가격 / 소요시간 / 재방문 주기). 등록은 모달, 재방문 주기는 행에서 바로 저장.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { CellName } from "@/components/ui/ResponsiveTable";
import { CardHead, Alert, TABLE, THEAD, TH, TR, TD, CONTROL_SM } from "@/components/rental/listkit";
import type { SalonService } from "@/lib/domain/salon";
import { createService, setServiceRevisitDays } from "@/lib/domain/salon-actions";
import { formatKRW } from "@/lib/domain/money";

export function ServicesBoard({ businessId, canWrite, services }: { businessId: string; canWrite: boolean; services: SalonService[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="시술 메뉴"
        description={`${services.length}개 · 가격·소요시간·재방문 주기`}
        action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus size={14} aria-hidden />서비스 등록</Button> : undefined}
      />
      {services.length === 0 ? (
        <EmptyState
          title="등록된 서비스가 없습니다."
          description="시술 메뉴를 등록해야 예약을 잡을 수 있습니다."
          action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>서비스 등록</Button> : undefined}
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className={`${TABLE} min-w-[320px]`}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>서비스</th>
                <th className={`${TH} text-right`}>가격</th>
                <th className={`${TH} hidden text-right sm:table-cell`}>소요</th>
                <th className={`${TH} text-right`}>재방문 주기</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <ServiceRow key={s.id} businessId={businessId} canWrite={canWrite} service={s} onSaved={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewServiceModal businessId={businessId} open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); router.refresh(); }} />
    </Card>
  );
}

function ServiceRow({ businessId, canWrite, service, onSaved }: { businessId: string; canWrite: boolean; service: SalonService; onSaved: () => void }) {
  const [days, setDays] = React.useState(service.revisitDays != null ? String(service.revisitDays) : "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async () => {
    const next = days.trim() ? Number(days) : null;
    if (next === service.revisitDays) return;
    setBusy(true); setErr(null);
    try {
      const r = await setServiceRevisitDays(businessId, service.id, next);
      if (!r.ok) { setErr(r.message); return; }
      onSaved();
    } catch {
      setErr("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={`${TR} h-[52px]`}>
      <td className={TD}>
        <CellName max={260}>{service.name}</CellName>
        {service.category && <span className="block text-[11.5px] text-t3">{service.category}</span>}
      </td>
      <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{formatKRW(service.price)}<span className="block text-[11.5px] text-t3 sm:hidden">{service.durationMinutes}분</span></td>
      <td className={`${TD} hidden whitespace-nowrap text-right tabular-nums text-t2 sm:table-cell`}>{service.durationMinutes}분</td>
      <td className={`${TD} text-right`}>
        <label className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap text-[12px] text-t3">
          <input
            type="number"
            min={1}
            disabled={!canWrite || busy}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="—"
            aria-label={`${service.name} 재방문 주기(일)`}
            className={`${CONTROL_SM} w-[64px] text-right tabular-nums`}
          />
          일
        </label>
        {err && <span className="block text-[11px] text-et">{err}</span>}
      </td>
    </tr>
  );
}

function NewServiceModal({ businessId, open, onClose, onCreated }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const EMPTY = { name: "", price: "", durationMinutes: "60", revisitDays: "" };
  const [form, setForm] = React.useState(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setForm(EMPTY); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!form.name.trim()) { setError("서비스명을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await createService(businessId, { name: form.name.trim(), price: Number(form.price) || 0, durationMinutes: Number(form.durationMinutes) || 30 });
      if (!r.ok) { setError(r.message); return; }
      // S3: createService는 아직 revisitDays를 받지 않으므로 생성 직후 별도 호출로 설정한다.
      const days = form.revisitDays.trim() ? Number(form.revisitDays) : null;
      if (days != null && r.data) {
        const rd = await setServiceRevisitDays(businessId, r.data.id, days);
        if (!rd.ok) { setError(`서비스는 등록됐지만 재방문 주기를 저장하지 못했습니다: ${rd.message}`); return; }
      }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="서비스 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>등록</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Input label="서비스명" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="예: 여성 커트" />
        <div className="grid grid-cols-2 gap-x-3">
          <Input label="가격(원)" inputMode="numeric" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0" />
          <Input label="소요시간(분)" type="number" min={5} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
        </div>
        <Input label="재방문 주기(일)" type="number" min={1} value={form.revisitDays} onChange={(e) => setForm((f) => ({ ...f, revisitDays: e.target.value }))} hint="비우면 재방문 권유 대상 계산에서 제외됩니다." wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}
