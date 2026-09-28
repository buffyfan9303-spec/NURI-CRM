"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Loader2, FilterX, Filter } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { CalendarView, MemberOption } from "@/lib/domain/calendar-shared";
import { STATUS_OPTIONS } from "@/lib/domain/calendar-shared";
import { kindTagClass, memberLabel } from "./shared";
import { Segmented } from "@/components/common/Segmented";

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "day", label: "일" },
  { value: "list", label: "목록" },
];

export interface CalendarFilters {
  kinds: string[];
  assignee?: string;
  status?: string;
  q?: string;
}

export function Toolbar({
  view,
  title,
  eventKinds,
  members,
  filters,
  isPending,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onFilterChange,
  onCreate,
  canCreate,
}: {
  view: CalendarView;
  title: string;
  eventKinds: { kind: string; label: string }[];
  members: MemberOption[];
  filters: CalendarFilters;
  isPending: boolean;
  onViewChange: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onFilterChange: (patch: Partial<CalendarFilters>) => void;
  onCreate: () => void;
  canCreate: boolean;
}) {
  const [q, setQ] = React.useState(filters.q ?? "");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
  // C5: 휴대폰(<sm)은 검색·담당자·상태·종류를 "필터" 하단 시트 하나로 접는다.
  const [sheetOpen, setSheetOpen] = React.useState(false);

  React.useEffect(() => setQ(filters.q ?? ""), [filters.q]);

  function handleSearchChange(v: string) {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onFilterChange({ q: v || undefined }), 300);
  }

  const activeCount =
    (filters.kinds.length > 0 ? 1 : 0) + (filters.assignee ? 1 : 0) + (filters.status ? 1 : 0) + (filters.q && filters.q.trim() ? 1 : 0);
  const hasActiveFilters = activeCount > 0;

  function clearFilters() {
    setQ("");
    onFilterChange({ kinds: [], assignee: undefined, status: undefined, q: undefined });
  }

  function toggleKind(kind: string) {
    // kinds가 비어있으면 "전체 표시"다(칩도 전부 활성으로 보인다) — 그 상태에서 하나를 누르면
    // "그것만 뺀 나머지"가 되어야 직관적이다(눈에 켜져 보이던 게 꺼지는 것으로 느껴짐).
    const allKinds = eventKinds.map((k) => k.kind);
    const base = filters.kinds.length === 0 ? allKinds : filters.kinds;
    const set = new Set(base);
    if (set.has(kind)) set.delete(kind);
    else set.add(kind);
    // 다시 전부 선택된 상태면 굳이 URL에 남기지 않는다(빈 배열 = 기본값 = 전체).
    const next = set.size === allKinds.length ? [] : Array.from(set);
    onFilterChange({ kinds: next });
  }

  // 같은 조작을 PC 는 한 줄에, 휴대폰은 시트 안에 세로로 그린다(sheet=true 면 44px 터치 크기).
  const filterControls = (sheet: boolean) => {
    const control = cn(
      "rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf text-t outline-none focus:border-[var(--accent)] focus:shadow-ring",
      sheet ? "h-[44px] w-full px-3 text-[16px]" : "h-[36px] px-2.5 text-[12.5px] [@media(pointer:coarse)]:h-[44px]"
    );
    return (
      <>
        <div className={cn("relative", sheet && "w-full")}>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
          <input
            type="text"
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="제목·메모 검색"
            aria-label="일정 검색"
            className={cn(control, "pl-8 placeholder:text-t3", sheet ? "pr-3" : "w-[180px] pr-3 text-[13px]")}
          />
        </div>

        <select
          aria-label="담당자 필터"
          value={filters.assignee ?? ""}
          onChange={(e) => onFilterChange({ assignee: e.target.value || undefined })}
          className={control}
        >
          <option value="">담당자 전체</option>
          <option value="unassigned">미배정</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {memberLabel(m.userId, members)}
            </option>
          ))}
        </select>

        <select
          aria-label="상태 필터"
          value={filters.status ?? ""}
          onChange={(e) => onFilterChange({ status: e.target.value || undefined })}
          className={control}
        >
          <option value="">상태 전체</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="일정 종류 필터">
          {eventKinds.map((k) => {
            // 종류 필터가 비어 있으면(기본) "전체 표시" 상태 — 전부 활성으로 보여준다.
            const active = filters.kinds.length === 0 || filters.kinds.includes(k.kind);
            return (
              <button
                key={k.kind}
                type="button"
                onClick={() => toggleKind(k.kind)}
                aria-pressed={active}
                className={cn(
                  // 시각적 칩 크기는 그대로 두고, coarse 포인터에서만 44px 터치 영역을 가상 영역(::before)으로 넓힌다. 시트 안은 실제 44px.
                  // 시각적 칩 크기는 그대로, coarse 포인터에서는 실제 44px 로 키운다(측정 가능한 목표 크기).
                  "ev-tag relative min-h-[24px] justify-center transition-opacity duration-1 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]",
                  sheet && "min-h-[44px] min-w-[64px] px-4 text-[13px]",
                  kindTagClass(k.kind, eventKinds),
                  !active && "opacity-40 hover:opacity-70"
                )}
              >
                {k.label}
              </button>
            );
          })}
        </div>

        {hasActiveFilters && !sheet && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-[36px] items-center gap-1 rounded-[var(--r-md)] px-2.5 text-[12.5px] font-medium text-t2 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[44px]"
          >
            <FilterX size={14} aria-hidden />
            필터 해제
          </button>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--bd)] bg-sf p-3">
      {/* 휴대폰(<sm) 3줄: [제목 | ‹ › 오늘] / [월 주 일 목록 전폭] / [일정 등록 | 필터]. PC 는 한 줄 그대로. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 max-sm:-order-1">
          <button
            type="button"
            onClick={onPrev}
            aria-label="이전 기간"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-[var(--r-md)] text-t2 hover:bg-sf2 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="다음 기간"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-[var(--r-md)] text-t2 hover:bg-sf2 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
          <Button variant="secondary" size="sm" onClick={onToday}>
            오늘
          </Button>
        </div>

        {/* 주 보기 제목("9월 14일 (월) ~ 9월 20일 (일)")은 길어서 휴대폰에선 자르지 않고 한 줄을 통째로 쓴다. */}
        <h1 className={cn("min-w-0 flex-1 truncate text-[15px] font-semibold text-t max-sm:order-first", view === "week" && "max-sm:basis-full")}>
          {title}
          {isPending && <Loader2 size={14} className="ml-2 inline animate-spin align-middle text-t3" aria-hidden />}
        </h1>

        {/* 보기 전환 세그먼트(Cal.com 캘린더 상단과 같은 위치·모양). 휴대폰은 전폭 44px. */}
        <Segmented
          ariaLabel="캘린더 보기 전환"
          value={view}
          onChange={onViewChange}
          options={VIEW_OPTIONS}
          size="lg"
          className="max-sm:w-full [&>button]:min-w-[44px]"
        />

        <div className="flex w-full items-center gap-2 sm:contents">
          {/* 결함 #4: write 없는 사용자에게도 노출되던 버튼 — 서버는 이미 막고 있었지만(보안 문제는 아님) UX 일관성을 위해 비활성+툴팁으로 바꾼다. */}
          <Button size="sm" onClick={onCreate} disabled={!canCreate} className="max-sm:flex-1" title={canCreate ? undefined : "일정 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요."}>
            <Plus size={15} aria-hidden />
            일정 등록
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSheetOpen(true)} className="sm:hidden" aria-haspopup="dialog">
            <Filter size={15} aria-hidden />
            필터{activeCount > 0 && <span className="rounded-full bg-[var(--accent-strong)] px-1.5 text-[11.5px] font-bold text-[var(--accent-contrast)]">{activeCount}</span>}
          </Button>
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">{filterControls(false)}</div>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="필터"
        footer={
          <>
            <Button variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
              <FilterX size={14} aria-hidden />
              필터 해제
            </Button>
            <Button onClick={() => setSheetOpen(false)}>완료</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">{filterControls(true)}</div>
      </Modal>
    </div>
  );
}
