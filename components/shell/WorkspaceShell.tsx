"use client";

/**
 * 업종 작업공간 셸 — 사이드바 + 상단바 + 본문.
 *
 * 순수 프레젠테이션이 아니라 셸의 "조립부"다: 접근 판정(checkAccess)은 이미 서버(layout.tsx)에서
 * 끝난 뒤 결과만 props로 받는다. 여기서는 어떤 권한 판정도 하지 않는다 — nav는 이미
 * 서버가 caps로 걸러 보낸 목록이다.
 *
 * 사업장 전환은 항상 전체 페이지 이동(window.location.assign)으로 처리한다.
 * 클라이언트 캐시·상태가 이전 사업장 것으로 남는 것을 막기 위해서다(계약 준수 사항).
 *
 * 시각 기준: docs/design-references/reference-01-crm-dashboard.png +
 * NURI-CRM-레퍼런스-UIUX-상세명세.md §3·§4. 검정(`--nav`) 사이드바 + 밝은 본문.
 *
 * 사이드바 3단 반응형 (§5.2, 색만 바뀌었고 구조는 유지):
 *   <960px   오프캔버스 드로어 (mobileOpen으로 열고 닫음)
 *   960-1199 강제 rail 72px (아이콘만, 사용자 접기 불가)
 *     >=1200   기본 216px, 사용자가 접으면 72px rail(접기 상태는 localStorage에 남는다)
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  ChevronDown,
  LogOut,
  Search,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Plus,
  INDUSTRY_ICON,
  FALLBACK_ICON,
  navIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { signOut } from "@/lib/auth/actions";
import type { MyBusiness } from "@/lib/auth/actions";
import type { Industry, IndustryNav } from "@/lib/industry/config";
import { NAV_GROUP_ORDER, NAV_GROUP_LABEL, navGroupFor } from "@/components/shell/navGroups";
import { PRIMARY_ACTION } from "@/components/shell/primaryAction";

const INDUSTRY_LABEL: Record<string, string> = {
  factory: "의류공장",
  rental: "의류렌탈",
  unmanned: "무인매장",
  salon: "미용실",
  academy: "학원",
};

const SIDEBAR_COLLAPSE_KEY = "nuri_crm_sidebar_collapsed";

export interface WorkspaceShellProps {
  businessId: string;
  businessName: string;
  industry: Industry;
  roleLabel: string;
  userEmail: string;
  nav: IndustryNav[];
  myBusinesses: MyBusiness[]; // 활성 소속 전체(전환 드롭다운용)
  /** 결함 CLICK-PATH-108: 상단 CTA는 항상 write 동작이므로 write 캡 없으면 숨긴다. */
  canWrite: boolean;
  children: React.ReactNode;
}

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

type ViewportMode = "narrow" | "mid" | "wide";

/** 960px / 1200px 두 경계를 matchMedia로 추적한다. 사이드바 모드가 실제로 바뀌는지는
 *  이 값 하나로 판정한다 — CSS 브레이크포인트와 JS 라벨/툴팁 분기가 어긋나지 않게. */
function useViewportMode(): ViewportMode {
  const [mode, setMode] = React.useState<ViewportMode>("wide");
  React.useEffect(() => {
    const mqMid = window.matchMedia("(min-width: 960px)");
    const mqWide = window.matchMedia("(min-width: 1200px)");
    const update = () => setMode(mqWide.matches ? "wide" : mqMid.matches ? "mid" : "narrow");
    update();
    mqMid.addEventListener("change", update);
    mqWide.addEventListener("change", update);
    return () => {
      mqMid.removeEventListener("change", update);
      mqWide.removeEventListener("change", update);
    };
  }, []);
  return mode;
}

/** 이니셜 아바타 — 사진 없이 이메일 첫 글자만 쓴다(임의 직원 사진 생성 금지, §4.1). */
function initialOf(email: string): string {
  const c = email.trim()[0];
  return c ? c.toUpperCase() : "?";
}

