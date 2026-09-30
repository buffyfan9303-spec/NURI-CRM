/**
 * 메뉴 key → 아이콘 맵. 셸(WorkspaceShell·CommandPalette)만 쓴다. lib/icons.ts 에서 분리 — 로그인 등 다른 화면이
 * 메뉴 아이콘 35개를 같이 내려받지 않게 하기 위함(분리 이유는 lib/icons.ts 머리말).
 */
import { Banknote, BookOpen, Boxes, Building2, CalendarClock, CalendarDays, CircleDot, ClipboardCheck, ClipboardList, Clock, FileText, HandCoins, LayoutDashboard, ListChecks, MailCheck, MessageSquare, Package, Receipt, Ruler, ScanLine, Scissors, Settings, TrendingUp, Upload, UserCog, UserPlus, Users, Wrench } from "@/lib/icons";

/**
 * 메뉴 key → 아이콘.
 * `lib/industry/config.ts` 의 `nav[].key` 와 1:1. 새 메뉴를 넣으면 여기도 채운다
 * (없으면 `CircleDot` 로 떨어져 눈에 띈다 — 조용히 빈 자리로 두지 않는다).
 */
export const NAV_ICON: Record<string, typeof LayoutDashboard> = {
  dash: LayoutDashboard,
  calendar: CalendarDays,
  customers: Users,
  orders: ClipboardList,
  production: Wrench,
  materials: Boxes,
  reservations: CalendarClock,
  catalog: Package,
  care: Wrench,
  scan: ScanLine,
  settlement: Receipt,
  receivables: HandCoins,
  staff: UserCog,
  products: Package,
  stock: Boxes,
  tasks: ClipboardCheck,
  sales: Banknote,
  services: Scissors,
  "staff-shift": Clock,
  students: Users,
  consultations: UserPlus,
  classes: BookOpen,
  timetable: CalendarDays,
  attendance: ClipboardCheck,
  tuition: Banknote,
  settings: Settings,
  // 0031 건물 관리비(dash·calendar·receivables·staff 는 위 기존 키 재사용)
  units: Building2,
  meters: Ruler,
  expenses: Receipt,
  billing: ClipboardCheck,
  statements: FileText,
  payments: Banknote,
  tax: MailCheck,
  requests: Wrench,
  reports: TrendingUp,
  charges: ListChecks,
  imports: Upload,
  disputes: MessageSquare,
};

export const navIcon = (key: string) => NAV_ICON[key] ?? CircleDot;
