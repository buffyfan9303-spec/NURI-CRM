"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Printer, Pencil, X, Check, Camera } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { formatKRW } from "@/lib/domain/money";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { defaultFactoryOptions, defaultFactoryQty, type OptionValue } from "@/lib/domain/factory-options";
import { readMaterialSelection, writeMaterialSelection } from "@/lib/domain/factory-materials";
import {
  updateFactoryOrderSchedule,
  updateFactoryOrderOptions,
  cancelFactoryOrder,
  addFittingLog,
} from "@/lib/domain/factory-actions";
import type { MaterialOption } from "@/lib/domain/factory-types";
import type { FactoryOrderRow, FactoryProcessRow, FittingLogRow } from "@/lib/domain/factory";
import { GarmentWorkspace } from "@/components/garment/GarmentWorkspace";
import { OptionsSummary } from "./OptionsSummary";

const TYPE_LABEL: Record<string, string> = { suit: "정장", shirt: "셔츠", shoe: "구두" };

const selectClass =
  "h-11 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-sm text-t outline-none focus:border-[var(--accent)]";

export function OrderDetail({
  businessId,
  order,
  processes,
  fittingLogs,
  canWrite,
  canReadRevenue,
  fabrics,
  linings,
  buttons,
}: {
  businessId: string;
  order: FactoryOrderRow;
  processes: FactoryProcessRow[];
  fittingLogs: FittingLogRow[];
  canWrite: boolean;
  /** 결함 CLICK-PATH-106: 공장만 revenue.read 없이 금액을 노출했다. 다른 업종과 같은 계약으로 게이팅. */
  canReadRevenue: boolean;
  fabrics: MaterialOption[];
  linings: MaterialOption[];
  buttons: MaterialOption[];
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const refresh = () => { setNotice(null); router.refresh(); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-semibold text-t">{order.orderNo} — {order.customerName ?? "고객 미지정"}</h1>
          <p className="text-[12.5px] text-t2">{TYPE_LABEL[order.type]} · {order.status}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/w/${businessId}/orders/${order.id}/print`}>
            <Button size="sm" variant="secondary"><Printer size={14} />작지서 인쇄</Button>
          </Link>
          {canWrite && order.status !== "완료" && order.status !== "취소" && (
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!confirm("이 주문을 취소하시겠습니까?")) return;
                const r = await cancelFactoryOrder(businessId, order.id);
                if (!r.ok) { setNotice(r.message); return; }
                refresh();
              }}
            >
              주문 취소
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-[var(--r-md)] bg-eb px-3 py-2 text-[12.5px] text-et">{notice}</div>
      )}

      {canReadRevenue && (
        <Card className="p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-t">금액 (서버 계산값)</h2>
          <div className="grid grid-cols-3 gap-4 text-[13px]">
            <Amount label="공급가" value={order.supply} />
            <Amount label="부가세" value={order.vat} />
            <Amount label="합계" value={order.total} bold />
          </div>
        </Card>
      )}

      <ScheduleCard businessId={businessId} order={order} canWrite={canWrite} onSaved={refresh} />

      {order.type === "suit" && (
        <OptionsCard
          businessId={businessId}
          order={order}
          canWrite={canWrite}
          onSaved={refresh}
          fabrics={fabrics}
          linings={linings}
          buttons={buttons}
        />
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-t">공정</h2>
          <Link href={`/w/${businessId}/production`} className="text-[12.5px] text-[var(--accent-ink)] hover:underline">
            공정 칸반에서 보기 →
          </Link>
        </div>
        {processes.length === 0 ? (
          <p className="text-[12.5px] text-t3">아직 공정 기록이 없습니다. 공정 칸반에서 "작지"부터 시작하세요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {processes.map((p) => (
              <span key={p.id} className="rounded-[6px] border border-[var(--bd)] px-2.5 py-1 text-[11.5px] text-t2">
                {p.stage}: {p.status}{p.assignee ? ` · 담당 ${p.assignee.slice(0, 8)}` : ""}
              </span>
            ))}
          </div>
        )}
      </Card>

      <FittingLogsCard businessId={businessId} order={order} logs={fittingLogs} canWrite={canWrite} onSaved={refresh} />
    </div>
  );
}

function Amount({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-t3">{label}</div>
      <div className={bold ? "text-[16px] font-bold text-t" : "text-[13px] text-t"}>{formatKRW(value)}</div>
    </div>
  );
}

function ScheduleCard({
  businessId, order, canWrite, onSaved,
}: { businessId: string; order: FactoryOrderRow; canWrite: boolean; onSaved: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [fittingDate, setFittingDate] = React.useState(order.fittingDate ?? "");
  const [dueDate, setDueDate] = React.useState(order.dueDate ?? "");
  const [deliveredDate, setDeliveredDate] = React.useState(order.deliveredDate ?? "");
  const [memo, setMemo] = React.useState(order.memo ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    const r = await updateFactoryOrderSchedule(businessId, order.id, {
      fittingDate: fittingDate || null, dueDate: dueDate || null, deliveredDate: deliveredDate || null, memo: memo || null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setEditing(false);
    onSaved();
  };

  // 결함 CLICK-PATH-105: "취소"가 setEditing(false)만 하고 draft(fittingDate 등) state를
  // 버리지 않아서, 다음 "수정" 클릭 때 이전에 취소한 미저장 값이 그대로 남아 있었다.
  // OptionsCard의 cancelEdit과 같은 계약 — 취소는 서버 확정값(order)으로 되돌린다.
  const cancelEdit = () => {
    setFittingDate(order.fittingDate ?? "");
    setDueDate(order.dueDate ?? "");
    setDeliveredDate(order.deliveredDate ?? "");
    setMemo(order.memo ?? "");
    setError(null);
    setEditing(false);
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-[14px] font-semibold text-t [word-break:keep-all]">일정</h2>
        {canWrite && !editing && (
          <Button size="sm" variant="ghost" className="shrink-0 whitespace-nowrap" onClick={() => setEditing(true)}><Pencil size={14} />수정</Button>
        )}
      </div>
      {!editing ? (
        <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <Info label="주문일" value={order.orderDate} />
          <Info label="가봉일" value={order.fittingDate} />
          <Info label="납기" value={order.dueDate} />
          <Info label="출고일" value={order.deliveredDate} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
          <Field label="가봉일" htmlFor="fitDate"><input id="fitDate" type="date" className={selectClass} value={fittingDate} onChange={(e) => setFittingDate(e.target.value)} /></Field>
          <Field label="납기" htmlFor="dueDate"><input id="dueDate" type="date" className={selectClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="출고일" htmlFor="delDate"><input id="delDate" type="date" className={selectClass} value={deliveredDate} onChange={(e) => setDeliveredDate(e.target.value)} /></Field>
        </div>
      )}
      {editing && (
        <Field label="메모" htmlFor="memo2">
          <textarea id="memo2" rows={2} className="w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 py-2 text-sm text-t outline-none focus:border-[var(--accent)]" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      )}
      {!editing && order.memo && <p className="mt-2 text-[12.5px] text-t2">메모: {order.memo}</p>}
      <p className="mt-2 flex items-center gap-1 text-[11.5px] text-t3">
        <CalendarDays size={13} />
        가봉일·납기·출고일이 저장되면 사업장 캘린더에 자동 반영됩니다.
        <Link href={`/w/${businessId}/calendar`} className="whitespace-nowrap text-[var(--accent-ink)] hover:underline">캘린더 보기 →</Link>
      </p>
      <FormError message={error ?? undefined} />
      {editing && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancelEdit}><X size={14} />취소</Button>
          <Button size="sm" onClick={save} loading={busy}><Check size={14} />저장</Button>
        </div>
      )}
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] text-t3">{label}</div>
      <div className="text-t">{value ?? "-"}</div>
    </div>
  );
}

/**
 * 정장 옵션 41항목 + 선택 자재 편집.
 *
 * 요청 §3/§6.1 버그 수정: 예전엔 options/qty state를 한 번만 초기화해 계속 재사용했기
 * 때문에, "수정" 중 값을 바꾸고 "취소"를 눌러도 그 mutated state가 그대로 남아서
 * 비편집(읽기) 뷰가 서버에 저장되지 않은 값을 보여줬다. 이제 읽기 뷰는 항상
 * `order.options`/`order.qty`(서버 확정본 prop) 를 직접 읽고, 편집용 draft는 "수정" 버튼을
 *누른 시점에만 그 확정본에서 새로 복사해 만들며, "취소"는 draft를 통째로 버린다.
 * 다른 주문으로 이동하면 이 컴포넌트 자체가 새 order prop으로 다시 마운트되어(부모 목록/상세
 * 페이지가 orderId별 라우트라 리마운트) 이전 draft가 섞이지 않는다.
 */
function OptionsCard({
  businessId, order, canWrite, onSaved, fabrics, linings, buttons,
}: {
  businessId: string; order: FactoryOrderRow; canWrite: boolean; onSaved: () => void;
  fabrics: MaterialOption[]; linings: MaterialOption[]; buttons: MaterialOption[];
}) {
  const [editing, setEditing] = React.useState(false);
  const [draftOptions, setDraftOptions] = React.useState<Record<string, OptionValue> | null>(null);
  const [draftQty, setDraftQty] = React.useState<Record<string, number> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const startEdit = () => {
    // 결함 CLICK-PATH-107: 예전엔 order.options를 그대로만 복사했다 — 새 옵션 필드가
    // 추가된 뒤 만들어진 기존 주문은 그 키가 아예 없는데, 저장 검증(factory-options.ts)은
    // 41항목 전체 키를 요구해 저장이 막혔다. 기본값으로 먼저 채우고 서버 확정값을 덮어쓴다.
    setDraftOptions({ ...defaultFactoryOptions(), ...(order.options as Record<string, OptionValue>) });
    setDraftQty({ ...defaultFactoryQty(), ...order.qty });
    setError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraftOptions(null); // 미저장 값 완전 폐기 — 다음 "수정" 클릭 때 서버 확정본에서 다시 시작
    setDraftQty(null);
  };
  const save = async () => {
    if (!draftOptions || !draftQty) return;
    setBusy(true); setError(null);
    const r = await updateFactoryOrderOptions(businessId, order.id, { options: draftOptions, qty: draftQty });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setEditing(false);
    setDraftOptions(null);
    setDraftQty(null);
    onSaved();
  };

  const confirmedMaterials = readMaterialSelection(order.options as Record<string, unknown>);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-[14px] font-semibold text-t [word-break:keep-all]">정장 옵션 (41항목) · 원단/디자인 미리보기</h2>
        {canWrite && !editing && (
          <Button size="sm" variant="ghost" className="shrink-0 whitespace-nowrap" onClick={startEdit}><Pencil size={14} />수정</Button>
        )}
      </div>
      {editing && draftOptions && draftQty ? (
        <>
          <GarmentWorkspace
            options={draftOptions}
            qty={draftQty}
            materials={readMaterialSelection(draftOptions)}
            onOptionsChange={(key, value) => setDraftOptions((o) => ({ ...(o ?? {}), [key]: value as OptionValue }))}
            onQtyChange={(key, value) => setDraftQty((q) => ({ ...(q ?? {}), [key]: value }))}
            onMaterialsChange={(sel) => setDraftOptions((o) => writeMaterialSelection(o ?? {}, sel) as Record<string, OptionValue>)}
            fabrics={fabrics}
            linings={linings}
            buttons={buttons}
            serverOptions={order.options as Record<string, OptionValue>}
            serverQty={order.qty}
          />
          <FormError message={error ?? undefined} />
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={cancelEdit}><X size={14} />취소</Button>
            <Button size="sm" onClick={save} loading={busy}><Check size={14} />저장</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {(confirmedMaterials.fabricLabel || confirmedMaterials.liningLabel || confirmedMaterials.buttonLabel) && (
            <div className="grid grid-cols-1 gap-2 rounded-[var(--r-md)] bg-sf2 p-2.5 text-[12px] sm:grid-cols-3">
              <div><span className="text-t3">원단: </span><span className="text-t">{confirmedMaterials.fabricLabel ?? "미등록"}</span></div>
              <div><span className="text-t3">안감: </span><span className="text-t">{confirmedMaterials.liningLabel ?? "미등록"}</span></div>
              <div><span className="text-t3">단추: </span><span className="text-t">{confirmedMaterials.buttonLabel ?? "미등록"}</span></div>
            </div>
          )}
          <OptionsSummary options={order.options as Record<string, OptionValue>} qty={order.qty} />
        </div>
      )}
    </Card>
  );
}

function FittingLogsCard({
  businessId, order, logs, canWrite, onSaved,
}: { businessId: string; order: FactoryOrderRow; logs: FittingLogRow[]; canWrite: boolean; onSaved: () => void }) {
  const [notes, setNotes] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const sb = getBrowserSupabase();
      const photoPaths: string[] = [];
      for (const file of files) {
        const path = `${businessId}/factory-orders/${order.id}/fitting/${Date.now()}-${file.name}`;
        const { error: upErr } = await sb.storage.from("crm-files").upload(path, file, { upsert: false });
        if (upErr) throw new Error(`사진 업로드 실패(${file.name}): ${upErr.message}`);
        photoPaths.push(path);
      }
      const r = await addFittingLog(businessId, order.id, { notes: notes || undefined, photoPaths });
      if (!r.ok) throw new Error(r.message);
      setNotes(""); setFiles([]);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "가봉 기록 저장 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[14px] font-semibold text-t">가봉 기록</h2>
      {logs.length === 0 ? (
        <p className="mb-3 text-[12.5px] text-t3">가봉 기록이 없습니다.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-[var(--r-md)] border border-[var(--bd)] p-3 text-[12.5px]">
              {/* ponytail: toLocaleString("ko-KR")은 ICU 빌드별 오전/오후 표기 차이로 SSR/CSR hydration 불일치가 나서 formatInTz(고정 tz, 수동 오전/오후)로 교체. */}
              <div className="text-t3">{formatInTz(l.at, DEFAULT_TZ, "yyyy. M. d. a h:mm:ss")}</div>
              {l.notes && <div className="mt-1 text-t">{l.notes}</div>}
              {l.photoPaths.length > 0 && (
                <div className="mt-1 text-t3">사진 {l.photoPaths.length}장 (Storage 저장됨)</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="border-t border-[var(--bd)] pt-3">
          <Field label="메모" htmlFor="fit-notes">
            <textarea id="fit-notes" rows={2} className="w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 py-2 text-sm text-t outline-none focus:border-[var(--accent)]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label="사진" htmlFor="fit-photos" hint="Storage(crm-files)에 업로드되고 경로만 저장됩니다(base64 저장 금지).">
            <input id="fit-photos" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </Field>
          <FormError message={error ?? undefined} />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={submit} loading={busy}><Camera size={14} />가봉 기록 저장</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
