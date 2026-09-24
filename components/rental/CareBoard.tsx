"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import type { CareJobRow, UnitPickerRow } from "@/lib/domain/rental-types";
import { createCareJob, completeCareJob } from "@/lib/domain/rental-actions";
import { StatusTab, FilterRow, SearchBox, TextAction, CardHead, SelectField, Alert, CONTROL_SM, TABLE, THEAD, TH, TR, TD } from "./listkit";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";

const KIND_LABEL = { wash: "세탁", repair: "수선", inspect: "검수" } as const;
const STATUS_LABEL = { open: "대기", doing: "진행중", done: "완료", cancelled: "취소" } as const;

export function CareBoard({
  businessId,
  jobs,
  units,
  canWrite,
  preselectUnit,
  upcomingUnitIds = [],
}: {
  businessId: string;
  jobs: CareJobRow[];
  units: UnitPickerRow[];
  canWrite: boolean;
  preselectUnit?: string;
  upcomingUnitIds?: string[];
}) {
  const router = useRouter();
  const [newOpen, setNewOpen] = React.useState(!!preselectUnit);
  const [q, setQ] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<"all" | CareJobRow["kind"]>("all");
  const upcoming = React.useMemo(() => new Set(upcomingUnitIds), [upcomingUnitIds]);

  const needle = q.trim().toLowerCase();
  const matches = (j: CareJobRow) =>
    (kindFilter === "all" || j.kind === kindFilter) &&
    (!needle || `${j.productName} ${j.unitCode}`.toLowerCase().includes(needle));

  const active = jobs.filter((j) => (j.status === "open" || j.status === "doing") && matches(j));
  const done = jobs.filter((j) => (j.status === "done" || j.status === "cancelled") && matches(j)).slice(0, 30);
  const kindCounts = React.useMemo(() => {
    const m = new Map<CareJobRow["kind"], number>();
    for (const j of jobs) m.set(j.kind, (m.get(j.kind) ?? 0) + 1);
    return m;
  }, [jobs]);
  const activeTotal = jobs.filter((j) => j.status === "open" || j.status === "doing").length;
  const filtersActive = !!needle || kindFilter !== "all";
  const clear = () => { setQ(""); setKindFilter("all"); };

  return (
    <>
      <PageHeader
        title="세탁·수선"
        description="진행 중인 개체는 새 예약에 배정할 수 없습니다. 완료 처리하면 대여가능 상태로 돌아갑니다."
        meta={<span className="rounded-full bg-sf2 px-2 py-0.5 text-[12px] font-medium tabular-nums text-t2">진행 {activeTotal}건</span>}
        actions={
          <Button
            onClick={() => setNewOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : "세탁·수선 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요."}
          >
            <Plus size={15} aria-hidden />
            세탁·수선 등록
          </Button>
        }
      >
        {jobs.length > 0 && (
          <FilterRow>
            <StatusTab active={kindFilter === "all"} onClick={() => setKindFilter("all")} count={jobs.length}>전체</StatusTab>
            {(Object.keys(KIND_LABEL) as CareJobRow["kind"][]).map((k) => (
              <StatusTab key={k} active={kindFilter === k} onClick={() => setKindFilter(k)} count={kindCounts.get(k) ?? 0}>
                {KIND_LABEL[k]}
              </StatusTab>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-[var(--bd)] sm:block" aria-hidden />
            <SearchBox value={q} onChange={setQ} placeholder="상품/개체코드 검색" className="min-w-[180px]" />
            {filtersActive && <TextAction onClick={clear}>필터 초기화</TextAction>}
          </FilterRow>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4">
        <Card className="p-4 sm:p-5">
          <CardHead title="진행 중" description="접수 순. 완료 처리 시 비용을 함께 기록합니다." />
          {jobs.length === 0 ? (
            <EmptyState title="진행 중인 세탁·수선이 없습니다." description="개체를 세탁·수선에 등록하면 여기 표시됩니다." />
          ) : active.length === 0 ? (
            <EmptyState title="검색·필터 결과가 없습니다." description="검색어나 종류 필터를 조정해 보세요." action={<TextAction onClick={clear}>필터 초기화</TextAction>} />
          ) : (
            <JobTable jobs={active} businessId={businessId} canWrite={canWrite} onChanged={() => router.refresh()} showComplete upcoming={upcoming} />
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHead title="완료·취소 이력" description="최근 30건" />
          {done.length === 0 ? (
            <EmptyState title="이력이 없습니다." />
          ) : (
            <JobTable jobs={done} businessId={businessId} canWrite={false} onChanged={() => router.refresh()} showComplete={false} upcoming={upcoming} />
          )}
        </Card>
      </div>

      <NewCareJobModal
        businessId={businessId}
        units={units}
        open={newOpen}
        preselectUnit={preselectUnit}
        onClose={() => setNewOpen(false)}
        onCreated={() => { setNewOpen(false); router.refresh(); }}
      />
    </>
  );
}

function JobTable({
  jobs,
  businessId,
  canWrite,
  onChanged,
  showComplete,
  upcoming,
}: {
  jobs: CareJobRow[];
  businessId: string;
  canWrite: boolean;
  onChanged: () => void;
  showComplete: boolean;
  upcoming: Set<string>;
}) {
  // 표와 카드가 같은 값·같은 권한 조건을 쓰도록 한 곳에서 계산한다.
  const rowView = (j: CareJobRow) => ({
    name: `${j.productName} · ${j.unitCode}`,
    kind: KIND_LABEL[j.kind],
    // ponytail: toLocaleString("ko-KR") → formatInTz. 로케일 ICU 오전/오후 표기가 서버·클라이언트 사이 달라져 hydration 오류가 나던 것을 없앤다.
    openedAt: formatInTz(j.openedAt, DEFAULT_TZ, "yyyy. M. d."),
    badge: <Badge kind={(j.status === "done" ? "success" : j.status === "cancelled" ? "info" : "warning") as BadgeKind}>{STATUS_LABEL[j.status]}</Badge>,
    closedAt: j.closedAt ? formatInTz(j.closedAt, DEFAULT_TZ, "yyyy. M. d.") : "미정",
    cost: formatKRW(j.cost),
    impact: upcoming.has(j.unitId) ? (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-wt"><TriangleAlert size={12} aria-hidden />예정된 예약 있음</span>
    ) : (
      <span className="text-[12px] text-t3">없음</span>
    ),
    action: showComplete && canWrite ? <CompleteButton businessId={businessId} jobId={j.id} onChanged={onChanged} /> : null,
  });

  return (
    <TableOrCards
      rows={jobs}
      keyOf={(j) => j.id}
      table={
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className={`${TABLE} min-w-[860px]`}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>품목</th>
                <th className={TH}>접수일</th>
                <th className={TH}>상태</th>
                <th className={TH}>예상 완료</th>
                <th className={`${TH} text-right`}>비용</th>
                {showComplete && <th className={TH}>다음 예약 영향</th>}
                {showComplete && canWrite && <th className={TH}>동작</th>}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const v = rowView(j);
                return (
                  <tr key={j.id} className={`${TR} h-[52px]`}>
                    <td className={TD}>
                      <CellName max={240}>{v.name}</CellName>
                      <div className="text-[11.5px] text-t3">{v.kind}</div>
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.openedAt}</td>
                    <td className={TD}>{v.badge}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.closedAt}</td>
                    <td className={`${TD} text-right tabular-nums text-t`}>{v.cost}</td>
                    {showComplete && <td className={TD}>{v.impact}</td>}
                    {showComplete && canWrite && <td className={TD}>{v.action}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }
      card={(j) => {
        const v = rowView(j);
        return (
          <MobileCard
            title={v.name}
            sub={<span className="rounded-[5px] bg-sf2 px-1.5 py-px text-[11px] text-t2">{v.kind}</span>}
            badge={v.badge}
            fields={[
              ["접수일", v.openedAt],
              ["예상 완료", v.closedAt],
              ["비용", v.cost],
              ...(showComplete ? ([["다음 예약 영향", v.impact]] as [string, React.ReactNode][]) : []),
            ]}
            actions={v.action}
          />
        );
      }}
    />
  );
}

function CompleteButton({ businessId, jobId, onChanged }: { businessId: string; jobId: string; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [cost, setCost] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>완료 처리</Button>
    );
  }

  const submit = async () => {
    setBusy(true); setError(null);
    const r = await completeCareJob(businessId, jobId, { cost: parseKRW(cost) });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onChanged();
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="비용(원)"
          aria-label="비용(원)"
          inputMode="numeric"
          className={`${CONTROL_SM} w-[96px]`}
        />
        <Button size="sm" onClick={submit} loading={busy}>확인</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>취소</Button>
      </div>
      {error && <span role="alert" className="text-[11.5px] text-et">{error}</span>}
    </div>
  );
}

function NewCareJobModal({
  businessId,
  units,
  open,
  preselectUnit,
  onClose,
  onCreated,
}: {
  businessId: string;
  units: UnitPickerRow[];
  open: boolean;
  preselectUnit?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [unitId, setUnitId] = React.useState(preselectUnit ?? "");
  const [kind, setKind] = React.useState<"wash" | "repair" | "inspect">("wash");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // CLICK-PATH-212: 열릴 때마다 draft를 초기화한다(취소 후 다시 열면 이전 입력이 남지 않게) —
  // EventFormModal.tsx의 open 변화 초기화와 같은 패턴.
  React.useEffect(() => {
    if (open) {
      setUnitId(preselectUnit ?? "");
      setKind("wash");
      setNotes("");
      setError(null);
    }
  }, [open, preselectUnit]);

  const submit = async () => {
    if (!unitId) { setError("개체를 선택하세요."); return; }
    setBusy(true); setError(null);
    const r = await createCareJob(businessId, unitId, { kind, notes: notes || undefined });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setUnitId(""); setNotes("");
    onCreated();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="세탁·수선 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>{busy ? "저장 중…" : "등록"}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {error && <Alert className="mb-3">{error}</Alert>}
        <SelectField label="개체" required value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">선택</option>
          {units.map((u) => (
            <option key={u.unitId} value={u.unitId}>{u.productName} · {u.color}/{u.size} · {u.unitCode} ({u.status})</option>
          ))}
        </SelectField>
        <SelectField label="종류" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="wash">세탁</option>
          <option value="repair">수선</option>
          <option value="inspect">검수</option>
        </SelectField>
        <Input label="메모" value={notes} onChange={(e) => setNotes(e.target.value)} wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}
