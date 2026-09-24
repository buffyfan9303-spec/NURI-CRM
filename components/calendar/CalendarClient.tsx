"use client";

/**
 * 캘린더 화면 조립부.
 *
 * 데이터는 전부 서버(app/w/[businessId]/calendar/page.tsx)가 URL 쿼리를 읽어 만든
 * props로 들어온다. 여기서는 데이터를 직접 fetch하지 않는다 — 기간·필터를 바꾸면
 * router.push()로 URL을 바꾸고, Next가 서버에서 새로 렌더링한다(§5 서버 강제 원칙과
 * 일치: 클라이언트는 요청만 하고 판정은 항상 서버가 다시 한다).
 *
 * 실패 시 롤백: 낙관적으로 먼저 바꾸고 되돌리는 대신, 서버가 확정하기 전엔 아예
 * 아무것도 바꾸지 않는다(버튼은 loading 상태만 보여줌). 그래서 실패해도 "이전 상태"가
 * 저절로 유지된다 — 되돌릴 것 자체가 없다.
 */
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { X } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { Modal } from "@/components/ui/Modal";
import type { IndustryDef } from "@/lib/industry/config";
import type { CalendarEvent, CalendarView, MemberOption } from "@/lib/domain/calendar-shared";
import { shiftDateKey } from "@/lib/domain/calendar-shared";
import { formatMonthTitle, formatDayTitle } from "@/lib/utils/datetime";
import { deleteEvent } from "@/lib/domain/calendar-actions";
import { Toolbar, type CalendarFilters } from "./Toolbar";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { ListView } from "./ListView";
import { EventDetail } from "./EventDetail";
import { EventFormModal } from "./EventFormModal";

export type EventsState =
  | { kind: "ok"; events: CalendarEvent[] }
  | { kind: "error"; title: string; detail: string }
  | { kind: "forbidden"; title: string; detail: string };

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(false); // 서버/첫 클라이언트 렌더는 항상 false(hydration mismatch 방지)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

type FormModalState = { mode: "create"; defaultDateKey: string } | { mode: "edit"; event: CalendarEvent } | null;

