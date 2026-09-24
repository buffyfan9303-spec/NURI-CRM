import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * 페이지 헤더 공통 패턴(레퍼런스01 상단: 제목 22px + 한 줄 설명 + 우측 동작).
 *
 *   <PageHeader title="예약" description="오늘 처리할 예약과 대여 일정" actions={<Button>새 예약</Button>} />
 *
 * - 제목은 페이지의 유일한 <h1>. 상단바가 이미 사업장/현재 위치를 보여주므로 여기서 사업장명을 반복하지 않는다.
 * - actions 는 오른쪽 정렬. 휴대폰(<640)에서는 제목 아래로 내려가 가로로 늘어난다 — 버튼이 2개를 넘으면
 *   호출부에서 보조 동작을 메뉴로 접는다(헤더에 버튼을 나열해 두 줄로 흘리지 않는다).
 * - 상단바의 업종 CTA(WorkspaceShell)와 같은 동작이면 여기서 다시 그리지 않는다. 한 화면에 같은 버튼 두 개 금지.
 * - meta: 제목 오른쪽의 작은 배지/카운트(예: 상태 뱃지). children: 헤더 아래 탭/필터 행.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4 sm:mb-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-bold leading-tight tracking-tight text-t sm:text-[var(--fs-page)]">{title}</h1>
            {meta}
          </div>
          {description && <p className="mt-1 text-[13px] leading-snug text-t2">{description}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}

/**
 * 본문 컨테이너 — 셸의 <main> 바로 아래에서 한 번만 쓴다. 좌우 16px(휴대폰·세로 태블릿) / 20px(PC),
 * 아래는 safe-area 만큼 더 띄운다. 페이지가 자체 padding 을 또 주지 않는다(중첩 여백 금지).
 */
export function PageBody({
  children,
  className,
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** 표/캘린더처럼 가용 폭을 전부 써야 하면 true. 기본은 1600px 에서 멈춘다(§11 1920 기준). */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-[var(--page-x)] sm:py-[var(--page-y)]",
        !wide && "max-w-[1600px]",
        className
      )}
    >
      {children}
    </div>
  );
}
