/**
 * 아직 마이그레이션되지 않은 뷰의 임시 페이지.
 * Phase 1.5~1.8 에서 각 뷰를 구현하며 이 스텁을 교체한다.
 */
"use client";

import { Topbar } from "./Topbar";
import { PageContent } from "./PageContent";
import { ThemeToggle } from "./ThemeToggle";
import { IconHourglassHigh } from "@tabler/icons-react";

export function PlaceholderPage({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <>
      <Topbar title={title}>
        <ThemeToggle />
      </Topbar>
      <PageContent>
        <div className="flex flex-col items-center justify-center text-center py-24 text-t3">
          <IconHourglassHigh size={48} className="opacity-30 mb-3" />
          <div className="text-base font-bold mb-1 text-t2">준비중</div>
          <div className="text-xs">{phase} 에서 구현 예정</div>
        </div>
      </PageContent>
    </>
  );
}
