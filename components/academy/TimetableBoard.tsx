"use client";

/**
 * 회차 시간표. "이 회차만"과 "이후 전체"는 절대 같은 버튼/폼으로 섞지 않는다(명세 §3-3, §3-6).
 * 캘린더 드래그(다른 에이전트 소유)도 항상 "이 회차만"으로 취급하는 것과 같은 원칙이다.
 *
 * 레퍼런스: Square 캘린더 "list" 뷰 — 날짜별로 묶은 회차 목록(PC 5열 표 / 휴대폰 카드).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Repeat, Pencil, ClipboardCheck } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { SelectField, StatusTab, FilterRow, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { AcadClass, AcadSession } from "@/lib/domain/academy";
import { updateSessionOnce, updateScheduleFrom } from "@/lib/domain/academy-actions";
import { formatInTz, localDateTimeToUtcIso, todayKeyInTz, DEFAULT_TZ } from "@/lib/utils/datetime";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const SESSION_STATUS_KIND: Record<string, BadgeKind> = { 예정: "info", 완료: "success", 휴강: "error" };

export function TimetableBoard({ businessId, canWrite, classes, sessions }: { businessId: string; canWrite: boolean; classes: AcadClass[]; sessions: AcadSession[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [classFilter, setClassFilter] = React.useState<string>("all");
  const [editSession, setEditSession] = React.useState<AcadSession | null>(null);
  const [onceForm, setOnceForm] = React.useState({ date: "", time: "", status: "예정" });
  const [wholeOpen, setWholeOpen] = React.useState(false);
  const [wholeForm, setWholeForm] = React.useState({ classId: "", fromDate: "", weekday: "1", start: "16:00", end: "17:00" });

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const todayKey = todayKeyInTz(DEFAULT_TZ);
  const visible = classFilter === "all" ? sessions : sessions.filter((s) => s.classId === classFilter);
  const groups = React.useMemo(() => {
    const m = new Map<string, AcadSession[]>();
    for (const s of visible) m.set(s.sessionDate, [...(m.get(s.sessionDate) ?? []), s]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const dateLabel = (key: string) => {
    const [y, mo, d] = key.split("-").map(Number);
    const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    return `${mo}월 ${d}일 (${WEEKDAY_KO[wd]})${key === todayKey ? " · 오늘" : ""}`;
  };

  const openOnce = (s: AcadSession) => {
    setEditSession(s);
    setOnceForm({ date: s.sessionDate, time: formatInTz(s.startAt, DEFAULT_TZ, "HH:mm"), status: s.status });
    setError(null);
  };

  const saveOnce = async () => {
    const s = editSession;
    if (!s) return;
    // CLICK-PATH-201: 표시(tz 벽시계)와 파싱(tz 벽시계)을 같은 기준으로 맞춘다 —
    // new Date(`...`)의 브라우저 로컬 파싱을 쓰면 KST 표시값이 다시 로컬로 잘못 해석돼 9시간씩 밀린다.
    const origTime = formatInTz(s.startAt, DEFAULT_TZ, "HH:mm");
    const timeChanged = onceForm.date !== s.sessionDate || onceForm.time !== origTime;
    let startIso: string | undefined;
    let endIso: string | undefined;
    if (timeChanged) {
      // 결함 #3: 종료시각 입력을 따로 두지 않고 원래 소요시간을 유지해 함께 옮긴다.
      const durationMs = new Date(s.endAt).getTime() - new Date(s.startAt).getTime();
      startIso = localDateTimeToUtcIso(onceForm.date, onceForm.time, DEFAULT_TZ);
      endIso = new Date(new Date(startIso).getTime() + durationMs).toISOString();
    }
    setBusy(true); setError(null);
    try {
      // CLICK-PATH-224: 시간을 안 바꿨으면 startIso/endIso를 아예 안 보내 overridden이 무조건 켜지는 걸 막는다.
      const r = await updateSessionOnce(businessId, { sessionId: s.id, startIso, endIso, status: onceForm.status !== s.status ? onceForm.status : undefined });
      if (!r.ok) { setError(r.message); return; }
      setEditSession(null);
      router.refresh();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(false); }
  };

  const applyWhole = async () => {
    if (!wholeForm.classId || !wholeForm.fromDate) { setError("대상 반과 적용 시작일을 입력하세요."); return; }
    if (!window.confirm("미래 예정 회차를 삭제 후 새 시간으로 재생성합니다. 되돌릴 수 없습니다. 계속할까요?")) return;
    // 결함 #2 수정: 실제 서버 응답(removed)을 그대로 쓴다.
    setBusy(true); setError(null);
    try {
      const r = await updateScheduleFrom(businessId, { classId: wholeForm.classId, fromDate: wholeForm.fromDate, weekday: Number(wholeForm.weekday), startTime: wholeForm.start, endTime: wholeForm.end });
      if (!r.ok) { setError(r.message); return; }
      setWholeOpen(false);
      setNotice(`${className(wholeForm.classId)}: 예정 회차 ${r.data.removed}건을 제거하고 새 시간으로 재생성했습니다. 이미 지난 회차와 개별 수정된 회차는 그대로입니다.`);
      router.refresh();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(false); }
  };

  const rowActions = (s: AcadSession) => (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {s.status !== "휴강" && (
        <Link href={`/w/${businessId}/attendance?sessionId=${s.id}`} className="inline-flex h-[32px] items-center gap-1 whitespace-nowrap rounded-[var(--r-md)] px-3 text-[13px] font-medium text-t2 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:min-h-[44px]">
          <ClipboardCheck size={13} aria-hidden />출결
        </Link>
      )}
      {canWrite && s.status === "예정" && (
        <Button variant="secondary" size="sm" onClick={() => openOnce(s)}><Pencil size={13} aria-hidden />이 회차만</Button>
      )}
    </span>
  );

  return (
    <>
      <PageHeader
        title="시간표"
        description="오늘 이후 회차. '이 회차만'은 그 회차 하나, '이후 전체 변경'은 매주 반복 시간표 자체를 바꿉니다."
        actions={canWrite && classes.length > 0 ? <Button variant="secondary" onClick={() => { setWholeForm({ classId: classes[0].id, fromDate: "", weekday: "1", start: "16:00", end: "17:00" }); setWholeOpen(true); }}><Repeat size={14} aria-hidden />이후 전체 변경</Button> : undefined}
      >
        {classes.length > 1 && (
          <FilterRow>
            <StatusTab active={classFilter === "all"} onClick={() => setClassFilter("all")} count={sessions.length}>전체 반</StatusTab>
            {classes.map((c) => <StatusTab key={c.id} active={classFilter === c.id} onClick={() => setClassFilter(c.id)} count={sessions.filter((s) => s.classId === c.id).length}>{c.name}</StatusTab>)}
          </FilterRow>
        )}
      </PageHeader>

      {error && !editSession && !wholeOpen && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}

      {groups.length === 0 ? (
        <Card><EmptyState title="생성된 회차가 없습니다." description="반·수강등록에서 반을 개설하거나 '회차 생성'을 누르면 여기에 표시됩니다." /></Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, list]) => (
            <Card key={date} className="p-4 sm:p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className={`text-[var(--fs-card)] font-semibold ${date === todayKey ? "text-[var(--accent-ink)]" : "text-t"}`}>{dateLabel(date)}</h2>
                <span className="text-[12px] tabular-nums text-t3">{list.length}회차</span>
              </div>
              <TableOrCards
                rows={list}
                keyOf={(s) => s.id}
                table={
                  <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                    <table className={`${TABLE} min-w-[600px]`}>
                      <thead>
                        <tr className={THEAD}>
                          <th className={`${TH} w-[120px]`}>시간</th>
                          <th className={TH}>반</th>
                          <th className={TH}>구분</th>
                          <th className={TH}>상태</th>
                          <th className={`${TH} text-right`}>동작</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((s) => (
                          <tr key={s.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                            <td className={`${TD} whitespace-nowrap tabular-nums text-t`}>{formatInTz(s.startAt, DEFAULT_TZ, "HH:mm")}<span className="text-t3">–{formatInTz(s.endAt, DEFAULT_TZ, "HH:mm")}</span></td>
                            <td className={`${TD} font-medium text-t`}>{className(s.classId)}</td>
                            <td className={TD}>
                              <span className="inline-flex flex-wrap items-center gap-1">
                                {s.sessionKind !== "정규" ? <Badge kind="warning">{s.sessionKind}</Badge> : <span className="text-[12.5px] text-t3">정규</span>}
                                {s.overridden && <Badge kind="info">개별 수정</Badge>}
                              </span>
                            </td>
                            <td className={TD}><Badge kind={SESSION_STATUS_KIND[s.status] ?? "info"}>{s.status}</Badge></td>
                            <td className={`${TD} text-right`}>{rowActions(s)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
                card={(s) => (
                  <MobileCard
                    title={className(s.classId)}
                    sub={<><span className="tabular-nums">{formatInTz(s.startAt, DEFAULT_TZ, "HH:mm")}–{formatInTz(s.endAt, DEFAULT_TZ, "HH:mm")}</span>{s.sessionKind !== "정규" && <Badge kind="warning">{s.sessionKind}</Badge>}{s.overridden && <Badge kind="info">개별 수정</Badge>}</>}
                    badge={<Badge kind={SESSION_STATUS_KIND[s.status] ?? "info"}>{s.status}</Badge>}
                    actions={rowActions(s)}
                  />
                )}
              />
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!editSession}
        onClose={() => setEditSession(null)}
        title="이 회차만 변경"
        footer={<><Button variant="secondary" onClick={() => setEditSession(null)} disabled={busy}>취소</Button><Button onClick={saveOnce} loading={busy}>이 회차만 저장</Button></>}
      >
        {editSession && (
          <form onSubmit={(e) => { e.preventDefault(); saveOnce(); }} className="flex flex-col">
            <p className="mb-4 text-[12.5px] leading-relaxed text-t2">{className(editSession.classId)} · {dateLabel(editSession.sessionDate)} {formatInTz(editSession.startAt, DEFAULT_TZ, "HH:mm")} 회차만 바꿉니다. 종료 시각은 원래 소요시간대로 함께 이동합니다.</p>
            {error && <Alert className="mb-4">{error}</Alert>}
            <div className="grid grid-cols-2 gap-x-3">
              <Input label="날짜" type="date" value={onceForm.date} onChange={(e) => setOnceForm((f) => ({ ...f, date: e.target.value }))} autoFocus />
              <Input label="시작 시각" type="time" value={onceForm.time} onChange={(e) => setOnceForm((f) => ({ ...f, time: e.target.value }))} />
            </div>
            <SelectField label="상태" value={onceForm.status} onChange={(e) => setOnceForm((f) => ({ ...f, status: e.target.value }))} wrapperClassName="mb-0" hint="휴강으로 바꾸면 홈 '보강·휴강'에 표시됩니다.">
              {["예정", "완료", "휴강"].map((v) => <option key={v} value={v}>{v}</option>)}
            </SelectField>
          </form>
        )}
      </Modal>

      <Modal
        open={wholeOpen}
        onClose={() => setWholeOpen(false)}
        title="이후 전체 변경"
        footer={<><Button variant="secondary" onClick={() => setWholeOpen(false)} disabled={busy}>취소</Button><Button variant="danger" onClick={applyWhole} loading={busy}>이후 전체 적용</Button></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); applyWhole(); }} className="flex flex-col">
          <Alert kind="warning" className="mb-4">지정한 날짜부터 매주 반복되는 시간표 자체를 바꿉니다. 이미 지난 회차와 개별 수정("이 회차만")된 미래 회차는 그대로 유지되고, 나머지 예정 회차만 삭제 후 새 시간으로 재생성됩니다.</Alert>
          {error && <Alert className="mb-4">{error}</Alert>}
          <SelectField label="대상 반" required value={wholeForm.classId} onChange={(e) => setWholeForm((f) => ({ ...f, classId: e.target.value }))} autoFocus>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-x-3">
            <Input label="적용 시작일" type="date" required min={todayKey} value={wholeForm.fromDate} onChange={(e) => setWholeForm((f) => ({ ...f, fromDate: e.target.value }))} />
            <SelectField label="새 요일" value={wholeForm.weekday} onChange={(e) => setWholeForm((f) => ({ ...f, weekday: e.target.value }))}>
              {WEEKDAY_KO.map((w, i) => <option key={i} value={i}>{w}요일</option>)}
            </SelectField>
            <Input label="시작" type="time" value={wholeForm.start} onChange={(e) => setWholeForm((f) => ({ ...f, start: e.target.value }))} wrapperClassName="mb-0" />
            <Input label="종료" type="time" value={wholeForm.end} onChange={(e) => setWholeForm((f) => ({ ...f, end: e.target.value }))} wrapperClassName="mb-0" />
          </div>
        </form>
      </Modal>
    </>
  );
}