export function CalendarClient({
  businessId,
  timezone,
  industry,
  view,
  dateKey,
  todayKey,
  days,
  filters,
  eventsState,
  members,
  canWrite,
  canDelete,
}: {
  businessId: string;
  timezone: string;
  industry: IndustryDef;
  view: CalendarView;
  dateKey: string;
  todayKey: string;
  days: string[];
  filters: CalendarFilters;
  eventsState: EventsState;
  members: MemberOption[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();
  const isDesktop = useIsDesktop();

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // 데스크톱 상세는 모달이 아니라 <aside> 인라인 패널이라 Modal.tsx의 Escape/포커스 복귀를
  // 못 받는다(결함 D4). 선택 시점의 트리거 요소를 기억해뒀다가 Escape로 닫을 때 되돌린다.
  const lastTriggerRef = React.useRef<HTMLElement | null>(null);
  const [formModal, setFormModal] = React.useState<FormModalState>(null);
  const [busyDeleting, setBusyDeleting] = React.useState(false);
  const [banner, setBanner] = React.useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [retryingFetch, setRetryingFetch] = React.useState(false);

  // 결함 수정(§5.6/§11-4): "실패하면 달력을 지우지 않는다" — 마지막으로 성공한 목록을
  // 붙잡아 두고, 이번 렌더가 error면 그걸로 격자를 계속 그린다(0건으로 덮지 않음).
  const lastGoodEventsRef = React.useRef<CalendarEvent[]>([]);
  const hadLoadedOnceRef = React.useRef(false);
  if (eventsState.kind === "ok") {
    lastGoodEventsRef.current = eventsState.events;
    hadLoadedOnceRef.current = true;
  }
  const events = eventsState.kind === "forbidden" ? [] : eventsState.kind === "ok" ? eventsState.events : lastGoodEventsRef.current;
  const isFetchError = eventsState.kind === "error";
  const isStaleData = isFetchError && hadLoadedOnceRef.current;
  const isEmptyResult = eventsState.kind === "ok" && eventsState.events.length === 0;
  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;

  function pushParams(patch: Partial<{ view: CalendarView; date: string } & CalendarFilters>) {
    const merged = {
      view: patch.view ?? view,
      date: patch.date ?? dateKey,
      kinds: patch.kinds ?? filters.kinds,
      assignee: "assignee" in patch ? patch.assignee : filters.assignee,
      status: "status" in patch ? patch.status : filters.status,
      q: "q" in patch ? patch.q : filters.q,
    };
    const params = new URLSearchParams();
    params.set("view", merged.view);
    params.set("date", merged.date);
    if (merged.kinds.length) params.set("kinds", merged.kinds.join(","));
    if (merged.assignee) params.set("assignee", merged.assignee);
    if (merged.status) params.set("status", merged.status);
    if (merged.q) params.set("q", merged.q);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // 휴대폰(640px 미만)에서는 월 격자 한 칸이 50px 남짓이라 일정이 "10:…" 로 잘려 읽을 수 없다.
  // 사용자가 보기 방식을 URL 로 고르지 않았을 때만 목록 보기로 시작한다(직접 '월'을 누르면 그대로 유지).
  React.useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches && !new URLSearchParams(window.location.search).has("view") && view !== "list") {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "list");
      router.replace(`${pathname}?${params.toString()}`);
    }
    // 첫 진입 1회만 판단한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title =
    view === "day"
      ? formatDayTitle(dateKey)
      : view === "week"
        ? `${formatDayTitle(days[0])} ~ ${formatDayTitle(days[days.length - 1])}`
        : formatMonthTitle(dateKey);

  function selectEvent(id: string) {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    setSelectedId(id);
  }

  // 데스크톱 aside 상세는 자체 dialog가 아니라서 Escape를 받지 못했다(§11-4/§5.9 결함 D4).
  // 모바일/태블릿의 Modal은 이미 자체 Escape+포커스 복귀를 처리하므로 isDesktop일 때만 보강한다.
  React.useEffect(() => {
    if (!isDesktop || selectedId === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelectedId(null);
      lastTriggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDesktop, selectedId]);

  function handleOpenDay(key: string) {
    pushParams({ view: "day", date: key });
  }

  /** 빈 날짜 선택(§5.6/§11-4): 그 날짜가 입력된 등록 폼을 바로 연다. write 권한 없으면 하루 보기로만 이동. */
  function handleCreateDay(key: string) {
    if (canWrite) setFormModal({ mode: "create", defaultDateKey: key });
    else handleOpenDay(key);
  }

  async function handleDelete() {
    if (!selectedEvent || busyDeleting) return;
    if (!window.confirm(`"${selectedEvent.title}" 일정을 취소(삭제)할까요?`)) return;
    setBusyDeleting(true);
    const result = await deleteEvent(businessId, selectedEvent.id);
    setBusyDeleting(false);
    if (!result.ok) {
      setBanner({ kind: "error", message: result.message });
      return;
    }
    setSelectedId(null);
    router.refresh();
  }

  function handleSaved(event: CalendarEvent) {
    setFormModal(null);
    setSelectedId(event.id);
    setBanner(null);
    router.refresh();
  }

  // 결함 수정(§5.6/§11-4): "일정 없음"·"오류"로 뷰 전체를 대체하는 분기를 없앴다.
  // 격자(월/주/일/목록)는 이벤트 상태와 무관하게 항상 그리고, 상황은 위쪽 얇은 줄로만 알린다.
  // forbidden(뷰 권한 자체가 없어진 경합 상황)만 예외적으로 몸통을 막는다 — 이건 "실패"가 아니라
  // 접근 경계라서 이전 데이터를 계속 보여주면 안 된다(그래도 상단 Toolbar/날짜 인식은 유지).
  const bodyByState = () => {
    if (eventsState.kind === "forbidden") {
      return <ForbiddenState title={eventsState.title} description={eventsState.detail} />;
    }
    if (view === "month") {
      return (
        <MonthView
          days={days}
          monthKey={dateKey.slice(0, 7)}
          todayKey={todayKey}
          events={events}
          eventKinds={industry.eventKinds}
          tz={timezone}
          selectedId={selectedId}
          onSelectEvent={selectEvent}
          onOpenDay={handleOpenDay}
          canCreate={canWrite}
          onCreateDay={handleCreateDay}
        />
      );
    }
    if (view === "week") {
      return (
        <WeekView
          days={days}
          todayKey={todayKey}
          events={events}
          eventKinds={industry.eventKinds}
          tz={timezone}
          selectedId={selectedId}
          onSelectEvent={selectEvent}
          onOpenDay={handleOpenDay}
        />
      );
    }
    if (view === "day") {
      return (
        <DayView
          days={days}
          todayKey={todayKey}
          events={events}
          eventKinds={industry.eventKinds}
          tz={timezone}
          selectedId={selectedId}
          onSelectEvent={selectEvent}
        />
      );
    }
    return (
      <ListView
        days={days}
        events={events}
        eventKinds={industry.eventKinds}
        tz={timezone}
        members={members}
        selectedId={selectedId}
        onSelectEvent={selectEvent}
      />
    );
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        view={view}
        title={title}
        eventKinds={industry.eventKinds}
        members={members}
        filters={filters}
        isPending={isPending}
        onViewChange={(v) => pushParams({ view: v })}
        onPrev={() => pushParams({ date: shiftDateKey(view, dateKey, -1) })}
        onNext={() => pushParams({ date: shiftDateKey(view, dateKey, 1) })}
        onToday={() => pushParams({ date: todayKey })}
        onFilterChange={(patch) => pushParams(patch)}
        onCreate={() => setFormModal({ mode: "create", defaultDateKey: dateKey })}
        canCreate={canWrite}
      />

      {banner && (
        <div
          className={cn(
            "mx-3 mt-3 flex items-center justify-between gap-2 rounded-[var(--r-md)] border px-3 py-2 text-[12.5px]",
            banner.kind === "error" ? "border-et/30 bg-eb text-et" : "border-okt/30 bg-okb text-okt"
          )}
        >
          <span>{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="닫기">
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {/* 결함 수정(§5.6/§11-4): 조회 실패해도 달력을 지우지 않는다 — 격자는 아래에서 계속 그리고
          여기서는 얇은 오류 줄 + 재시도만 보여준다. 이전에 불러온 적이 있으면 "오래된 상태"임을 밝힌다. */}
      {isFetchError && (
        <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-et/30 bg-eb px-3 py-2 text-[12.5px] text-et">
          <span>
            {eventsState.kind === "error" ? eventsState.title : ""}
            {eventsState.kind === "error" && eventsState.detail ? ` — ${eventsState.detail}` : ""}
            {isStaleData ? " (이전에 불러온 오래된 일정을 표시 중입니다)" : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setRetryingFetch(true);
              router.refresh();
              setTimeout(() => setRetryingFetch(false), 600);
            }}
            disabled={retryingFetch}
            className="shrink-0 rounded-[var(--r-sm)] border border-et/40 px-2.5 py-1 font-medium hover:bg-et/10 disabled:opacity-60"
          >
            {retryingFetch ? "재시도 중…" : "다시 시도"}
          </button>
        </div>
      )}

      {/* 결함 수정: 정상적으로 0건인 경우도 격자를 대체하지 않고 얇은 안내 줄만 얹는다. */}
      {!isFetchError && isEmptyResult && (
        <p className="mx-3 mt-3 rounded-[var(--r-md)] border border-[var(--bd)] bg-sf2 px-3 py-2 text-[12.5px] text-t2">
          이 기간에 일정이 없습니다. 빈 날짜를 선택하거나 상단의 &apos;일정 등록&apos; 버튼으로 첫 일정을 만들어 보세요.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-hidden">{bodyByState()}</div>

        {/* 결함 수정(§5.6/§11-9): 선택 전에는 빈 320px 패널이 본문 폭을 먹지 않게 — 선택했을 때만 렌더. */}
        {isDesktop && selectedEvent && (
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-[var(--bd)] bg-sf">
            <EventDetail
              event={selectedEvent}
              tz={timezone}
              industry={industry}
              businessId={businessId}
              members={members}
              busy={busyDeleting}
              canEdit={canWrite}
              canDelete={canDelete}
              onEdit={() => setFormModal({ mode: "edit", event: selectedEvent })}
              onDelete={handleDelete}
            />
          </aside>
        )}
      </div>

      {!isDesktop && selectedEvent && (
        <Modal open onClose={() => setSelectedId(null)} title="일정 상세" className="max-w-[420px]">
          <EventDetail
            event={selectedEvent}
            tz={timezone}
            industry={industry}
            businessId={businessId}
            members={members}
            busy={busyDeleting}
            canEdit={canWrite}
            canDelete={canDelete}
            onEdit={() => setFormModal({ mode: "edit", event: selectedEvent })}
            onDelete={handleDelete}
          />
        </Modal>
      )}

      <EventFormModal
        open={formModal !== null}
        onClose={() => setFormModal(null)}
        businessId={businessId}
        tz={timezone}
        eventKinds={industry.eventKinds}
        members={members}
        initial={formModal?.mode === "edit" ? formModal.event : null}
        defaultDateKey={formModal?.mode === "create" ? formModal.defaultDateKey : undefined}
        onSaved={handleSaved}
      />
    </div>
  );
}
