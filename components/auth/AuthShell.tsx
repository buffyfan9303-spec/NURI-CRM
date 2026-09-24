"use client";

import * as React from "react";
import Link from "next/link";
import { Moon, Sun } from "@/lib/icons";
import { useThemeStore } from "@/lib/stores/themeStore";
import { cn } from "@/lib/utils/cn";
import { AuthArt } from "@/components/auth/AuthArt";

/**
 * 인증 화면 공통 셸 — reference-03 의 좌폼42%·우아트58% 분할(§8·§10).
 *
 * 구조(원본 §8.2 의 "반드시 닮아야 하는 큰 형태"):
 *   큰 프레임 하나
 *     ├ 좌(42%) 브랜드/테마 행 → 폼 → 하단 줄
 *     └ 우(58%) 프레임 높이 대부분을 차지하는 대형 브랜드 아트(AuthArt)
 *   프레임 밖 아래에 넓고 낮은 보라/청록 후광
 *
 * 의도적으로 하지 않는 것:
 *  - 좌측을 또 카드로 감싸지 않는다. 입력마다 그림자를 붙이지 않는다(§8.2).
 *  - 중앙 1열 PC 레이아웃으로 바꾸지 않는다. 1열은 세로 태블릿/모바일 전용이다(§10.3).
 *  - 이전 이미지02 의 주황 브랜드바/웜톤 전면 배경은 완전히 제거했다(사용자가 중단시킨 방향).
 *
 * 라우팅·데이터 페칭 없음. 테마 토글만 기존 themeStore 를 읽는다.
 */

/** §8.2·§9.2-7 — 프레임 밖 아래의 낮고 넓은 후광. 네온 테두리나 움직이는 오로라가 아니다. */
const PAGE_GLOW = [
  // 원본 실측: 청록 아우라의 최대 채도가 **우측 중하단**(y≈83%)에 있고, 보라는 **하단 중앙**이다.
  // 예전엔 좌하단·우하단 모서리에 작게 박아 뒀고 원본에 없는 우상단 청록까지 있었다(QA #6).
  "radial-gradient(52% 46% at 104% 62%, rgba(14,242,229,var(--auth-glow-op)) 0%, rgba(14,242,229,0) 74%)",
  "radial-gradient(54% 34% at 46% 108%, rgba(124,77,238,calc(var(--auth-glow-op) * .92)) 0%, rgba(124,77,238,0) 76%)",
].join(",");

