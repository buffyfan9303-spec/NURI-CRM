"use client";

/**
 * 근무표(예약 가능시간) 편집 — staff.manage.
 * ★ 아래 AttendanceBoard(출퇴근, 사실)와는 완전히 다른 데이터/화면 섹션이다(계획 vs 사실 분리).
 *
 * 레퍼런스: Square Appointments 의 직원별 근무시간(Side-by-side) — 직원 한 줄에 요일 칩을 나열한다.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, CalendarRange, CalendarClock } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { SalonStaffProfile, SalonSchedule, SalonTimeOff } from "@/lib/domain/salon";
import { upsertStaffProfile, addSchedule, addTimeOff } from "@/lib/domain/salon-actions";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const OFF_TYPES = ["휴무", "휴게", "연차", "기타"];

export function ScheduleEditor({
  businessId, canManage, memberships, profiles, schedules, timeOff,
}: {
  businessId: string;
  canManage: boolean;
  memberships: { id: string; userId: string }[];
  profiles: SalonStaffProfile[];
  schedules: SalonSchedule[];
  timeOff: SalonTimeOff[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState({ membershipId: "", displayName: "" });
  const [schedOpen, setSchedOpen] = React.useState(false);
  const [offOpen, setOffOpen] = React.useState(false);
  const [schedForm, setSchedForm] = React.useState({ staffId: "", weekday: "1", start: "10:00", end: "19:00" });
  const [offForm, setOffForm] = React.useState({ staffId: "", start: "", end: "", type: "휴무" });

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return false; }
      router.refresh();
      return true;
    } catch {
      // QA2-S02: 서버 액션이 throw하면 예외가 조용히 빠져나가 모달이 무반응처럼 보였다.
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      return false;
    } finally { setBusy(false); }
  };

  const nameOf = (id: string) => profiles.find((p) => p.membershipId === id)?.displayName ?? id.slice(0, 8);

  const weeklyCard = (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="요일별 근무 가능시간"
        description="예약을 받을 수 있는 시간. 예약 확정 시 서버가 이 범위를 확인합니다."
        action={canManage ? <Button size="sm" variant="secondary" onClick={() => { setSchedForm({ staffId: profiles[0]?.membershipId ?? "", weekday: "1", start: "10:00", end: "19:00" }); setSchedOpen(true); }}><Plus size={14} aria-hidden />근무시간 추가</Button> : undefined}
      />
      <WeeklyGrid profiles={profiles} schedules={schedules} />
    </Card>
  );

  const timeOffCard = (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="휴무·휴게"
        description="이 시간에는 예약이 잡히지 않습니다."
        action={canManage ? <Button size="sm" variant="secondary" onClick={() => { setOffForm({ staffId: profiles[0]?.membershipId ?? "", start: "", end: "", type: "휴무" }); setOffOpen(true); }}><Plus size={14} aria-hidden />휴무 추가</Button> : undefined}
      />
      {timeOff.length === 0 ? (
        <EmptyState title="등록된 휴무·휴게가 없습니다." />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className={`${TABLE} min-w-[520px]`}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>직원</th>
                <th className={TH}>구분</th>
                <th className={TH}>시작</th>
                <th className={TH}>종료</th>
              </tr>
            </thead>
            <tbody>
              {timeOff.map((t) => (
                <tr key={t.id} className={`${TR} h-[44px]`}>
                  <td className={`${TD} font-medium text-t`}>{nameOf(t.staffId)}</td>
                  <td className={`${TD} text-t2`}>{t.offType}</td>
                  {/* ponytail: toLocaleString("ko-KR") → formatInTz(ICU 오전/오후 표기 차이로 인한 hydration 오류 방지). */}
                  <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{formatInTz(t.startAt, DEFAULT_TZ, "M. d. (EEE) HH:mm")}</td>
                  <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{formatInTz(t.endAt, DEFAULT_TZ, "M. d. (EEE) HH:mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        {profiles.length === 0 ? (
          <Card><EmptyState title="등록된 근무표가 없습니다." description="근무표 편집은 직원·권한 관리 권한이 있는 관리자만 가능합니다." /></Card>
        ) : (
          <>
            {weeklyCard}
            {timeOffCard}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}

      <Card className="p-4 sm:p-5">
        <CardHead title="직원 프로필" description="예약 담당자로 표시될 이름. 직원·권한 화면의 소속과 연결됩니다." />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!profileForm.membershipId || !profileForm.displayName) return;
            const ok = await run(() => upsertStaffProfile(businessId, profileForm.membershipId, { displayName: profileForm.displayName, specialties: [] }));
            if (ok) setProfileForm({ membershipId: "", displayName: "" });
          }}
          className="grid grid-cols-1 items-end gap-x-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <SelectField label="소속(직원·권한의 user_id)" value={profileForm.membershipId} onChange={(e) => setProfileForm((f) => ({ ...f, membershipId: e.target.value }))}>
            <option value="">선택</option>
            {memberships.map((m) => <option key={m.id} value={m.id}>{m.userId.slice(0, 8)}…</option>)}
          </SelectField>
          <Input label="표시 이름" required value={profileForm.displayName} onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="예: 원장 김미영" />
          <Button type="submit" variant="secondary" loading={busy} className="mb-4"><Plus size={14} aria-hidden />프로필 저장</Button>
        </form>
        {profiles.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {profiles.map((p) => <li key={p.membershipId} className="rounded-[var(--r-sm)] bg-sf2 px-2.5 py-1 text-[12px] font-medium text-t2">{p.displayName}</li>)}
          </ul>
        )}
      </Card>

      {weeklyCard}
      {timeOffCard}

      <Modal
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        title="근무시간 추가"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchedOpen(false)} disabled={busy}>취소</Button>
            <Button loading={busy} onClick={async () => { if (!schedForm.staffId) return; const ok = await run(() => addSchedule(businessId, { staffId: schedForm.staffId, weekday: Number(schedForm.weekday), startTime: schedForm.start, endTime: schedForm.end })); if (ok) setSchedOpen(false); }}>추가</Button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col">
          <SelectField label="담당 직원" required value={schedForm.staffId} onChange={(e) => setSchedForm((f) => ({ ...f, staffId: e.target.value }))} autoFocus>
            <option value="">선택</option>
            {profiles.map((p) => <option key={p.membershipId} value={p.membershipId}>{p.displayName}</option>)}
          </SelectField>
          <SelectField label="요일" value={schedForm.weekday} onChange={(e) => setSchedForm((f) => ({ ...f, weekday: e.target.value }))}>
            {WEEKDAY_KO.map((w, i) => <option key={i} value={i}>{w}요일</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-x-3">
            <Input label="시작" type="time" value={schedForm.start} onChange={(e) => setSchedForm((f) => ({ ...f, start: e.target.value }))} wrapperClassName="mb-0" />
            <Input label="종료" type="time" value={schedForm.end} onChange={(e) => setSchedForm((f) => ({ ...f, end: e.target.value }))} wrapperClassName="mb-0" />
          </div>
        </form>
      </Modal>

      <Modal
        open={offOpen}
        onClose={() => setOffOpen(false)}
        title="휴무·휴게 추가"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOffOpen(false)} disabled={busy}>취소</Button>
            <Button loading={busy} onClick={async () => { if (!offForm.staffId || !offForm.start || !offForm.end) { setError("직원·시작·종료를 입력하세요."); return; } const ok = await run(() => addTimeOff(businessId, { staffId: offForm.staffId, startAt: new Date(offForm.start).toISOString(), endAt: new Date(offForm.end).toISOString(), offType: offForm.type })); if (ok) setOffOpen(false); }}>추가</Button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col">
          <SelectField label="담당 직원" required value={offForm.staffId} onChange={(e) => setOffForm((f) => ({ ...f, staffId: e.target.value }))} autoFocus>
            <option value="">선택</option>
            {profiles.map((p) => <option key={p.membershipId} value={p.membershipId}>{p.displayName}</option>)}
          </SelectField>
          <SelectField label="구분" value={offForm.type} onChange={(e) => setOffForm((f) => ({ ...f, type: e.target.value }))}>
            {OFF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectField>
          <Input label="시작" type="datetime-local" required value={offForm.start} onChange={(e) => setOffForm((f) => ({ ...f, start: e.target.value }))} />
          <Input label="종료" type="datetime-local" required value={offForm.end} onChange={(e) => setOffForm((f) => ({ ...f, end: e.target.value }))} wrapperClassName="mb-0" />
        </form>
      </Modal>
    </div>
  );
}

