"use client";

import * as React from "react";
import Link from "next/link";
import { Moon, Sun } from "@/lib/icons";
import { useThemeStore } from "@/lib/stores/themeStore";
import { cn } from "@/lib/utils/cn";
import { AuthArt } from "@/components/auth/AuthArt";

/**
 * 인증 화면 공통 셸 — 넷플릭스 로그인 레이아웃(2026-09-25 사용자 지시로 이전 42:58 분할을 대체).
 *
 * 구조(넷플릭스와 같은 뼈대):
 *   sm(640)+ : 화면 전체를 덮는 브랜드 아트 배경 + 누르는 막(scrim)
 *              ├ 헤더: 좌상단 로고 · 우상단 테마 토글
 *              ├ 가운데 카드(max 450px, 넉넉한 안쪽 여백) ← 폼
 *              └ 하단 띠(반투명) — 안내 문구
 *   <sm      : 배경 아트·카드를 걷어낸 전폭 단일 화면(넷플릭스 모바일과 같음).
 *              헤더 → 폼(좌우 20px) → 경계선 위 하단 문구.
 *
 * 색은 넷플릭스의 빨강이 아니라 NURI 의 보라 CTA 를 유지한다(브랜드 모방 금지).
 * Light 는 흰 카드, Dark 는 검정 반투명 카드 — 레이아웃은 두 테마가 같다.
 * 라우팅·데이터 페칭 없음. 테마 토글만 기존 themeStore 를 읽는다.
 */

/** 배경 아트를 누르는 막. 위·아래를 조금 더 어둡게 해 로고와 하단 띠가 읽히게 한다(넷플릭스 방식). */
const SCRIM =
  "linear-gradient(180deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 72%, rgba(0,0,0,.55) 100%), var(--auth-scrim)";

function AuthThemeToggle() {
  const isDark = useThemeStore((s) => s.isDark);
  const toggle = useThemeStore((s) => s.toggle);
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      /* ⚠ rem 유틸(h-11)은 이 앱에서 ×0.875 로 줄어든다(html{font-size:14px}). px 로 못 박는다. */
      className="flex h-[44px] w-[44px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)]"
    >
      <span
        className={cn(
          "flex h-[36px] w-[36px] items-center justify-center rounded-full border transition-colors",
          // <sm 은 테마 면 위, sm+ 는 항상 어두운 아트 위라 흰 계열로 고정한다.
          "border-auth-field-bd bg-auth-field text-auth-tx2 hover:text-auth-tx",
          "sm:border-white/35 sm:bg-black/35 sm:text-white/90 sm:hover:text-white"
        )}
      >
        <Icon size={16} aria-hidden />
      </span>
    </button>
  );
}

export function AuthShell({
  children,
  width = "narrow",
}: {
  children: React.ReactNode;
  /** narrow(기본): 로그인/가입 등 폼 카드 450px. wide: 사업장 목록 등 카드 720px. */
  width?: "narrow" | "wide";
}) {
  return (
    /* [--acc:…]: globals.css 의 :focus-visible 링이 업무 녹색(--acc)을 쓴다. 인증 세계는 보라라 여기서만 덮는다. */
    <div className="relative flex min-h-dvh w-full flex-col bg-auth-frame [--acc:var(--auth-accent)] sm:bg-auth-art">
      {/* 전면 배경 아트 + 막 — sm+ 에서만. 휴대폰은 넷플릭스처럼 단색 면이다. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 hidden sm:block">
        <AuthArt headline={[]} description="" backdrop />
        <div className="absolute inset-0" style={{ background: SCRIM }} />
      </div>

      {/* 헤더 — 넷플릭스처럼 좌상단 로고. 좌우 여백은 폭에 비례(3~9%). */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-5 pt-[max(12px,env(safe-area-inset-top))] sm:px-[clamp(24px,6vw,148px)] sm:pt-6">
        <Link
          href="/login"
          className="flex min-h-[44px] items-center rounded text-[24px] font-extrabold leading-none tracking-tight text-auth-tx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--auth-accent)] sm:text-[30px] sm:text-white"
        >
          NURI&nbsp;<span className="text-[var(--auth-accent)] sm:text-[#c4a3ff]">CRM</span>
        </Link>
        <AuthThemeToggle />
      </header>

      {/* 본문 — <main> 랜드마크(Lighthouse: 로그인 화면에 main 없음 지적). */}
      <main className="relative z-10 flex flex-1 justify-center px-5 pb-8 pt-6 sm:items-start sm:px-6 sm:pb-16 sm:pt-[clamp(8px,4vh,40px)]">
        <div
          className={cn(
            "w-full [word-break:keep-all] sm:rounded-[6px] sm:bg-[var(--auth-card)] sm:shadow-[0_24px_64px_-24px_rgba(0,0,0,.6)] sm:backdrop-blur-[2px]",
            width === "wide"
              ? "max-w-[620px] sm:max-w-[720px] sm:px-[clamp(28px,5vw,56px)] sm:py-12"
              : "max-w-[480px] sm:max-w-[450px] sm:px-[clamp(28px,5vw,68px)] sm:py-12",
            "sm:min-h-[560px]"
          )}
        >
          {children}
        </div>
      </main>

      {/* 하단 띠 — sm+ 는 넷플릭스처럼 테마와 무관한 검정 반투명 띠(아트 위라 항상 어둡다). 넷플릭스는 문의·링크 모음이지만 이 앱에는 해당 문서 라우트가 없다.
          없는 링크를 만들지 않고 사실만 적는다. 약관/개인정보 페이지가 생기면 여기에 <Link> 를 추가한다. */}
      <footer className="relative z-10 shrink-0 border-t border-auth-field-bd px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-6 sm:border-t-0 sm:bg-black/75 sm:px-[clamp(24px,6vw,148px)] sm:py-8">
        <p className="text-[12.5px] text-auth-tx2 sm:text-white/75">사내 업무 시스템 · 승인된 직원만 이용합니다</p>
        <p className="mt-2 text-[12px] text-auth-tx2 sm:text-white/75">© NURI CRM</p>
      </footer>
    </div>
  );
}
