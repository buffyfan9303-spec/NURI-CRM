"use client";

/** 민원·수리 작업지시: 목록(상태 탭) + 등록 + 상태·담당자·처리 비용 변경. 권한은 서버가 다시 확인한다. */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, SelectField, StatusTab, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { createWorkOrder, updateWorkOrder } from "@/lib/domain/building-actions";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { num, won } from "./format";
import type { WorkOrderRow, WorkOrderStatus } from "@/lib/domain/building-types";

export interface WorkOrdersProps {
  businessId: string; buildingId: string; canWrite: boolean; canCost: boolean;
  units: { id: string; label: string }[]; members: { userId: string; name: string }[]; rows: WorkOrderRow[];
}
const STATUS: Record<WorkOrderStatus, { label: string; kind: "warning" | "info" | "success" | "error" }> = {
  open: { label: "접수됨", kind: "warning" }, in_progress: { label: "처리 중", kind: "info" }, done: { label: "완료", kind: "success" }, cancelled: { label: "취소", kind: "error" },
};
const TABS: { key: WorkOrderStatus | "all"; label: string }[] = [{ key: "all", label: "전체" }, { key: "open", label: "접수됨" }, { key: "in_progress", label: "처리 중" }, { key: "done", label: "완료" }, { key: "cancelled", label: "취소" }];