/** 직원 한 줄 = 요일 7칸. 근무시간이 있는 칸만 채운다(빈 칸은 점선). */
function WeeklyGrid({ profiles, schedules }: { profiles: SalonStaffProfile[]; schedules: SalonSchedule[] }) {
  if (profiles.length === 0 || schedules.length === 0) {
    return <EmptyState title="등록된 근무시간이 없습니다." description="직원별로 요일과 시간을 추가하면 그 시간에만 예약을 받습니다." />;
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className={`${TABLE} min-w-[720px] table-fixed`}>
        <colgroup>
          <col className="w-[132px]" />
          {order.map((d) => <col key={d} />)}
        </colgroup>
        <thead>
          <tr className={THEAD}>
            <th className={TH}>직원</th>
            {order.map((d) => <th key={d} className={`${TH} text-center`}>{WEEKDAY_KO[d]}</th>)}
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const mine = schedules.filter((s) => s.staffId === p.membershipId);
            return (
              <tr key={p.membershipId} className={`${TR} h-[52px]`}>
                <td className={`${TD} font-medium text-t`}><span className="flex items-center gap-1.5"><CalendarRange size={14} className="shrink-0 text-t3" aria-hidden /><span className="truncate">{p.displayName}</span></span></td>
                {order.map((d) => {
                  const slots = mine.filter((s) => s.weekday === d);
                  return (
                    <td key={d} className={`${TD} px-1.5 text-center`}>
                      {slots.length === 0 ? (
                        <span className="block h-[28px] rounded-[var(--r-sm)] border border-dashed border-[var(--bd)]" aria-label="근무 없음" />
                      ) : (
                        <span className="flex flex-col gap-1">
                          {slots.map((s) => (
                            <span key={s.id} className="flex items-center justify-center gap-1 rounded-[var(--r-sm)] bg-[var(--accent-soft)] px-1.5 py-1 text-[11.5px] font-medium tabular-nums text-[var(--accent-ink)]">
                              <CalendarClock size={11} aria-hidden />{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
