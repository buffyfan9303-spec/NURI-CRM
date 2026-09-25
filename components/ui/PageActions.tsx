import * as React from "react";
import Link from "next/link";
import { Settings } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

/**
 * 페이지 헤더 동작 줄 — 휴대폰과 PC 가 다른 배치를 쓴다(2026-09-25 사용자 지적: 모바일 버튼 줄이 들쭉날쭉).
 *
 * 레퍼런스(docs/design-references/2026-09-redesign-brief.md §1·§2, Stripe Apps / Linear 모바일):
 *  - 휴대폰(<640): 주요 동작은 같은 폭의 2열 그리드(하나뿐이면 전체 폭), 높이 44px+.
 *    "설정" 같은 관리 동작은 동작 줄에 섞지 않고 제목 오른쪽 아이콘(SettingsIconLink)으로 뺀다.
 *  - PC: 기존처럼 오른쪽 정렬 한 줄, 맨 끝에 텍스트 "설정".
 * 호출부는 주요 동작만 children 으로 넘기고, 설정은 settingsHref 로 넘긴다.
 */
export function PageActions({ children, settingsHref }: { children?: React.ReactNode; settingsHref?: string }) {
  const hasChildren = React.Children.toArray(children).filter(Boolean).length > 0;
  if (!hasChildren && !settingsHref) return null;
  return (
    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      {hasChildren && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end [&>*:only-child]:col-span-2 [&>*]:min-w-0 max-sm:[&_button]:w-full max-sm:[&_button]:min-h-[44px]">
          {children}
        </div>
      )}
      {settingsHref && (
        <Link href={settingsHref} className="hidden sm:inline-flex">
          <Button size="sm" variant="ghost">
            <Settings size={15} aria-hidden />설정
          </Button>
        </Link>
      )}
    </div>
  );
}

/** 휴대폰 전용 — 제목 줄 오른쪽의 설정 아이콘(44px). PC 는 PageActions 의 텍스트 버튼을 쓴다. */
export function SettingsIconLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="설정"
      title="설정"
      className="-mr-2 -mt-[9px] flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r-md)] text-t2 hover:bg-sf2 hover:text-t sm:hidden"
    >
      <Settings size={19} aria-hidden />
    </Link>
  );
}
