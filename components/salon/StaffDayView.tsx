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
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
const ROW_H = 30; // px / 30분
const TERMINAL = new Set(["완료", "취소", "노쇼"]);

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <Card className="overflow-hidden sm:p-5">
        <CardHead
          title="담당자별 하루 보기"
          description={`오늘 · 영업시간 ${BUSINESS_START}–${BUSINESS_END}시 · 빈 칸을 누르면 예약 등록, 카드를 끌면 시간·담당자 변경`}
        />

        {/* 모바일(<640): 담당자 1명씩 좌우로 넘긴다. */}
        <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileIdx((i) => Math.max(0, i - 1))}
            disabled={mobileIdx === 0}
            aria-label="이전 담당자"
          >
            <ChevronLeft size={15} aria-hidden />
          </Button>
          <span className="text-[13px] font-medium text-t">{current.displayName}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMobileIdx((i) => Math.min(staff.length - 1, i + 1))}
            disabled={mobileIdx === staff.length - 1}
            aria-label="다음 담당자"
          >
            <ChevronRight size={15} aria-hidden />
          </Button>
        </div>
        <div className="sm:hidden">
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
        <div className="hidden overflow-x-auto sm:block">
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
  const gridHeight = SLOTS.length * ROW_H;
  return (
    <div className="grid min-w-[520px]" style={{ gridTemplateColumns: `52px repeat(${staffList.length}, minmax(140px, 1fr))` }}>
      <div className="border-b border-[var(--bd)]" />
      {staffList.map((s) => (
        <div key={s.membershipId} className="truncate border-b border-l border-[var(--bd)] px-2 py-1.5 text-center text-[12px] font-medium text-t">
          {s.displayName}
        </div>
      ))}

      <div className="relative" style={{ height: gridHeight }}>
        {SLOTS.map((t, i) =>
          t.endsWith(":00") ? (
            <div key={t} className="absolute inset-x-0 -translate-y-1/2 pr-1.5 text-right text-[10.5px] text-t3" style={{ top: i * ROW_H }}>
              {t}
            </div>
          ) : null
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
                top={i * ROW_H}
                height={ROW_H}
                disabled={!canWrite}
                onClick={() => onSlotClick(s.membershipId, t)}
              />
            ))}
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

/** 빈 30분 칸 — 드롭 대상(`slot:{staffId}:{HH:mm}`)이자 클릭하면 그 담당자·시간의 예약 등록 모달을 연다. */
function SlotCell({
  staffId,
  time,
  top,
  height,
  disabled,
  onClick,
}: {
  staffId: string;
  time: string;
  top: number;
  height: number;
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
        "absolute inset-x-0 border-t border-[var(--bd)] text-left outline-none disabled:cursor-default",
        !disabled && "hover:bg-sf2 focus-visible:bg-sf2",
        isOver && !disabled && "bg-ib ring-1 ring-inset ring-[var(--accent)]"
      )}
      style={{ top, height }}
    />
  );
}

function apptTop(startAt: string): number {
  const [hh, mm] = formatInTz(startAt, DEFAULT_TZ, "HH:mm").split(":").map(Number);
  const minutesFromStart = Math.max(0, hh * 60 + mm - BUSINESS_START * 60);
  return (minutesFromStart / SLOT_MIN) * ROW_H;
}

function apptHeight(startAt: string, endAt: string): number {
  const durationMin = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000;
  return Math.max((durationMin / SLOT_MIN) * ROW_H, ROW_H * 0.7);
}

/** 예약 카드 — 끌 수 있는 조건은 TERMINAL(완료·취소·노쇼) 아님 + 쓰기 권한. */
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
  return (
    <div
      ref={setNodeRef}
      title={`${appt.customerName ?? "고객"} · ${appt.serviceName ?? "-"} — ${formatInTz(appt.startAt, DEFAULT_TZ, "HH:mm")}${draggable ? "" : "（고정）"}`}
      className={cn(
        "ev-tag absolute inset-x-0.5 z-[1] flex flex-col overflow-hidden rounded-[6px] px-1.5 py-1 text-left leading-tight tg-ord",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      style={{ top: apptTop(appt.startAt), height: apptHeight(appt.startAt, appt.endAt) }}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <span className="flex items-center gap-1 truncate font-semibold">
        {appt.customerName ?? appt.customerId.slice(0, 8)}
        {noShow > 0 && (
          <span className="shrink-0 rounded-[4px] bg-eb px-1 text-[10px] font-bold text-et" title="이 고객의 누적 노쇼 이력">
            노쇼 {noShow}
          </span>
        )}
      </span>
      <span className="truncate text-[11px]">{appt.serviceName ?? "-"}</span>
      <span className="flex items-center gap-1 text-[10.5px]">
        <Badge kind={SALON_STATUS_KIND[appt.status] ?? "info"}>{appt.status}</Badge>
        {canRevenue && <span className="tabular-nums">{formatKRW(appt.price)}</span>}
      </span>
    </div>
  );
}