export function WorkOrdersBoard(p: WorkOrdersProps) {
  const [tab, setTab] = React.useState<WorkOrderStatus | "all">("open");
  const [adding, setAdding] = React.useState(false);
  const unitName = new Map(p.units.map((u) => [u.id, u.label]));
  const memberName = new Map(p.members.map((m) => [m.userId, m.name]));
  const shown = tab === "all" ? p.rows : p.rows.filter((r) => r.status === tab);
  const count = (k: WorkOrderStatus | "all") => (k === "all" ? p.rows.length : p.rows.filter((r) => r.status === k).length);
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="민원·수리" description="입주자가 알려 온 불편과 고칠 일을 적고, 끝날 때까지 상태를 봅니다."
        action={p.canWrite ? <Button type="button" size="sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>{adding ? "닫기" : "민원·수리 등록"}</Button> : undefined} />
      {adding && p.canWrite && <AddForm {...p} onDone={() => setAdding(false)} />}
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="처리 상태">
        {TABS.map((t) => <StatusTab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={count(t.key)}>{t.label}</StatusTab>)}
      </div>
      {shown.length === 0 ? (
        <EmptyState title={p.rows.length === 0 ? "등록된 민원·수리가 없습니다." : "이 상태의 건이 없습니다."} description={p.canWrite && p.rows.length === 0 ? "오른쪽 위 버튼으로 첫 건을 등록하세요." : undefined} />
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>접수일</th><th className={TH}>내용</th><th className={TH}>호실</th><th className={TH}>담당자</th><th className={TH}>상태</th>{p.canCost && <th className={`${TH} text-right`}>든 비용</th>}<th className={TH}><span className="sr-only">작업</span></th></tr></thead>
            <tbody>{shown.map((r) => <Row key={r.id} r={r} p={p} unit={r.unit_id ? unitName.get(r.unit_id) ?? "-" : "공용"} who={r.assignee ? memberName.get(r.assignee) ?? "(알 수 없음)" : "담당자 없음"} />)}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AddForm(p: WorkOrdersProps & { onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [title, setTitle] = React.useState(""), [unit, setUnit] = React.useState(""), [who, setWho] = React.useState(""), [memo, setMemo] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const r = await run(() => createWorkOrder(p.businessId, p.buildingId, { title: title.trim(), unit_id: unit || null, assignee: who || null, memo: memo.trim() || undefined }), { success: "등록했습니다." });
    if (r.ok) p.onDone();
  };
  return (
    <form onSubmit={submit} className={`mb-4 rounded-[var(--radius-md)] border border-[var(--bd)] bg-sf2/40 p-4 ${FORM_ROW}`}>
      <Input label="내용" required value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} hint="예: 302호 화장실 물 샘, 지하 주차장 전등 교체" wrapperClassName={FW.memo} />
      <div className="contents">
        <SelectField label="호실" value={unit} onChange={(e) => setUnit(e.target.value)} hint="공용 부분이면 공용" wrapperClassName={FW.select}><option value="">공용</option>{p.units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</SelectField>
        <SelectField label="담당자" value={who} onChange={(e) => setWho(e.target.value)} wrapperClassName={FW.select}><option value="">담당자 없음</option>{p.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</SelectField>
      </div>
      <Input label="메모(선택)" value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} wrapperClassName={FW.memo} />
      {error && <Alert kind="error" className="w-full">{error}</Alert>}
      <div className={FORM_ACTIONS}><Button type="submit" loading={pending} disabled={!title.trim()}>등록</Button><Button type="button" variant="ghost" onClick={p.onDone}>취소</Button></div>
    </form>
  );
}

function Row({ r, p, unit, who }: { r: WorkOrderRow; p: WorkOrdersProps; unit: string; who: string }) {
  const [open, setOpen] = React.useState(false);
  const s = STATUS[r.status];
  return (
    <>
      <tr className={TR}>
        <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.created_at.slice(0, 10)}</td>
        <td className={TD}>{r.title}{r.memo && <span className="block text-[length:var(--fs-meta)] text-t3">{r.memo}</span>}</td>
        <td className={TD}>{unit}</td><td className={TD}>{who}</td>
        <td className={TD}><Badge kind={s.kind}>{s.label}</Badge>{r.done_at && <span className="ml-1 text-[length:var(--fs-meta)] tabular-nums text-t3">{r.done_at.slice(0, 10)}</span>}</td>
        {p.canCost && <td className={`${TD} text-right tabular-nums`}>{r.cost === null ? "-" : won(r.cost)}</td>}
        <td className={`${TD} whitespace-nowrap text-right`}>{p.canWrite && <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "닫기" : "처리"}</Button>}</td>
      </tr>
      {open && <tr className="border-b border-[var(--bd)] bg-sf2/40"><td colSpan={p.canCost ? 7 : 6} className="px-3 py-4"><Edit r={r} p={p} onDone={() => setOpen(false)} /></td></tr>}
    </>
  );
}

function Edit({ r, p, onDone }: { r: WorkOrderRow; p: WorkOrdersProps; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [status, setStatus] = React.useState<WorkOrderStatus>(r.status), [who, setWho] = React.useState(r.assignee ?? ""), [cost, setCost] = React.useState(r.cost === null ? "" : String(r.cost));
  const save = async () => {
    const patch: Parameters<typeof updateWorkOrder>[2] = {};
    if (status !== r.status) { patch.status = status; patch.done_at = status === "done" ? new Date().toISOString() : null; }
    if (who !== (r.assignee ?? "")) patch.assignee = who || null;
    if (p.canCost && cost !== (r.cost === null ? "" : String(r.cost))) patch.cost = cost === "" ? null : Number(cost);
    if (Object.keys(patch).length === 0) { onDone(); return; }
    const res = await run(() => updateWorkOrder(p.businessId, r.id, patch), { success: "저장했습니다." });
    if (res.ok) onDone();
  };
  const costBad = p.canCost && cost !== "" && !/^\d+$/.test(cost);
  return (
    <div>
      <div className={`${FORM_ROW} mb-3`}>
        <SelectField label="상태" value={status} onChange={(e) => setStatus(e.target.value as WorkOrderStatus)} wrapperClassName={FW.select}>{(Object.keys(STATUS) as WorkOrderStatus[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</SelectField>
        <SelectField label="담당자" value={who} onChange={(e) => setWho(e.target.value)} wrapperClassName={FW.select}><option value="">담당자 없음</option>{p.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</SelectField>
        {p.canCost && <Input label="든 비용(원)" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))} className={MONEY_INPUT} wrapperClassName={FW.money} error={costBad ? "숫자만 적으세요." : undefined} hint={cost ? `${num(Number(cost))}원. 비용 입력과 따로 적힙니다.` : "비용 입력과 따로 적힙니다."} />}
      </div>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className="flex gap-2"><Button type="button" loading={pending} disabled={costBad} onClick={save}>저장</Button><Button type="button" variant="ghost" onClick={onDone}>닫기</Button></div>
    </div>
  );
}