const HEADLINE = ["매장의 오늘을", "한눈에 보고,", "함께 관리하세요"] as const;
const DESCRIPTION = "일정부터 주문, 재고와 정산까지. 우리 매장에 필요한 업무를 한곳에서 이어가세요.";

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
      /* 원본은 지름 36px 전후의 원형이고, 실제 hit area 는 44px 이상이어야 한다(§8.1).
         ⚠ rem 유틸(h-11 / h-9)을 쓰면 안 된다 — 이 앱은 html{font-size:14px} 이라
           Tailwind 의 rem 값이 전부 **×0.875** 로 줄어든다. h-11 은 44px 이 아니라 38.5px,
           h-9 는 36px 이 아니라 31.5px 다(QA 실측). 그래서 px 로 못 박는다. */
      className="flex h-[44px] w-[44px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)]"
    >
      <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full border border-auth-field-bd bg-auth-field text-auth-tx2 transition-colors hover:text-auth-tx">
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
  /** narrow(기본): 로그인/가입 등 폼 — 좌측 칼럼 안 444px. wide: 사업장 목록 등 — 좌측 칼럼 전체 폭(§10.2). */
  width?: "narrow" | "wide";
}) {
  return (
    /* ── 두 레이아웃, DOM 하나 ──
       lg(1024)+ : 원본03 — 바깥 차콜 바탕 + 후광, 큰 프레임(좌폼 42% / 우아트 58%). 구조는 QA 로 맞춘 그대로.
       <lg      : 휴대폰/세로 태블릿은 프레임·후광·우측 아트를 걷어낸 **앱형 단일 화면**이다.
                  브랜드 행 → 얇은 아트 띠 → 제목 → 입력 → CTA → 보조 링크 → 하단 문구.
                  (Stripe Apps FocusView: 한 작업만, 뒷배경 노출 없음 / 브리프 §1: 좌우 20px, CTA 100%·48px+) */
    /* [--acc:…]: globals.css 의 :focus-visible 링이 업무 녹색(--acc)을 쓴다. 인증 세계는 보라라 여기서만 덮는다. */
    <div className="relative min-h-dvh w-full bg-auth-frame [--acc:var(--auth-accent)] lg:flex lg:items-center lg:justify-center lg:bg-auth-page lg:px-[clamp(20px,5vw,92px)] lg:py-[clamp(16px,4vh,40px)]">
      {/* §8.2·§9.2-7 프레임 밖 후광 — PC 에서만. 휴대폰의 흰 면 위에서는 얼룩으로 보인다. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block" style={{ backgroundImage: PAGE_GLOW }} />

      {/* 큰 프레임. 1600×1200 에서 1440×1024(= 폭 90%)가 되도록 바깥 여백을 vw/vh 로 잡았다.
          높이는 뷰포트를 넘지 않게 잘라 CTA 가 화면 아래로 숨지 않게 한다(§8.1). <lg 에서는 프레임이 아니라 그냥 흐름이다. */}
      <div
        className={cn(
          "relative w-full lg:max-w-[1560px] lg:overflow-hidden lg:rounded-[24px] lg:bg-auth-frame",
          // 1560px 상한은 16:9 와이드에서 프레임이 과하게 넓어지는 걸 막는 장치다(§10.3의 1920×1080 기준).
          // 그런데 §13 의 원본 비교 크기 1824×1368 은 4:3 이라 상한에 걸려 폭이 85.5% 로 떨어졌다.
          // 4:3 이하로 납작하지 않은(= 세로가 넉넉한) 화면에서는 상한을 풀어 90% 를 유지한다.
          "[@media(max-aspect-ratio:4/3)]:max-w-none",
          // 높이를 1024px 로 못 박으면 더 큰 4:3 화면에서 프레임만 납작해진다(QA #8).
          // 원본 프레임 비율 3072/4320 = 0.7111 · 폭 90vw → 높이 64vw. 뷰포트가 모자라면 86dvh 가 이긴다.
          //   1600×1200 → min(1032, 1024) = 1024 (기존값 유지)
          //   1824×1368 → min(1176, 1167) = 1167 (원본 환산값과 일치)
          "lg:grid lg:min-h-[min(86dvh,64vw)]",
          "lg:grid-cols-[46fr_54fr] xl:grid-cols-[42fr_58fr]"
        )}
      >
        {/* ── 좌: 브랜드/테마 · 폼 · 하단 ──
            <lg 에서는 이 칼럼이 곧 화면 전체다. min-h-dvh 로 하단 문구를 바닥에 붙이고, 아래 safe-area 를 더한다. */}
        <div
          className={cn(
            "mx-auto flex w-full min-h-dvh flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]",
            "sm:px-8 sm:pt-5",
            "lg:mx-0 lg:min-h-0 lg:px-[clamp(20px,3.6vw,56px)] lg:pb-[clamp(20px,2.6vw,40px)] lg:pt-[clamp(20px,2.6vw,40px)]"
          )}
        >
          <div className={cn("mx-auto flex w-full shrink-0 items-center justify-between", width === "wide" ? "max-w-[620px]" : "max-w-[480px]", "lg:mx-0 lg:max-w-none")}>
            <Link
              href="/login"
              className="flex min-h-[44px] items-center rounded text-[24px] font-extrabold leading-none tracking-tight text-auth-tx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--auth-accent)] lg:text-[27px]"
            >
              NURI&nbsp;<span className="text-[var(--auth-accent)]">CRM</span>
            </Link>
            <AuthThemeToggle />
          </div>

          {/* 휴대폰/세로 태블릿 전용 브랜드 띠 — 우측 아트의 리본·청록 광원·격자를 96px 높이로만 보여 준다.
              문구는 넣지 않는다(폼 제목이 이 화면의 유일한 제목). */}
          <div className={cn("mx-auto mt-3 h-[120px] w-full shrink-0 sm:h-[150px]", width === "wide" ? "max-w-[620px]" : "max-w-[480px]", "lg:hidden")} aria-hidden>
            <AuthArt headline={HEADLINE} description={DESCRIPTION} strip />
          </div>

          {/* 폼 덩어리. PC 는 세로 중앙(아래 여백을 더 줘서 중심을 위로) — 원본은 필드가 3개+소셜 2개라 폼이 더 길고,
              그냥 가운데 두면 우리 폼(필드 2개)은 제목이 원본보다 한참 아래로 내려간다.
              §13 이 "로그인으로 필드 수가 달라지는 세로 위치는 별도로 판정한다"고 한 부분이다.
              <lg 는 위에서부터 흐른다(키보드가 올라와도 제목·입력이 밀리지 않게). */}
          <div className="flex flex-1 items-start justify-center pb-6 pt-7 sm:items-center sm:py-9 lg:flex-1 lg:py-[clamp(24px,4vh,56px)] lg:pb-[clamp(24px,13vh,150px)]">
            <div className={cn("w-full", width === "wide" ? "max-w-[620px]" : "max-w-[480px] lg:max-w-[444px]")}>
              {children}
            </div>
          </div>

          {/* 하단 줄. 원본 자리에는 Privacy/Terms 링크가 있지만 이 앱에는 해당 문서 라우트가 없다.
              없는 링크를 만들지 않고(§10.1 "실제 ... 링크만") 자리만 사실대로 채운다.
              개인정보/이용약관 페이지가 생기면 여기에 <Link> 두 개를 넣으면 된다. */}
          <p className="mt-6 shrink-0 text-center text-[12px] text-auth-tx2 lg:mt-0">사내 업무 시스템 · 승인된 직원만 이용합니다</p>
        </div>

        {/* ── 우: 브랜드 아트 — PC 에서만. 프레임 안쪽 24px inset. ── */}
        <div className="hidden p-[24px] pl-0 lg:block">
          <AuthArt headline={HEADLINE} description={DESCRIPTION} />
        </div>
      </div>
    </div>
  );
}
