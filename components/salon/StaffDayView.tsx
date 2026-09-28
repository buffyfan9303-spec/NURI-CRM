"use client";

/**
 * 미용실 담당자별 하루 보기. FullCalendar/Schedule-X의 리소스 뷰는 유료라(명세 지시) 쓰지 않고
 * dnd-kit(이미 설치됨)으로 직접 만든다 — 열=담당 디자이너, 행=30분 칸, 카드=예약.
 *
 * 드래그로 다른 시간·담당자에 놓으면 salon-actions.rescheduleAppointment(기존 예약 변경 서버
 * 액션)를 부르고, 서버(crm.salon_appointments의 EXCLUDE 제약 — salon_book과 같은 제약)가
 * 겹침을 거부하면 아무것도 낙관적으로 바꾸지 않았으므로 카드가 저절로 원위치에 남는다.
 * 실패 메시지는 부모(BookingBoard)의 배너로 올린다(onError).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeKind } from "@/components/ui/Badge";
import { Segmented } from "@/components/common/Segmented";
import { CardHead } from "@/components/rental/listkit";
import { cn } from "@/lib/utils/cn";
import type { SalonService, SalonStaffProfile, SalonResource, SalonAppointment } from "@/lib/domain/salon";
import { rescheduleAppointment } from "@/lib/domain/salon-actions";
import { formatInTz, localDateTimeToUtcIso, todayKeyInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import { SALON_STATUS_KIND, BookingModal, type CustomerOption } from "./BookingBoard";

// ponytail: 사업장별 영업시간 설정이 아직 없어(TimeGrid.tsx와 같은 처지) 고정값을 쓴다.
// crm.businesses에 영업시간 컬럼이 생기면 여기 상수 대신 그 값을 props로 받아 대체한다.
const BUSINESS_START = 9;
const BUSINESS_END = 20;
const SLOT_MIN = 30;
// 30분 칸 높이는 CSS 변수 --slot-h(PC 34px, 터치 화면 44px = WCAG 2.5.8)로 두고 위치·높이를 전부 calc 로 계산한다 —
// JS 로 포인터를 감지하면 hydration 뒤 높이가 바뀌어 CLS 가 생긴다. ROW_H 는 "1시간 이상" 같은 비율 판단에만 쓴다.
const ROW_H = 34;
const SLOT_H = "var(--slot-h)";
const slotsY = (n: number) => `calc(${SLOT_H} * ${n})`;
const TERMINAL = new Set(["완료", "취소", "노쇼"]);
/** 카드 왼쪽 3px 막대 색 — Badge 의 kind 와 같은 토큰을 쓴다(색만으로 전하지 않도록 Badge 글자도 함께 남긴다). */
const KIND_BAR: Record<BadgeKind, string> = { success: "border-l-[var(--okt)]", info: "border-l-[var(--it)]", warning: "border-l-[var(--wt)]", error: "border-l-[var(--et)]" };

function minutesNow(): number {
  const [hh, mm] = formatInTz(new Date().toISOString(), DEFAULT_TZ, "HH:mm").split(":").map(Number);
  return hh * 60 + mm;
}

function slotList(): string[] {
  const out: string[] = [];
  for (let m = BUSINESS_START * 60; m < BUSINESS_END * 60; m += SLOT_MIN) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}
const SLOTS = slotList();

