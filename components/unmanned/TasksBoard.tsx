"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Plus, RefreshCw } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import type { UsTask, DailyChecklist } from "@/lib/domain/unmanned";
import { DailyChecklistCard } from "./DailyChecklistCard";
import { createTask, updateTaskStatus, generateExpiryTasks } from "@/lib/domain/unmanned-actions";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { StatusTab, FilterRow, SelectField, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";

const TASK_TYPES = ["보충", "청소", "시설점검", "기한점검", "기타"] as const;
const EMPTY_FORM = { taskType: "보충" as (typeof TASK_TYPES)[number], title: "", dueDate: "" };

export function TasksBoard({ businessId, canWrite, tasks, todayKey, dueToday = false, checklist }: { businessId: string; canWrite: boolean; tasks: UsTask[]; todayKey: string; dueToday?: boolean; checklist: DailyChecklist | null }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"all" | "예정" | "완료" | "건너뜀">(dueToday ? "예정" : "all");
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (newOpen) { setForm(EMPTY_FORM); setFormError(null); }
  }, [newOpen]);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, onError: (m: string) => void = setError) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { onError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.title || !form.dueDate) { setFormError("제목과 기한을 입력하세요."); return; }
    setFormError(null);
    const ok = await run(() => createTask(businessId, form), setFormError);
    if (ok) { setForm(EMPTY_FORM); setNewOpen(false); }
  };

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [tasks]);
  const filtered = status === "all" ? tasks : tasks.filter((t) => t.status === status);
  const overdueCount = tasks.filter((t) => t.status === "예정" && t.dueDate < todayKey).length;

  // 표와 카드가 같은 값·같은 권한 조건을 쓰도록 한 곳에서 계산한다.
  const rowView = (t: UsTask) => {
    const overdue = t.status === "예정" && t.dueDate < todayKey;
    const isToday = t.status === "예정" && t.dueDate === todayKey;
    return {
      due: <span className={overdue ? "font-medium tabular-nums text-et" : isToday ? "font-medium tabular-nums text-wt" : "tabular-nums text-t2"}>{t.dueDate}{overdue ? " · 기한 지남" : isToday ? " · 오늘" : ""}</span>,
      badge: <Badge kind={t.status === "완료" ? "success" : t.status === "건너뜀" ? "info" : overdue ? "error" : "warning"}>{t.status}</Badge>,
      type: <span className="rounded-[6px] bg-sf2 px-1.5 py-0.5 text-[11px] text-t2">{t.taskType}</span>,
      actions: canWrite && t.status === "예정" ? (
        <div className="flex items-center gap-1.5">
          <Button variant="primary" size="sm" className="min-w-[64px] justify-center" loading={busy} onClick={() => run(() => updateTaskStatus(businessId, t.id, "완료"))}>완료</Button>
          <Button variant="secondary" size="sm" className="min-w-[64px] justify-center" disabled={busy} onClick={() => run(() => updateTaskStatus(businessId, t.id, "건너뜀"))}>건너뜀</Button>
        </div>
      ) : null,
    };
  };

  return (
    <>
      <PageHeader
        title="점검·보충"
        description="보충·청소·시설·유통기한 점검을 기한별로 관리합니다. 완료·건너뜀 처리는 되돌릴 수 없습니다."
        meta={overdueCount > 0 ? <span className="rounded-full bg-eb px-2 py-0.5 text-[12px] font-medium tabular-nums text-et">기한 지남 {overdueCount}건</span> : undefined}
        actions={
          canWrite ? (
            <>
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  setNotice(null);
                  const ok = await run(() => generateExpiryTasks(businessId));
                  if (ok) setNotice("유통기한 임박 품목을 기준으로 점검 업무를 생성했습니다.");
                }}
              >
                <RefreshCw size={15} aria-hidden />유통기한 업무 자동 생성
              </Button>
              <Button onClick={() => setNewOpen(true)}>
                <Plus size={15} aria-hidden />업무 등록
              </Button>
            </>
          ) : undefined
        }
      >
        {tasks.length > 0 && (
          <FilterRow>
            <StatusTab active={status === "all"} onClick={() => setStatus("all")} count={tasks.length}>전체</StatusTab>
            <StatusTab active={status === "예정"} onClick={() => setStatus("예정")} count={counts.get("예정") ?? 0}>예정</StatusTab>
            <StatusTab active={status === "완료"} onClick={() => setStatus("완료")} count={counts.get("완료") ?? 0}>완료</StatusTab>
            <StatusTab active={status === "건너뜀"} onClick={() => setStatus("건너뜀")} count={counts.get("건너뜀") ?? 0}>건너뜀</StatusTab>
            <span className="mx-1 hidden h-4 w-px bg-[var(--bd)] sm:block" aria-hidden />
            <Link href={`/w/${businessId}/calendar`} className="inline-flex h-[32px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]">
              <CalendarClock size={13} aria-hidden />캘린더에서 보기
            </Link>
          </FilterRow>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        <DailyChecklistCard businessId={businessId} checklist={checklist} todayKey={todayKey} canWrite={canWrite} />

        {tasks.length === 0 ? (
          <Card>
            <EmptyState
              title={dueToday ? "오늘 처리할 업무가 없습니다." : "등록된 업무가 없습니다."}
              description={dueToday ? "오늘 이하 마감인 미처리 업무가 여기 표시됩니다." : "업무 등록 버튼으로 보충·청소·점검 일정을 만드세요."}
              action={canWrite && <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} aria-hidden />업무 등록</Button>}
            />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState title="해당 상태의 업무가 없습니다." description="다른 상태 탭을 선택해 보세요." />
          </Card>
        ) : (
          <TableOrCards
            rows={filtered}
            keyOf={(t) => t.id}
            table={
              <Card className="overflow-x-auto">
                <div className="px-4 pt-4"><h2 className="text-[var(--fs-card)] font-semibold text-t">점검·보충 업무</h2></div>
                <table className={`${TABLE} min-w-[720px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>유형</th>
                      <th className={TH}>업무</th>
                      <th className={TH}>기한</th>
                      <th className={TH}>상태</th>
                      {canWrite && <th className={TH}>처리</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const v = rowView(t);
                      return (
                        <tr key={t.id} className={`${TR} h-[52px]`}>
                          <td className={TD}>{v.type}</td>
                          <td className={TD}><CellName max={360}>{t.title}</CellName></td>
                          <td className={`${TD} whitespace-nowrap`}>{v.due}</td>
                          <td className={TD}>{v.badge}</td>
                          {canWrite && <td className={TD}>{v.actions}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            }
            card={(t) => {
              const v = rowView(t);
              return (
                <MobileCard
                  title={t.title}
                  sub={v.type}
                  badge={v.badge}
                  fields={[["기한", v.due]]}
                  actions={v.actions ?? undefined}
                />
              );
            }}
          />
        )}
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="업무 등록"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={() => submit()} loading={busy}>{busy ? "저장 중…" : "등록"}</Button>
          </>
        }
      >
        <form onSubmit={submit}>
          {formError && <Alert className="mb-3">{formError}</Alert>}
          <SelectField label="유형" value={form.taskType} onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value as typeof f.taskType }))}>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectField>
          <Input label="제목" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="예: 음료 냉장고 보충" />
          <Input label="기한" type="date" required value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} wrapperClassName="mb-0" />
        </form>
      </Modal>
    </>
  );
}
