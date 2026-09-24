/**
 * 좌측 사이드바.
 * 기존 .sidebar 의 디자인·구조·역할별 가시성을 1:1 복원.
 *
 *   - 워드마크: N(흰색) + URI(골드) + CRM(회색 spacing)
 *   - 6개 섹션 헤더(SB-SEC) + 13개 메뉴
 *   - 활성 상태: 좌측 골드 보더 + 배경
 *   - 푸터: 사용자 이름 + 로그아웃
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconLayoutDashboard,
  IconUserPlus,
  IconUsers,
  IconClipboardList,
  IconLayoutKanban,
  IconTruckDelivery,
  IconRuler2,
  IconBook,
  IconBuildingFactory2,
  IconNeedle,
  IconStack,
  IconReceipt2,
  IconSettings,
  IconX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useHasHydrated } from "@/hooks/useHasHydrated";
import { permissions } from "@/types/auth";
import { cn } from "@/lib/utils/cn";

interface MenuItem {
  href: string;
  label: string;
  icon: TablerIcon;
  /** 'all' 일 때만 노출, 'admin' 이면 관리자 전용 등. */
  visibility?: "all" | "non-retailer" | "admin-or-retailer" | "admin";
  /** 메인 카테고리(아이콘 강조) vs 하위 메뉴 */
  primary?: boolean;
}

interface MenuSection {
  label: string;
  items: MenuItem[];
}