export function StaffDayView({
  businessId,
  canWrite,
  canRevenue,
  services,
  staff,
  resources,
  customers,
  appointments,
  noShowByCustomer,
  onError,
}: {
  businessId: string;
  canWrite: boolean;
  /** revenue.read 없으면 카드에 금액을 보이지 않는다(CLICK-PATH-203과 같은 기준, BookingBoard와 동일). */
  canRevenue: boolean;
  services: SalonService[];
  staff: SalonStaffProfile[];
  resources: SalonResource[];
  customers: CustomerOption[];
  /** 오늘·전체 어느 필터로 불러왔든 이 컴포넌트는 오늘 하루만 다룬다(클라이언트에서 오늘 날짜로 다시 좁힘). */
  appointments: SalonAppointment[];
  noShowByCustomer: Record<string, number>;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const todayKey = todayKeyInTz(DEFAULT_TZ);
  const [mobileIdx, setMobileIdx] = React.useState(0);
  const [openFor, setOpenFor] = React.useState<{ staffId: string; time: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const todays = React.useMemo(
    () => appointments.filter((a) => formatInTz(a.startAt, DEFAULT_TZ, "yyyy-MM-dd") === todayKey),
    [appointments, todayKey]
  );

  const dndId = React.useId(); // CalendarClient 와 같은 이유(hydration 경고 방지)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  async function handleDragEnd(e: DragEndEvent) {
    if (!canWrite || !e.over) return;
    const appt = todays.find((a) => a.id === String(e.active.id));
    if (!appt || TERMINAL.has(appt.status)) return;
    const m = /^slot:(.+):(\d{2}:\d{2})$/.exec(String(e.over.id));
    if (!m) return;
    const [, targetStaffId, time] = m;
    if (targetStaffId === appt.staffId && formatInTz(appt.startAt, DEFAULT_TZ, "HH:mm") === time) return;
    onError(null);
    setBusy(true);
    try {
      const startIso = localDateTimeToUtcIso(todayKey, time, DEFAULT_TZ);
      const result = await rescheduleAppointment(businessId, appt.id, { staffId: targetStaffId, startIso });
      if (!result.ok) {
        onError(result.message); // 실패 — 로컬에서 아무것도 바꾸지 않았으므로 카드는 이미 원위치.
        return;
      }
      router.refresh();
    } catch {
      onError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  if (staff.length === 0) {
    return (
      <Card className="sm:p-5">
        <CardHead title="담당자별 하루 보기" description="근무표에서 담당자를 먼저 등록하세요." />
      </Card>
    );
  }

  const current = staff[Math.min(mobileIdx, staff.length - 1)];

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={handleDragEnd}>
      <Card className="overflow-hidden p-4 sm:p-5">
        <CardHead
          title="담당자별 하루 보기"
          description={`오늘 · 영업시간 ${BUSINESS_START}–${BUSINESS_END}시 · 빈 칸을 누르면 예약 등록, 카드를 끌면 시간·담당자 변경`}
        />

        {/* 모바일(<640): 담당자 1명씩 — 세그먼트로 고른다(3명 넘으면 가로 스크롤). */}
        {staff.length > 1 && (
        <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:hidden">
          <Segmented
            ariaLabel="담당자 선택"
            value={current.membershipId}
            onChange={(id) => setMobileIdx(Math.max(0, staff.findIndex((s) => s.membershipId === id)))}
            options={staff.map((s) => ({ value: s.membershipId, label: s.displayName }))}
            className="w-full"
          />
        </div>
        )}
        <div className="-mx-4 sm:hidden">
          <StaffGrid
            staffList={[current]}
            todays={todays}
            canWrite={canWrite}
            canRevenue={canRevenue}
            noShowByCustomer={noShowByCustomer}
            onSlotClick={(staffId, time) => canWrite && setOpenFor({ staffId, time })}
          />
        </div>

        {/* PC/태블릿: 담당자를 나란히. */}
        <div className="-mx-5 hidden overflow-x-auto sm:block">
          <StaffGrid
            staffList={staff}
            todays={todays}
            canWrite={canWrite}
            canRevenue={canRevenue}
            noShowByCustomer={noShowByCustomer}
            onSlotClick={(staffId, time) => canWrite && setOpenFor({ staffId, time })}
          />
        </div>
      </Card>

      <BookingModal
        open={!!openFor}
        onClose={() => setOpenFor(null)}
        businessId={businessId}
        services={services}
        staff={staff}
        resources={resources}
        customers={customers}
        noShowByCustomer={noShowByCustomer}
        prefillCustomerId=""
        initialStaffId={openFor?.staffId}
        initialDate={todayKey}
        initialTime={openFor?.time}
        onCreated={() => {
          setOpenFor(null);
          router.refresh();
        }}
      />
      {busy && <span className="sr-only" role="status">저장 중…</span>}
    </DndContext>
  );
}

function StaffGrid({
  staffList,
  todays,
  canWrite,
  canRevenue,
  noShowByCustomer,
  onSlotClick,
}: {
  staffList: SalonStaffProfile[];
  todays: SalonAppointment[];
  canWrite: boolean;
  canRevenue: boolean;
  noShowByCustomer: Record<string, number>;
  onSlotClick: (staffId: string, time: string) => void;
}) {
  const gridHeight = slotsY(SLOTS.length);
  // 현재 시각선 — 1분마다 갱신. 영업시간 밖이면 그리지 않는다.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(minutesNow());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const nowTop = now !== null && now >= BUSINESS_START * 60 && now < BUSINESS_END * 60 ? slotsY((now - BUSINESS_START * 60) / SLOT_MIN) : null;
  // 현재시각 라벨(16px)과 20분 안쪽의 정시 라벨은 겹치므로 숨긴다(Cal.com 도 같은 처리).
  const hideHourLabel = (t: string) => now !== null && Math.abs(Number(t.slice(0, 2)) * 60 - now) < 20;

  return (
    <div
      className="grid min-w-[520px] border-t border-[var(--bd)] [--slot-h:34px] [@media(pointer:coarse)]:[--slot-h:44px]"
      style={{ gridTemplateColumns: `56px repeat(${staffList.length}, minmax(150px, 1fr))` }}
    >
      <div className="border-b border-[var(--bd)] bg-sf2" />
      {staffList.map((s) => {
        const n = todays.filter((a) => a.staffId === s.membershipId && !TERMINAL.has(a.status)).length;
        return (
          <div key={s.membershipId} className="flex min-w-0 items-center gap-2 border-b border-l border-[var(--bd)] bg-sf2 px-2.5 py-2">
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-ink)]" aria-hidden>
              {s.displayName.trim().slice(0, 2)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-t">{s.displayName}</span>
              <span className="block text-[11px] tabular-nums text-t3">{n > 0 ? `예약 ${n}건` : "예약 없음"}</span>
            </span>
          </div>
        );
      })}

      <div className="relative bg-sf2" style={{ height: gridHeight }}>
        {SLOTS.map((t, i) =>
          t.endsWith(":00") && i > 0 && !hideHourLabel(t) ? (
            <div key={t} className="absolute inset-x-0 -translate-y-1/2 pr-2 text-right text-[11px] tabular-nums text-t3" style={{ top: slotsY(i) }}>
              {t}
            </div>
          ) : null
        )}
        {nowTop !== null && (
          <span className="absolute right-1 z-[2] -translate-y-1/2 rounded-[var(--r-xs)] bg-[var(--accent-strong)] px-1 text-[10px] font-semibold tabular-nums leading-[16px] text-[var(--accent-contrast)]" style={{ top: nowTop }} aria-hidden>
            {String(Math.floor((now as number) / 60)).padStart(2, "0")}:{String((now as number) % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {staffList.map((s) => {
        const staffAppts = todays.filter((a) => a.staffId === s.membershipId);
        return (
          <div key={s.membershipId} className="relative border-l border-[var(--bd)]" style={{ height: gridHeight }}>
            {SLOTS.map((t, i) => (
              <SlotCell
                key={t}
                staffId={s.membershipId}
                time={t}
                top={slotsY(i)}
                height={SLOT_H}
                hour={t.endsWith(":00")}
                disabled={!canWrite}
                onClick={() => onSlotClick(s.membershipId, t)}
              />
            ))}
            {nowTop !== null && (
              <div className="pointer-events-none absolute inset-x-0 z-[2] flex items-center" style={{ top: nowTop }} aria-hidden>
                <span className="-ml-[3px] h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent-strong)]" />
                <span className="h-px flex-1 bg-[var(--accent-strong)]" />
              </div>
            )}
            {staffAppts.map((a) => (
              <AppointmentCard
                key={a.id}
                appt={a}
                canWrite={canWrite}
                canRevenue={canRevenue}
                noShow={noShowByCustomer[a.customerId] ?? 0}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** 빈 30분 칸 — 드롭 대상(`slot:{staffId}:{HH:mm}`)이자 클릭하면 그 담당자·시간의 예약 등록 모달을 연다.
 *  정시 줄은 실선, 30분 줄은 점선(Cal.com 주 보기와 같은 위계). hover 하면 "+ 시각" 힌트가 뜬다. */
function SlotCell({
  staffId,
  time,
  top,
  height,
  hour,
  disabled,
  onClick,
}: {
  staffId: string;
  time: string;
  top: string;
  height: string;
  hour: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${staffId}:${time}`, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={`${time} 예약 등록`}
      className={cn(
        "group absolute inset-x-0 flex items-center justify-center border-t text-left outline-none transition-colors duration-1 disabled:cursor-default",
        hour ? "border-[var(--bd)]" : "border-dashed border-[var(--bd)]",
        !disabled && "hover:bg-sf2 focus-visible:bg-sf2",
        isOver && !disabled && "bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)]"
      )}
      style={{ top, height }}
    >
      {!disabled && !isOver && (
        <span className="pointer-events-none inline-flex items-center gap-0.5 rounded-[var(--r-xs)] px-1 text-[10.5px] font-medium tabular-nums text-t3 opacity-0 transition-opacity duration-1 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
          <Plus size={10} />{time}
        </span>
      )}
    </button>
  );
}

function apptTop(startAt: string): string {
  const [hh, mm] = formatInTz(startAt, DEFAULT_TZ, "HH:mm").split(":").map(Number);
  const minutesFromStart = Math.max(0, hh * 60 + mm - BUSINESS_START * 60);
  return slotsY(minutesFromStart / SLOT_MIN);
}

/** 칸 수(30분 단위, 최소 0.7칸). CSS 높이는 slotsY(칸 수). */
function apptSlots(startAt: string, endAt: string): number {
  const durationMin = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000;
  return Math.max(durationMin / SLOT_MIN, 0.7);
}

/** 예약 카드 — 끌 수 있는 조건은 TERMINAL(완료·취소·노쇼) 아님 + 쓰기 권한.
 *  흰 면 + 왼쪽 3px 상태색 막대(Cal.com 예약 블록). 끝난 예약은 sf2 면, 취소·노쇼는 이름에 취소선. */
function AppointmentCard({
  appt,
  canWrite,
  canRevenue,
  noShow,
}: {
  appt: SalonAppointment;
  canWrite: boolean;
  canRevenue: boolean;
  noShow: number;
}) {
  const draggable = canWrite && !TERMINAL.has(appt.status);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: appt.id,
    data: { appt },
    disabled: !draggable,
  });
  const kind = SALON_STATUS_KIND[appt.status] ?? "info";
  const slots = apptSlots(appt.startAt, appt.endAt);
  const tall = slots * ROW_H >= ROW_H * 2; // 1시간 이상이면 3줄(이름·시술·상태) 다 보인다
  const ended = TERMINAL.has(appt.status);
  const struck = appt.status === "취소" || appt.status === "노쇼";
  return (
    <div
      ref={setNodeRef}
      title={`${appt.customerName ?? "고객"} · ${appt.serviceName ?? "-"} — ${formatInTz(appt.startAt, DEFAULT_TZ, "HH:mm")}–${formatInTz(appt.endAt, DEFAULT_TZ, "HH:mm")}${draggable ? "" : "（고정）"}`}
      className={cn(
        "absolute inset-x-1 z-[1] flex flex-col overflow-hidden rounded-[var(--r-sm)] border border-[var(--bd)] border-l-[3px] bg-sf px-1.5 py-1 text-left leading-tight shadow-card transition-[box-shadow,opacity] duration-1",
        KIND_BAR[kind],
        draggable && "cursor-grab touch-none hover:shadow-raised active:cursor-grabbing",
        ended && "bg-sf2",
        isDragging && "opacity-40"
      )}
      style={{ top: apptTop(appt.startAt), height: slotsY(slots) }}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <span className="flex items-center gap-1 text-[12px]">
        <span className={cn("min-w-0 truncate font-semibold text-t", struck && "line-through decoration-[var(--et)]")}>{appt.customerName ?? appt.customerId.slice(0, 8)}</span>
        {noShow > 0 && (
          <span className="shrink-0 rounded-[var(--r-xs)] bg-eb px-1 text-[10px] font-bold text-et" title="이 고객의 누적 노쇼 이력">
            노쇼 {noShow}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-t3">{formatInTz(appt.startAt, DEFAULT_TZ, "HH:mm")}</span>
      </span>
      <span className="truncate text-[11px] text-t2">{appt.serviceName ?? "-"}</span>
      {tall && (
        <span className="mt-auto flex items-center gap-1 text-[10.5px]">
          <Badge kind={kind}>{appt.status}</Badge>
          {canRevenue && <span className="tabular-nums text-t2">{formatKRW(appt.price)}</span>}
        </span>
      )}
    </div>
  );
}
