"use client";

/**
 * 반·수강등록 — 4열 표(반 / 정원 / 월 수강료 / 동작). 반 개설·강의실 추가·수강등록은 모달.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, Repeat, School } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CellName } from "@/components/ui/ResponsiveTable";
import { SelectField, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { AcadClass, AcadClassroom, AcadStudent } from "@/lib/domain/academy";
import { createClassroom, createClass, enrollStudent, generateSessions } from "@/lib/domain/academy-actions";
import { formatKRW } from "@/lib/domain/money";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function ClassesBoard({ businessId, canWrite, classrooms, classes, students, teachers }: {
  businessId: string; canWrite: boolean; classrooms: AcadClassroom[]; classes: AcadClass[]; students: AcadStudent[]; teachers: { membershipId: string; userId: string }[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [roomOpen, setRoomOpen] = React.useState(false);
  const [classOpen, setClassOpen] = React.useState(false);
  const [enrollFor, setEnrollFor] = React.useState<AcadClass | null>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      return false;
    } finally { setBusy(null); }
  };

  const roomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name;
  const totalEnrolled = classes.reduce((s, c) => s + (c.enrolledCount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="반·수강등록"
        description="반을 개설하면 향후 8주 회차가 자동 생성됩니다. 수강 등록은 반 단위로 합니다."
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" onClick={() => setRoomOpen(true)}><School size={14} aria-hidden />강의실 추가</Button>
              <Button onClick={() => setClassOpen(true)}><Plus size={15} aria-hidden />반 개설</Button>
            </>
          ) : undefined
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert kind="success" className="mb-4">{notice}</Alert>}

      <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-3.5">
        {[
          ["운영 중인 반", `${classes.filter((c) => c.active).length}개`],
          ["수강 등록", `${totalEnrolled}명`],
          ["강의실", `${classrooms.length}실`],
        ].map(([l, v]) => (
          <Card key={l} className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-t2">{l}</p>
            <p className="mt-1.5 truncate text-[22px] font-bold leading-none tabular-nums text-t">{v}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4 p-4 sm:p-5">
        <CardHead title="반 목록" description={`${classes.length}개`} />
        {classes.length === 0 ? (
          <EmptyState title="개설된 반이 없습니다." description="반을 개설하면 시간표 회차가 생기고 학생을 수강 등록할 수 있습니다." action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setClassOpen(true)}>반 개설</Button> : undefined} />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className={`${TABLE} min-w-[640px]`}>
              <thead>
                <tr className={THEAD}>
                  <th className={TH}>반</th>
                  <th className={TH}>정원</th>
                  <th className={`${TH} text-right`}>월 수강료</th>
                  {canWrite && <th className={`${TH} text-right`}>동작</th>}
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => {
                  const n = c.enrolledCount ?? 0;
                  const pct = c.capacity > 0 ? Math.min(100, Math.round((n / c.capacity) * 100)) : 0;
                  const full = c.capacity > 0 && n >= c.capacity;
                  return (
                    <tr key={c.id} className={`${TR} h-[56px] hover:bg-sf2`}>
                      <td className={TD}>
                        <CellName max={240}>{c.name}</CellName>
                        <span className="block truncate text-[11.5px] text-t3">{[c.subject, roomName(c.defaultClassroomId), `시작 ${c.startDate}`].filter(Boolean).join(" · ")}{!c.active && " · 종료"}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-[72px] shrink-0 overflow-hidden rounded-full bg-sf2"><span className={`block h-full rounded-full ${full ? "bg-[var(--et)]" : "bg-[var(--accent-strong)]"}`} style={{ width: `${pct}%` }} /></span>
                          <span className={`tabular-nums ${full ? "font-medium text-et" : "text-t2"}`}>{n}/{c.capacity}</span>
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{formatKRW(c.tuitionAmount)}</td>
                      {canWrite && (
                        <td className={`${TD} text-right`}>
                          <span className="inline-flex flex-wrap items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" loading={busy === c.id} onClick={async () => { setNotice(null); const ok = await run(c.id, () => generateSessions(businessId, c.id)); if (ok) setNotice(`${c.name}: 이후 8주 회차를 추가 생성했습니다.`); }}><Repeat size={13} aria-hidden />회차 생성</Button>
                            <Button variant="secondary" size="sm" disabled={full} title={full ? "정원이 찼습니다." : undefined} onClick={() => setEnrollFor(c)}><UserPlus size={13} aria-hidden />수강등록</Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHead title="강의실" description="반 개설 때 기본 강의실로 고를 수 있습니다." />
        {classrooms.length === 0 ? (
          <p className="text-[12.5px] text-t3">등록된 강의실이 없습니다. 강의실 없이도 반은 개설할 수 있습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {classrooms.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-sf2 px-2.5 py-1.5 text-[12.5px] text-t">
                <School size={13} className="text-t3" aria-hidden />{c.name}<span className="tabular-nums text-t3">정원 {c.capacity}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RoomModal businessId={businessId} open={roomOpen} onClose={() => setRoomOpen(false)} onCreated={() => { setRoomOpen(false); router.refresh(); }} />
      <ClassModal businessId={businessId} open={classOpen} onClose={() => setClassOpen(false)} onCreated={() => { setClassOpen(false); router.refresh(); }} classrooms={classrooms} teachers={teachers} />
      <EnrollModal businessId={businessId} cls={enrollFor} students={students} onClose={() => setEnrollFor(null)} onDone={() => { setEnrollFor(null); router.refresh(); }} />
    </>
  );
}

function RoomModal({ businessId, open, onClose, onCreated }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = React.useState({ name: "", capacity: "10" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setForm({ name: "", capacity: "10" }); setError(null); } }, [open]);
  const submit = async () => {
    if (!form.name.trim()) { setError("강의실명을 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await createClassroom(businessId, { name: form.name.trim(), capacity: Number(form.capacity) || 1 });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="강의실 추가" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>추가</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Input label="강의실명" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="예: A강의실" />
        <Input label="정원" type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}

function ClassModal({ businessId, open, onClose, onCreated, classrooms, teachers }: { businessId: string; open: boolean; onClose: () => void; onCreated: () => void; classrooms: AcadClassroom[]; teachers: { membershipId: string; userId: string }[] }) {
  const initial = () => ({ name: "", teacherId: "", classroomId: "", capacity: "10", tuition: "", startDate: new Date().toISOString().slice(0, 10), weekday: "1", start: "16:00", end: "17:00" });
  const [form, setForm] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setForm(initial()); setError(null); } }, [open]);

  const submit = async () => {
    if (!form.name.trim() || !form.teacherId) { setError("반 이름과 담당 강사를 입력하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await createClass(businessId, {
        name: form.name.trim(), teacherId: form.teacherId, classroomId: form.classroomId || undefined,
        capacity: Number(form.capacity) || 1, tuitionAmount: Number(form.tuition) || 0, startDate: form.startDate,
        weekday: Number(form.weekday), startTime: form.start, endTime: form.end,
      });
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="반 개설" className="sm:max-w-[560px]" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>개설</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && <Alert className="mb-4">{error}</Alert>}
        <Input label="반 이름" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus placeholder="예: 중등 수학 심화반 (월수금)" />
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <SelectField label="담당 강사" required value={form.teacherId} onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))} hint="직원·권한 화면의 소속(user_id)">
            <option value="">선택</option>
            {teachers.map((t) => <option key={t.membershipId} value={t.membershipId}>{t.userId.slice(0, 8)}…</option>)}
          </SelectField>
          <SelectField label="강의실 (선택)" value={form.classroomId} onChange={(e) => setForm((f) => ({ ...f, classroomId: e.target.value }))}>
            <option value="">없음</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <Input label="정원" type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
          <Input label="월 수강료(원)" inputMode="numeric" value={form.tuition} onChange={(e) => setForm((f) => ({ ...f, tuition: e.target.value }))} placeholder="0" />
        </div>
        <p className="mb-2 text-[13px] font-medium text-t">매주 수업 시간</p>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          <Input label="시작일" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <SelectField label="요일" value={form.weekday} onChange={(e) => setForm((f) => ({ ...f, weekday: e.target.value }))}>
            {WEEKDAY_KO.map((w, i) => <option key={i} value={i}>{w}요일</option>)}
          </SelectField>
          <Input label="시작" type="time" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} wrapperClassName="mb-0" />
          <Input label="종료" type="time" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} wrapperClassName="mb-0" />
        </div>
        <p className="mt-3 text-[12px] leading-snug text-t3">개설하면 시작일부터 8주치 회차가 시간표에 자동 생성됩니다.</p>
      </form>
    </Modal>
  );
}

function EnrollModal({ businessId, cls, students, onClose, onDone }: { businessId: string; cls: AcadClass | null; students: AcadStudent[]; onClose: () => void; onDone: () => void }) {
  const [studentId, setStudentId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (cls) { setStudentId(""); setError(null); } }, [cls]);
  const submit = async () => {
    if (!cls) return;
    if (!studentId) { setError("학생을 선택하세요."); return; }
    setBusy(true); setError(null);
    try {
      const r = await enrollStudent(businessId, cls.id, studentId);
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      onDone();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!cls} onClose={onClose} title={cls ? `${cls.name} 수강등록` : "수강등록"} footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button onClick={submit} loading={busy}>등록</Button></>}>
      {cls && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
          {error && <Alert className="mb-4">{error}</Alert>}
          <p className="mb-4 text-[12.5px] text-t2">정원 {cls.enrolledCount ?? 0}/{cls.capacity} · 월 {formatKRW(cls.tuitionAmount)}</p>
          <SelectField label="학생" required value={studentId} onChange={(e) => setStudentId(e.target.value)} autoFocus wrapperClassName="mb-0">
            <option value="">선택</option>
            {students.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ""}</option>)}
          </SelectField>
        </form>
      )}
    </Modal>
  );
}
