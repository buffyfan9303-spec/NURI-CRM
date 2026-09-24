/**
 * 대시보드 페이지.
 * 4섹션: Stats / QuickActions / Calendar / EventPanel.
 *
 * Calendar 와 EventPanel 은 selectedDay 상태를 공유 — 페이지 레벨에서 lift.
 * 이벤트의 고객 클릭은 Phase 1.6 의 CustomerDetailPanel 이 연결되기 전까지
 * 토스트로 안내.
 */
"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Topbar } from "@/components/layout/Topbar";
import { PageContent } from "@/components/layout/PageContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { DashStats } from "@/components/dashboard/DashStats";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Calendar } from "@/components/dashboard/Calendar";
import { EventPanel } from "@/components/dashboard/EventPanel";
import { DEMO_TODAY } from "@/lib/utils/dday";
import { SEED_CALENDAR_EVENTS } from "@/lib/data/seed";
import { useCustomerDetailStore } from "@/lib/stores/customerDetailStore";

export default function DashboardPage() {
  const todayYear = DEMO_TODAY.getFullYear();
  const todayMonth = DEMO_TODAY.getMonth() + 1;
  const todayDay = DEMO_TODAY.getDate();

  const [selectedDay, setSelectedDay] = useState(todayDay);
  const openCustomer = useCustomerDetailStore((s) => s.open);

  const eventDays = useMemo(
    () => Object.keys(SEED_CALENDAR_EVENTS).map(Number),
    []
  );

  const dateLabel = useMemo(
    () => format(DEMO_TODAY, "yyyy년 M월 d일 (EEEEE)", { locale: ko }),
    []
  );

  const handleCustomerClick = (name: string) => {
    openCustomer(name);
  };

  return (
    <>
      <Topbar title="대시보드">
        <span className="text-xs text-t3">{dateLabel}</span>
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <DashStats />
        <QuickActions />
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-3">
          <Calendar
            year={todayYear}
            month={todayMonth}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            eventDays={eventDays}
            todayYear={todayYear}
            todayMonth={todayMonth}
            todayDay={todayDay}
          />
          <EventPanel
            year={todayYear}
            month={todayMonth}
            selectedDay={selectedDay}
            onCustomerClick={handleCustomerClick}
          />
        </div>
      </PageContent>
    </>
  );
}