const MENU: MenuSection[] = [
  {
    label: "메인",
    items: [
      { href: "/dashboard", label: "대시보드", icon: IconLayoutDashboard, primary: true },
    ],
  },
  {
    label: "고객 관리",
    items: [
      { href: "/customers/new", label: "고객 등록", icon: IconUserPlus },
      { href: "/customers",     label: "고객 조회", icon: IconUsers },
    ],
  },
  {
    label: "주문 · 생산",
    items: [
      { href: "/orders/new",  label: "주문 등록", icon: IconClipboardList },
      { href: "/production",  label: "생산 현황", icon: IconLayoutKanban },
      { href: "/delivery",    label: "배송 관리", icon: IconTruckDelivery },
    ],
  },
  {
    label: "MTM 치수",
    items: [
      { href: "/mtm",    label: "치수 카드", icon: IconRuler2 },
      { href: "/styles", label: "스타일 북", icon: IconBook },
    ],
  },
  {
    label: "거래처 관리",
    items: [
      { href: "/factory",     label: "공장 관리",   icon: IconBuildingFactory2 },
      { href: "/fab-vendors", label: "원단 거래처", icon: IconNeedle, visibility: "admin-or-retailer" },
    ],
  },
  {
    label: "재고 · 회계",
    items: [
      { href: "/fabrics",    label: "원단 재고", icon: IconStack,    visibility: "non-retailer" },
      { href: "/accounting", label: "회계 관리", icon: IconReceipt2, visibility: "admin-or-retailer" },
    ],
  },
  {
    label: "시스템",
    items: [
      { href: "/admin", label: "관리자 설정", icon: IconSettings, visibility: "admin" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHasHydrated();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const closeSidebar = useUIStore((s) => s.closeSidebar);

  /* 라우트 변경 시 모바일 드로어 자동 닫기 */
  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const isVisible = (vis: MenuItem["visibility"]) => {
    if (!hydrated) return true;
    switch (vis) {
      case "admin": return permissions.canAccessAdmin(user.role);
      case "admin-or-retailer": return permissions.canAccessAccount(user.role);
      case "non-retailer": return permissions.canAccessFabric(user.role);
      default: return true;
    }
  };

  /**
   * 활성 메뉴 결정 — longest-prefix-match.
   * 예) /customers/new 진입 시:
   *     - "/customers"     prefix 매치(len=10)
   *     - "/customers/new" prefix 매치(len=14) ← 우선
   * 가장 구체적인(긴) href 만 active 로 표시.
   */
  const activeHref = (() => {
    let best = "";
    for (const sec of MENU) {
      for (const it of sec.items) {
        if (pathname === it.href || pathname.startsWith(it.href + "/")) {
          if (it.href.length > best.length) best = it.href;
        }
      }
    }
    return best;
  })();

  return (
    <>
      {/* 모바일 백드롭 — 사이드바 외부 클릭 시 닫힘 */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/55 z-40"
          onClick={closeSidebar}
        />
      )}
      <nav
        className={cn(
          "w-[228px] bg-sbg flex flex-col flex-shrink-0 border-r border-white/[.04]",
          /* 모바일: 고정 위치 드로어 (기본 닫힘 → -translate-x-full) */
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50",
          "max-md:transition-transform max-md:duration-200",
          !sidebarOpen && "max-md:-translate-x-full"
        )}
      >
        {/* 헤더 — 워드마크 + 모바일 닫기 버튼 */}
        <div className="px-[18px] pt-6 pb-4 border-b border-[var(--sbbd)] relative">
          <div className="flex items-baseline gap-0 mb-1">
            <span className="text-[22px] font-black text-white tracking-[-1.2px]">N</span>
            <span className="text-[22px] font-black text-[#c8914a] tracking-[-1.2px]">URI</span>
            <span className="text-[10px] font-bold text-[#7a7774] tracking-[3px] ml-[9px] self-center uppercase">CRM</span>
          </div>
          <div className="text-[10px] text-[#6a6764] mt-0.5">맞춤양복 통합 관리</div>
          <div className="w-8 h-0.5 bg-[#c8914a] rounded mt-2.5" />
          <button
            type="button"
            onClick={closeSidebar}
            aria-label="사이드바 닫기"
            className="md:hidden absolute top-4 right-3 w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded-md"
          >
            <IconX size={18} />
          </button>
        </div>

      {/* 메뉴 */}
      <div className="flex-1 overflow-y-auto py-2.5 scrollbar-thin">
        {MENU.map((sec) => {
          const visibleItems = sec.items.filter((i) => isVisible(i.visibility));
          if (!visibleItems.length) return null;
          return (
            <div key={sec.label}>
              <SectionHeader label={sec.label} />
              {visibleItems.map((it) => (
                <SidebarItem
                  key={it.href}
                  href={it.href}
                  label={it.label}
                  Icon={it.icon}
                  active={it.href === activeHref}
                  primary={it.primary}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* 푸터 — 사용자 정보 + 로그아웃 */}
      <div className="px-[18px] py-3 border-t border-[var(--sbbd)] flex items-center justify-between">
        <div className="text-[11px] text-sbt2 flex items-center gap-[7px]">
          <div className="w-[7px] h-[7px] rounded-full bg-[#22c55e] flex-shrink-0" />
          <span>{hydrated ? user.businessName || "관리자" : "..."}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-[10px] text-[#6a6764] cursor-pointer px-2 py-1 border border-white/[.1] rounded transition-colors hover:text-sbt hover:border-white/[.2]"
        >
          로그아웃
        </button>
      </div>
    </nav>
    </>
  );
}

/* ──────────────────────────── Sub-components ──────────────────────────── */

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-[18px] pt-3.5 pb-[5px] text-[9px] font-bold uppercase tracking-[1.2px] text-sbsec flex items-center gap-1.5">
      <span>{label}</span>
      <span className="flex-1 h-px bg-[rgba(200,145,74,.2)]" />
    </div>
  );
}

function SidebarItem({
  href,
  label,
  Icon,
  active,
  primary,
}: {
  href: string;
  label: string;
  Icon: TablerIcon;
  active: boolean;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 mx-2 my-px rounded-[7px] cursor-pointer transition-colors select-none relative",
        primary
          ? "px-[18px] py-2 text-[13px]"
          : "pl-9 pr-[18px] py-[7px] text-xs rounded-[5px]",
        active
          ? cn(
              "bg-[var(--sba)] text-white",
              "border-l-[3px] border-[#c8914a]",
              primary ? "pl-[15px]" : "pl-[33px]"
            )
          : cn(
              primary ? "text-sbt" : "text-sbt2",
              "hover:bg-[var(--sbh)] hover:text-white"
            )
      )}
    >
      <Icon size={primary ? 16 : 14} className={cn("flex-shrink-0", active ? "opacity-100" : "opacity-85")} />
      <span className="flex-1">{label}</span>
    </Link>
  );
}
