"use client";

/**
 * 예약 목록 + 예약 생성(모달) + 수납(모달).
 * calendar/reservations 화면은 다른 에이전트 소유라 손댈 수 없어, 예약·수납의 실제 동작 경로를
 * 이 페이지(services)에 둔다. 확정은 항상 서버 RPC(salon_book)가 최종 판정한다 — 여기서 계산한
 * "충돌 시 다음 가능 시간"은 힌트일 뿐이다.
 *
 * 레퍼런스: Fresha 예약 생성 순서(고객 → 서비스 → 담당자/시간)를 폼 순서로, Square 캘린더의
 * "list" 뷰를 모바일 카드로 채택. PC 6열 표, 휴대폰 카드(5열 이상 규칙).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Banknote, History, MailCheck, CircleAlert } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { SelectField, StatusTab, FilterRow, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { SalonService, SalonStaffProfile, SalonResource, SalonAppointment } from "@/lib/domain/salon";
import { bookAppointment, updateAppointmentStatus, createTreatmentHistory } from "@/lib/domain/salon-actions";
import { formatInTz, localDateTimeToUtcIso, addDaysToKey, todayKeyInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import { salonReminderNotice } from "@/lib/domain/messages";
import { MessageActions } from "@/components/common/MessageActions";
import { PayModal, type PayTarget } from "./PayModal";

interface CustomerOption { id: string; name: string; phone?: string | null }

export const SALON_STATUS_KIND: Record<string, BadgeKind> = {
  완료: "success", 예약: "info", 확정: "success", 대기: "info", 진행중: "warning", 취소: "error", 노쇼: "error",
};
const TERMINAL = new Set(["완료", "취소", "노쇼"]);

export function BookingBoard({
  businessId, canWrite, canRecordPayment, canRevenue, services, staff, resources, customers, appointments, noShowByCustomer = {}, businessName, todayOnly,
}: {
  businessId: string;
  canWrite: boolean;
  canRecordPayment: boolean;
  /** revenue.read 없으면 금액 열과 리마인더 문구의 예상 금액 문장을 뺀다. */
  canRevenue: boolean;
  services: SalonService[];
  staff: SalonStaffProfile[];
  resources: SalonResource[];
  customers: CustomerOption[];
  appointments: SalonAppointment[];
  /** S4: 고객별 노쇼 횟수(customerId → count, 0건 고객은 안 들어있음). */
  noShowByCustomer?: Record<string, number>;
  businessName: string;
  /** ?date=today 로 들어왔는지(홈 "오늘 예약" 지표 경로). */
  todayOnly: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  // 고객 상세("예약 등록")에서 넘어오면 그 고객을 미리 선택하고 폼을 바로 연다(?customerId=, 결함 D7과 같은 패턴).
  const prefillCustomerId = searchParams.get("customerId") ?? "";
  const prefillValid = !!prefillCustomerId && customers.some((c) => c.id === prefillCustomerId);
  const [bookOpen, setBookOpen] = React.useState(prefillValid && canWrite);
  const [payTarget, setPayTarget] = React.useState<PayTarget | null>(null);
  const [reminderFor, setReminderFor] = React.useState<SalonAppointment | null>(null);

  const run = async (id: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(id); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.message ?? "처리하지 못했습니다."); return; }
      router.refresh();
    } catch {
      // QA2-S02: 서버 액션이 throw하면 예외가 조용히 빠져나가 화면이 무반응처럼 보였다 — 반드시 화면에 알린다.
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(null); }
  };

  const phoneByCustomer = React.useMemo(() => new Map(customers.map((c) => [c.id, c.phone ?? null])), [customers]);
  const todayKey = todayKeyInTz(DEFAULT_TZ);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const staffName = React.useMemo(() => new Map(staff.map((s) => [s.membershipId, s.displayName])), [staff]);

  const rowView = (a: SalonAppointment) => {
    const dateKey = formatInTz(a.startAt, DEFAULT_TZ, "yyyy-MM-dd");
    const active = !TERMINAL.has(a.status);
    return {
      customer: a.customerName ?? a.customerId.slice(0, 8),
      noShow: noShowByCustomer[a.customerId] ?? 0,
      when: dateKey === todayKey ? `오늘 ${formatInTz(a.startAt, DEFAULT_TZ, "HH:mm")}` : formatInTz(a.startAt, DEFAULT_TZ, "M. d. (EEE) HH:mm"),
      until: formatInTz(a.endAt, DEFAULT_TZ, "HH:mm"),
      service: a.serviceName ?? "-",
      staff: staffName.get(a.staffId) ?? "-",
      price: formatKRW(a.price),
      active,
      isTomorrow: dateKey === tomorrowKey && active,
      canTreat: canWrite && a.status === "완료",
      canStatus: canWrite && active,
    };
  };

  const actionsOf = (a: SalonAppointment, v: ReturnType<typeof rowView>) => {
    const rowBusy = busy === a.id;
    const nodes: React.ReactNode[] = [];
    if (v.canStatus) {
      nodes.push(
        <Button key="done" variant="secondary" size="sm" loading={rowBusy} onClick={() => { if (window.confirm("완료 처리하면 이후 버튼이 사라져 되돌릴 수 없습니다. 계속할까요?")) run(a.id, () => updateAppointmentStatus(businessId, a.id, "완료")); }}>완료</Button>,
        <Button key="cancel" variant="ghost" size="sm" loading={rowBusy} onClick={() => { if (window.confirm("예약을 취소합니다. 이후 버튼이 사라져 되돌릴 수 없습니다. 계속할까요?")) run(a.id, () => updateAppointmentStatus(businessId, a.id, "취소")); }}>취소</Button>,
        <Button key="noshow" variant="ghost" size="sm" loading={rowBusy} onClick={() => { if (window.confirm("노쇼로 처리합니다. 이후 버튼이 사라져 되돌릴 수 없습니다. 계속할까요?")) run(a.id, () => updateAppointmentStatus(businessId, a.id, "노쇼")); }}>노쇼</Button>
      );
    }
    if (v.canTreat) {
      nodes.push(
        <Button key="treat" variant="secondary" size="sm" loading={rowBusy} onClick={() => run(a.id, async () => { const r = await createTreatmentHistory(businessId, { appointmentId: a.id }); if (r.ok) router.push(`/w/${businessId}/customers/${a.customerId}`); return r; })}>
          <History size={13} aria-hidden />시술 기록
        </Button>
      );
    }
    if (canRecordPayment && a.status !== "취소" && a.status !== "노쇼") {
      nodes.push(
        <Button key="pay" variant="secondary" size="sm" onClick={() => setPayTarget({ appointmentId: a.id, customerId: a.customerId, customerName: a.customerName, serviceName: a.serviceName, suggested: a.price })}>
          <Banknote size={13} aria-hidden />수납
        </Button>
      );
    }
    if (v.isTomorrow) {
      nodes.push(
        <Button key="remind" variant="ghost" size="sm" onClick={() => setReminderFor(a)} title="내일 예약 확인 문구">
          <MailCheck size={13} aria-hidden />확인 문구
        </Button>
      );
    }
    return nodes;
  };

  const setDateFilter = (today: boolean) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (today) sp.set("date", "today"); else sp.delete("date");
    router.push(`?${sp.toString()}`);
  };

  return (
    <>
      <PageHeader
        title="예약·시술"
        description="오늘 예약을 처리하고, 수납과 시술 기록을 남깁니다. 시술 메뉴와 재방문 주기는 아래에서 관리합니다."
        actions={
          canWrite ? (
            <Button onClick={() => setBookOpen(true)}>
              <CalendarPlus size={15} aria-hidden />예약 등록
            </Button>
          ) : undefined
        }
      >
        <FilterRow>
          <StatusTab active={todayOnly} onClick={() => setDateFilter(true)}>오늘</StatusTab>
          <StatusTab active={!todayOnly} onClick={() => setDateFilter(false)}>전체(최근 100건)</StatusTab>
        </FilterRow>
      </PageHeader>

      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="mb-4 p-4 sm:p-5">
        <CardHead title={todayOnly ? "오늘 예약" : "예약 목록"} description={`${appointments.length}건 · 시간순`} />
        {appointments.length === 0 ? (
          <EmptyState
            title={todayOnly ? "오늘 예약이 없습니다." : "예약이 없습니다."}
            description={canWrite ? "예약 등록으로 첫 예약을 잡으세요." : undefined}
            action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setBookOpen(true)}>예약 등록</Button> : undefined}
          />
        ) : (
          <TableOrCards
            rows={appointments}
            keyOf={(a) => a.id}
            table={
              <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className={`${TABLE} min-w-[760px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>일시</th>
                      <th className={TH}>고객</th>
                      <th className={TH}>시술 · 담당</th>
                      {canRevenue && <th className={`${TH} text-right`}>금액</th>}
                      <th className={TH}>상태</th>
                      <th className={`${TH} text-right`}>동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((a) => {
                      const v = rowView(a);
                      const acts = actionsOf(a, v);
                      return (
                        <tr key={a.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>
                            <span className="block font-medium text-t">{v.when}</span>
                            <span className="block text-[11.5px] text-t3">~{v.until}</span>
                          </td>
                          <td className={TD}>
                            <span className="flex items-center gap-1.5">
                              <Link href={`/w/${businessId}/customers/${a.customerId}`} className="inline-flex min-w-0 items-center hover:underline [@media(pointer:coarse)]:min-h-[44px]"><CellName max={160}>{v.customer}</CellName></Link>
                              {v.noShow > 0 && <span className="shrink-0 rounded-[6px] bg-eb px-1.5 py-px text-[10.5px] font-bold text-et" title="이 고객의 누적 노쇼 이력">노쇼 {v.noShow}</span>}
                            </span>
                          </td>
                          <td className={`${TD} text-t2`}>
                            <span className="block max-w-[220px] truncate text-t" title={v.service}>{v.service}</span>
                            <span className="block text-[11.5px] text-t3">{v.staff}</span>
                          </td>
                          {canRevenue && <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{v.price}</td>}
                          <td className={TD}><Badge kind={SALON_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge></td>
                          <td className={`${TD} text-right`}>
                            {acts.length > 0 && <span className="inline-flex flex-wrap items-center justify-end gap-1">{acts}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            }
            card={(a) => {
              const v = rowView(a);
              const acts = actionsOf(a, v);
              return (
                <MobileCard
                  title={v.customer}
                  sub={<><span>{v.when}~{v.until}</span><span>· {v.service}</span>{v.noShow > 0 && <span className="rounded-[6px] bg-eb px-1.5 py-px text-[10.5px] font-bold text-et">노쇼 {v.noShow}</span>}</>}
                  badge={<Badge kind={SALON_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge>}
                  fields={[["담당", v.staff], ...(canRevenue ? ([["금액", v.price]] as [string, React.ReactNode][]) : [])]}
                  actions={acts.length > 0 ? acts : undefined}
                />
              );
            }}
          />
        )}
      </Card>

      <BookingModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        businessId={businessId}
        services={services}
        staff={staff}
        resources={resources}
        customers={customers}
        noShowByCustomer={noShowByCustomer}
        prefillCustomerId={prefillValid ? prefillCustomerId : ""}
        onCreated={() => { setBookOpen(false); router.refresh(); }}
      />

      <PayModal businessId={businessId} target={payTarget} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); router.refresh(); }} />

      <Modal open={!!reminderFor} onClose={() => setReminderFor(null)} title="내일 예약 확인 문구">
        {reminderFor && (
          <MessageActions
            title="예약 확인 문구"
            phone={phoneByCustomer.get(reminderFor.customerId) ?? undefined}
            text={salonReminderNotice({
              businessName,
              customerName: reminderFor.customerName,
              startAtIso: reminderFor.startAt,
              serviceName: reminderFor.serviceName,
              price: canRevenue ? reminderFor.price : null,
            })}
          />
        )}
      </Modal>
    </>
  );
}

function BookingModal({
  open, onClose, businessId, services, staff, resources, customers, noShowByCustomer, prefillCustomerId, onCreated,
}: {
  open: boolean; onClose: () => void; businessId: string;
  services: SalonService[]; staff: SalonStaffProfile[]; resources: SalonResource[]; customers: CustomerOption[];
  noShowByCustomer: Record<string, number>; prefillCustomerId: string; onCreated: () => void;
}) {
  const initial = React.useCallback(() => ({
    customerId: prefillCustomerId, staffId: "", serviceId: "", resourceId: "",
    date: todayKeyInTz(DEFAULT_TZ), time: "10:00",
  }), [prefillCustomerId]);
  const [form, setForm] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [suggested, setSuggested] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // 열 때마다 초기화 — 이전 입력이 다음 예약에 섞이지 않게.
  React.useEffect(() => { if (open) { setForm(initial()); setError(null); setSuggested(null); } }, [open, initial]);

  const submit = async () => {
    if (!form.customerId || !form.staffId || !form.serviceId) { setError("고객·담당자·서비스를 선택하세요."); return; }
    setBusy(true); setError(null); setSuggested(null);
    try {
      const startIso = localDateTimeToUtcIso(form.date, form.time, DEFAULT_TZ);
      const result = await bookAppointment(businessId, {
        customerId: form.customerId, staffId: form.staffId, serviceId: form.serviceId,
        startIso, resourceId: form.resourceId || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        if (result.suggestedStartIso) setSuggested(result.suggestedStartIso);
        return;
      }
      onCreated();
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally { setBusy(false); }
  };

  const applySuggested = () => {
    if (!suggested) return;
    // CLICK-PATH-220: UTC 날짜 + 로컬 시각을 섞어 쓰면 KST 00~09시 제안이 하루 밀린다. tz 기준으로 함께 뽑는다.
    setForm((f) => ({ ...f, date: formatInTz(suggested, DEFAULT_TZ, "yyyy-MM-dd"), time: formatInTz(suggested, DEFAULT_TZ, "HH:mm") }));
    setSuggested(null);
    setError(null);
  };

  const service = services.find((s) => s.id === form.serviceId);
  const noShow = form.customerId ? noShowByCustomer[form.customerId] ?? 0 : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="예약 등록"
      className="sm:max-w-[560px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>예약 확정</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col">
        {error && (
          <div className="mb-4 flex flex-col gap-2">
            <Alert>{error}</Alert>
            {suggested && (
              <Button type="button" variant="secondary" size="sm" className="self-start" onClick={applySuggested}>
                {/* ponytail: toLocaleString 은 로케일 dayPeriod(오전/오후)가 ICU 빌드에 따라 갈려 hydration 위험이 있어 formatInTz로 통일. */}
                다음 가능 시간 적용: {formatInTz(suggested, DEFAULT_TZ, "M. d. a hh:mm")}
              </Button>
            )}
          </div>
        )}
        <SelectField label="고객" required value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} autoFocus>
          <option value="">선택</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{noShowByCustomer[c.id] ? `${c.name} · 노쇼 ${noShowByCustomer[c.id]}회` : c.name}</option>)}
        </SelectField>
        {/* S4: 노쇼 이력 경고 — 예약 확정 자체를 막지는 않는다(보증금·정책은 사업장 설정의 몫). */}
        {noShow > 0 && (
          <p role="alert" className="-mt-2 mb-4 flex items-center gap-1.5 rounded-[var(--r-md)] bg-wb px-3 py-2 text-[12px] text-wt">
            <CircleAlert size={14} className="shrink-0" aria-hidden />
            이 고객은 노쇼 이력이 {noShow}회 있습니다.
          </p>
        )}
        <SelectField label="서비스" required value={form.serviceId} onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))} hint={service ? `${service.durationMinutes}분 · ${formatKRW(service.price)}` : undefined}>
          <option value="">선택</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes}분)</option>)}
        </SelectField>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <SelectField label="담당자" required value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}>
            <option value="">선택</option>
            {staff.map((s) => <option key={s.membershipId} value={s.membershipId}>{s.displayName}</option>)}
          </SelectField>
          <SelectField label="좌석·자원 (선택)" value={form.resourceId} onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}>
            <option value="">없음</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </SelectField>
          <Input label="날짜" type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Input label="시작 시각" type="time" required value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
        </div>
        <p className="text-[12px] leading-snug text-t3">담당자 근무시간·휴무·좌석 겹침은 서버가 확인하며, 겹치면 다음 가능한 시간을 제안합니다.</p>
      </form>
    </Modal>
  );
}