export function WorkspaceShell({
  businessId,
  businessName,
  industry,
  roleLabel,
  userEmail,
  nav,
  myBusinesses,
  canWrite,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const base = `/w/${businessId}`;
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [acctMenuOpen, setAcctMenuOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [switching, setSwitching] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  const viewport = useViewportMode();
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const drawerCloseRef = React.useRef<HTMLButtonElement>(null);
  const drawerWasOpen = React.useRef(false);

  // 드로어 포커스 관리(§11 키보드): 열리면 닫기 버튼으로 초점 이동, 닫히면 연 버튼으로 복귀.
  React.useEffect(() => {
    if (mobileOpen) {
      drawerWasOpen.current = true;
      drawerCloseRef.current?.focus();
    } else if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [mobileOpen]);

  // 드로어 포커스 가둠(<960, 열림): Tab/Shift+Tab 이 드로어 안에서만 순환한다. 닫힘 상태의 탭 진입은
  // CSS(visibility:hidden)가 막는다 — JS 뷰포트 판정보다 먼저 첫 paint 에 적용되기 때문이다.
  const trapDrawerFocus = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || !mobileOpen || !isOffCanvas) return;
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')
    ).filter((n) => n.offsetParent !== null);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const switcherRef = useClickOutside<HTMLDivElement>(() => setSwitcherOpen(false));
  const userMenuRef = useClickOutside<HTMLDivElement>(() => setUserMenuOpen(false));
  const acctMenuRef = useClickOutside<HTMLDivElement>(() => setAcctMenuOpen(false));
  const notifRef = useClickOutside<HTMLDivElement>(() => setNotifOpen(false));

  // Escape로 열린 팝오버/드로어를 닫는다(§11: 키보드 접근성). 우선순위: 가장 최근에 열릴 법한
  // 좁은 팝오버부터 닫고, 모바일 드로어는 마지막에 닫는다.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (notifOpen) setNotifOpen(false);
      else if (acctMenuOpen) setAcctMenuOpen(false);
      else if (userMenuOpen) setUserMenuOpen(false);
      else if (switcherOpen) setSwitcherOpen(false);
      else if (mobileSearchOpen) setMobileSearchOpen(false);
      else if (mobileOpen) setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [notifOpen, acctMenuOpen, userMenuOpen, switcherOpen, mobileSearchOpen, mobileOpen]);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1");
    } catch {
      /* 저장값 접근 실패는 펼친 상태(기본값) 유지 */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* 저장 실패해도 이번 세션 동작은 계속 */
      }
      return next;
    });
  };

  // 960-1199는 항상 강제 rail, 1200+는 사용자 접기 상태를 따른다. <960은 오프캔버스라 rail 개념이 없다.
  const isRail = viewport === "mid" || (viewport === "wide" && collapsed);
  const isOffCanvas = viewport === "narrow";
  const canToggleCollapse = viewport === "wide";
  // 960-1199 rail은 터치 태블릿일 수 있어 44px, 1200+ 데스크톱은 36~40px(§4.1).
  const rowMinH = isOffCanvas || viewport === "mid" ? "min-h-[44px]" : "min-h-[38px] [@media(pointer:coarse)]:min-h-[44px]";

  const Icon = INDUSTRY_ICON[industry] ?? FALLBACK_ICON;

  const filteredNav = query.trim()
    ? nav.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))
    : nav;

  const groupedNav = React.useMemo(() => {
    const buckets = new Map<string, IndustryNav[]>();
    for (const item of filteredNav) {
      const g = navGroupFor(item.key);
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g)!.push(item);
    }
    return NAV_GROUP_ORDER.map((g) => ({ key: g, label: NAV_GROUP_LABEL[g], items: buckets.get(g) ?? [] })).filter(
      (g) => g.items.length > 0
    );
  }, [filteredNav]);

  const activeItem = React.useMemo(() => {
    let best: IndustryNav | null = null;
    let bestHref = "";
    for (const item of nav) {
      const href = item.path ? `${base}/${item.path}` : base;
      if (pathname === href || pathname.startsWith(href + "/")) {
        if (href.length > bestHref.length) {
          bestHref = href;
          best = item;
        }
      }
    }
    return best;
  }, [nav, base, pathname]);

  // 업종별 주요 CTA(§4.2) — 서버가 이미 권한으로 걸러 보낸 nav에 실제로 있을 때만 그린다.
  const primaryAction = PRIMARY_ACTION[industry];
  // canWrite 게이팅: nav 항목 자체는 view 캡만으로도 존재하므로(예: 공장 orders),
  // CTA는 이 화면들의 실제 "등록" 동작이라 write 캡이 없으면 보여주지 않는다.
  const primaryActionNavItem = primaryAction && canWrite ? nav.find((n) => n.key === primaryAction.navKey) : undefined;
  const primaryActionHref = primaryActionNavItem
    ? `${base}/${primaryAction!.subPath ?? primaryActionNavItem.path}`
    : undefined;

  const otherBusinesses = myBusinesses.filter((b) => b.id !== businessId);

  const gotoBusiness = (id: string) => {
    if (id === businessId) {
      setSwitcherOpen(false);
      return;
    }
    setSwitching(true);
    // 전체 페이지 이동 — 이전 사업장의 클라이언트 캐시/상태를 남기지 않는다.
    window.location.assign(`/w/${id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 min-[960px]:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {switching && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/70 backdrop-blur-sm">
          <p className="text-[13px] text-t2">사업장을 전환하는 중…</p>
        </div>
      )}

      {/* 사이드바 — 검정(§4.1). 라이트 테마에서도 항상 --nav(#090909)를 유지한다. */}
      <nav
        aria-label="주 메뉴"
        role={isOffCanvas && mobileOpen ? "dialog" : undefined}
        aria-modal={isOffCanvas && mobileOpen ? true : undefined}
        onKeyDown={trapDrawerFocus}
        className={cn(
          "flex shrink-0 flex-col bg-nav",
          // 닫힘: visibility:hidden 을 슬라이드가 끝난 뒤(200ms 지연) 적용해 탭 진입을 막는다.
          // 열림: visibility 전환이 없어(기본 transition-transform) 즉시 보이고, 그래서 열림 직후 effect 의
          // focus() 가 성공한다(visibility 를 같이 전환하면 t=0 에 아직 hidden 이라 초점이 안 들어간다 — 실측).
          "fixed inset-y-0 left-0 z-50 w-[var(--drawer-w)] transition-transform duration-200",
          mobileOpen
            ? "translate-x-0 shadow-panel"
            : "-translate-x-full max-[959px]:invisible max-[959px]:[transition:transform_200ms,visibility_0s_200ms]",
          "min-[960px]:static min-[960px]:w-[var(--rail-w)] min-[960px]:translate-x-0 min-[960px]:shadow-none",
          collapsed ? "min-[1200px]:w-[var(--rail-w)]" : "min-[1200px]:w-[var(--sidebar-w)]"
        )}
      >
        {/* 브랜드 — 녹색 마크 + 2줄(제품명/현재 업종), 높이 56px, 하단 얇은 경계 */}
        <div className="flex h-[56px] items-center gap-2.5 border-b border-[var(--nav-bd)] px-3.5">
          <div
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[13px] font-bold text-[var(--accent-contrast)]"
            style={{ background: "var(--accent-strong)" }}
          >
            N
          </div>
          {!isRail && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13.5px] font-semibold text-sbt">NURI CRM</div>
              <div className="truncate text-[10.5px] text-[var(--sbt2)]">
                {INDUSTRY_LABEL[industry] ?? industry}
              </div>
            </div>
          )}
          <button
            ref={drawerCloseRef}
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="메뉴 닫기"
            className="ml-auto flex h-[44px] w-[44px] items-center justify-center rounded-[var(--r-sm)] text-[var(--sbt2)] hover:bg-[var(--sbh)] hover:text-sbt min-[960px]:hidden"
          >
            <X size={18} aria-hidden />
          </button>
          {canToggleCollapse && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
              title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
              className={cn(
                "hidden h-[32px] w-[32px] items-center justify-center rounded-[var(--r-sm)] text-[var(--sbt2)] hover:bg-[var(--sbh)] hover:text-sbt min-[1200px]:flex",
                isRail ? "ml-auto" : ""
              )}
            >
              {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollable py-2">
          {filteredNav.length === 0 && !isRail && (
            <p className="px-4 py-3 text-[12px] text-[var(--sbt2)]">일치하는 메뉴가 없습니다.</p>
          )}
          {groupedNav.map((group, gi) => (
            <div key={group.key} className={cn(gi > 0 && "mt-1")}>
              {!isRail && (
                <p className="px-4 pb-2 pt-5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--sbt2)]">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const href = item.path ? `${base}/${item.path}` : base;
                const active = activeItem?.key === item.key;
                const ItemIcon = navIcon(item.key);
                return (
                  <Link
                    key={item.key}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    title={isRail ? item.label : undefined}
                    className={cn(
                      "mx-2.5 my-0.5 flex items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-[13.5px] transition-colors",
                      rowMinH,
                      isRail && "justify-center px-0",
                      active
                        ? "bg-[var(--nav-active)] font-medium text-[var(--sbact)]"
                        : "text-[var(--sbt2)] hover:bg-[var(--sbh)] hover:text-sbt"
                    )}
                  >
                    <ItemIcon size={19} className="shrink-0" aria-hidden />
                    {isRail ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* 계정 영역 — 얇은 위 경계 + 이니셜 아바타 + 이름·역할(§4.1). 상단 계정 메뉴와
            같은 기능(이메일 확인·로그아웃)을 제공한다. */}
        <div className="relative border-t border-[var(--nav-bd)] p-2.5" ref={acctMenuRef}>
          <button
            type="button"
            onClick={() => setAcctMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={acctMenuOpen}
            className={cn(
              // min-h 44: p-1.5(5.25px)+32px 아바타 = 42.5px 라 1024 rail 터치에서 미달이던 버튼.
              "flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--r-sm)] p-1.5 text-left hover:bg-[var(--sbh)]",
              isRail && "justify-center"
            )}
          >
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-[var(--nav-active)] text-[12.5px] font-semibold text-[var(--sbact)]">
              {initialOf(userEmail)}
            </span>
            {!isRail && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-sbt">{userEmail}</span>
                <span className="block truncate text-[10.5px] text-[var(--sbt2)]">{roleLabel}</span>
              </span>
            )}
          </button>
          {acctMenuOpen && (
            <div
              role="menu"
              className={cn(
                "absolute bottom-full z-50 mb-1.5 w-[220px] rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf py-1.5 shadow-modal",
                isRail ? "left-full ml-2" : "left-2.5 right-2.5 w-auto"
              )}
            >
              <p className="truncate px-3 pb-0.5 pt-1 text-[12px] text-t3">{userEmail}</p>
              <p className="truncate px-3 pb-1.5 text-[11px] text-t3">{roleLabel}</p>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex min-h-[44px] w-full items-center gap-2 px-3 text-[13px] text-t2 hover:bg-sf2 hover:text-t"
              >
                <LogOut size={15} aria-hidden />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative flex h-[var(--topbar-h)] shrink-0 items-center gap-1 border-b border-[var(--bd)] bg-topbar pl-2 pr-2 sm:gap-2 sm:pl-3 sm:pr-3 md:px-4">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={mobileOpen}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r-md)] text-t2 hover:bg-sf2 min-[960px]:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>

          {/* 사업장 전환 */}
          <div className="relative shrink-0" ref={switcherRef}>
            <button
              type="button"
              onClick={() => setSwitcherOpen((v) => !v)}
              aria-haspopup={otherBusinesses.length > 0 ? "menu" : undefined}
              aria-expanded={otherBusinesses.length > 0 ? switcherOpen : undefined}
              aria-label={`현재 사업장 ${businessName}`}
              title={businessName}
              className="flex min-h-[44px] items-center gap-2 rounded-[var(--r-md)] px-1.5 text-left hover:bg-sf2 sm:px-2"
            >
              <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--accent-soft)] text-[var(--accent-ink)]">
                <Icon size={16} aria-hidden />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-[180px] truncate text-[13.5px] font-medium text-t">
                  {businessName}
                </span>
                <span className="block truncate text-[10.5px] text-t3">
                  {INDUSTRY_LABEL[industry] ?? industry}
                </span>
              </span>
              {otherBusinesses.length > 0 && (
                <ChevronDown size={14} className="text-t3" aria-hidden />
              )}
            </button>

            {switcherOpen && otherBusinesses.length > 0 && (
              <div className="absolute left-0 top-full z-50 mt-1 w-[240px] rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf py-1.5 shadow-modal">
                <p className="px-3 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-wide text-t3">
                  사업장 전환
                </p>
                {myBusinesses.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => gotoBusiness(b.id)}
                    className="flex min-h-[40px] w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-sf2 [@media(pointer:coarse)]:min-h-[44px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-t">{b.name}</span>
                    {b.id === businessId && <Check size={14} className="text-[var(--accent-ink)]" aria-hidden />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 현재 위치 — 활성 nav 항목 라벨. 휴대폰(<640)에서는 사업장명이 숨으므로 이게 화면 제목이다. */}
          {activeItem && (
            <span className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <span className="hidden text-t3 sm:inline" aria-hidden>
                /
              </span>
              <span className="truncate text-[14px] font-semibold text-t sm:text-[13px] sm:font-medium sm:text-t2">{activeItem.label}</span>
            </span>
          )}

          <div className={cn("flex-1", activeItem && "hidden sm:block")} />

          {/* 검색 — 사이드바 메뉴 필터. 통합검색이 아니라 메뉴 검색임을 정확히 표시한다(§4.2). */}
          <div className="relative hidden w-full min-w-[140px] max-w-[260px] md:block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="메뉴 검색"
              aria-label="메뉴 검색"
              className="h-[var(--ctl)] w-full rounded-full border border-[var(--bd2)] bg-sf pl-8 pr-3 text-[13px] text-t outline-none placeholder:text-t3 focus:border-[var(--accent)] [@media(pointer:coarse)]:h-[44px]"
            />
          </div>

          {/* 좁은 화면 — 검색을 버튼+패널로 접는다(§4.2). */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="메뉴 검색 열기"
            aria-expanded={mobileSearchOpen}
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r-md)] text-t2 hover:bg-sf2 md:hidden"
          >
            <Search size={20} aria-hidden />
          </button>

          {/* 우측 클러스터: CTA → 테마 → 알림 → 계정 순(§4.2) */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {primaryActionNavItem && (
              <Link
                href={primaryActionHref!}
                className="hidden h-[var(--ctl)] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-[var(--accent-strong)] px-3.5 text-[13px] font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] sm:inline-flex [@media(pointer:coarse)]:h-[44px]"
              >
                <Plus size={15} aria-hidden />
                {primaryAction!.label}
              </Link>
            )}

            <ThemeToggle />

            {/* 알림 — 실제 미확인 알림 데이터가 연결되기 전이므로 점 배지 없이 빈 상태만 보여준다(§4.2). */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={notifOpen}
                aria-label="알림"
                title="알림"
                className="flex h-[36px] w-[36px] items-center justify-center rounded-full border border-[var(--bd)] bg-sf text-t2 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
              >
                <Bell size={16} aria-hidden />
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-[240px] rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf py-3 shadow-modal">
                  <p className="px-3.5 text-[12.5px] font-medium text-t">알림</p>
                  <p className="px-3.5 pt-1.5 text-[12px] leading-relaxed text-t3">새 알림이 없습니다.</p>
                </div>
              )}
            </div>

            {/* 사용자 메뉴 — 휴대폰(<640)에서는 숨긴다. 드로어 하단 계정 영역이 같은 기능(이메일·로그아웃)이다. */}
            <div className="relative hidden sm:block" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`계정 메뉴 ${userEmail}`}
                className="flex h-[36px] items-center gap-1.5 rounded-[var(--r-md)] px-2 text-t2 hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]"
              >
                <span className="hidden max-w-[140px] truncate text-[12.5px] lg:block">{userEmail}</span>
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11.5px] font-semibold text-[var(--accent-ink)] lg:hidden" aria-hidden>
                  {initialOf(userEmail)}
                </span>
                <ChevronDown size={14} aria-hidden />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-[200px] rounded-[var(--r-lg)] border border-[var(--bd)] bg-sf py-1.5 shadow-modal">
                  <p className="truncate px-3 pb-0.5 pt-1 text-[12px] text-t3">{userEmail}</p>
                  <p className="truncate px-3 pb-1.5 text-[11px] text-t3">{roleLabel}</p>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 text-[13px] text-t2 hover:bg-sf2 hover:text-t"
                  >
                    <LogOut size={15} aria-hidden />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>

          {mobileSearchOpen && (
            <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--bd)] bg-topbar p-3 md:hidden">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- 사용자가 명시적으로 연 검색 패널이라 포커스 이동이 기대된다 */}
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="메뉴 검색"
                  aria-label="메뉴 검색"
                  className="h-[44px] w-full rounded-full border border-[var(--bd2)] bg-sf pl-8 pr-3 text-[13px] text-t outline-none placeholder:text-t3 focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
