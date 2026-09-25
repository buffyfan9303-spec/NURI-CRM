/**
 * 아이콘 단일 출처 — Phosphor Icons(@phosphor-icons/react, MIT · 상업적 무료, 2026-09-25 lucide 에서 교체).
 *   화면 코드는 예전 lucide 이름(예: Settings, Loader2)을 그대로 쓰고, 여기서 Phosphor 아이콘에 별칭으로 연결한다.
 *   "@phosphor-icons/react/ssr" 를 쓰는 이유: 기본 진입점은 React context 를 써서 서버 컴포넌트(홈 등)에서 깨진다.
 *
 * 왜 이 파일이 있나:
 *  1. 레퍼런스 §4.1 — "메뉴 아이콘은 **동일 라이브러리**의 18~20px 선형 아이콘.
 *     이모지와 선형 아이콘을 섞지 않는다." → 한 곳에서만 고른다.
 *  2. 이름을 각 화면에서 직접 import 하면 존재하지 않는 이름을 쓰다 런타임에 깨진다.
 *     여기 연결한 Phosphor 이름은 전부 dist/ssr 파일 목록으로 **존재를 실측**했다(107개).
 *
 * ⚠ 구 시제품 `app/(app)/**` 와 `components/{dashboard,order,customer,...}` 는
 *    동결본이라 `@tabler/icons-react` 를 그대로 쓴다. 두 팩이 병존하는 건 의도된 상태다.
 *    신규 화면에서는 **이 파일만** 쓴다.
 *
 * 크기 규약(레퍼런스 §4.1·§4.2):
 *   메뉴/본문 18px · 상단바 아이콘버튼 18~20px · 배지/인라인 14px · 빈상태 28~32px
 *   선 굵기는 Phosphor `weight`(기본 regular). strokeWidth 는 Phosphor 에서 효과가 없다.
 */
// 아이콘별 개별 파일 import — 통합 진입점(@phosphor-icons/react/ssr)은 1,500개를 모두 읽어 dev 컴파일이 수 분 걸렸다(실측 2026-09-25).
// 셸·네비게이션
import { SquaresFourIcon as LayoutDashboard } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { CalendarDotsIcon as CalendarDays } from "@phosphor-icons/react/dist/ssr/CalendarDots";
import { UsersIcon as Users } from "@phosphor-icons/react/dist/ssr/Users";
import { PackageIcon as Package } from "@phosphor-icons/react/dist/ssr/Package";
import { ClipboardTextIcon as ClipboardList } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { StackIcon as Boxes } from "@phosphor-icons/react/dist/ssr/Stack";
import { WrenchIcon as Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { ScanIcon as ScanLine } from "@phosphor-icons/react/dist/ssr/Scan";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { UserGearIcon as UserCog } from "@phosphor-icons/react/dist/ssr/UserGear";
import { GearIcon as Settings } from "@phosphor-icons/react/dist/ssr/Gear";
import { ListIcon as Menu } from "@phosphor-icons/react/dist/ssr/List";
import { SidebarSimpleIcon as PanelLeftClose } from "@phosphor-icons/react/dist/ssr/SidebarSimple";
import { SidebarIcon as PanelLeftOpen } from "@phosphor-icons/react/dist/ssr/Sidebar";
import { SignOutIcon as LogOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { CaretDownIcon as ChevronDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretLeftIcon as ChevronLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon as ChevronRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CaretUpIcon as ChevronUp } from "@phosphor-icons/react/dist/ssr/CaretUp";
import { MagnifyingGlassIcon as Search } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { BellIcon as Bell } from "@phosphor-icons/react/dist/ssr/Bell";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/ssr/Plus";
// 업종
import { FactoryIcon as Factory } from "@phosphor-icons/react/dist/ssr/Factory";
import { TShirtIcon as Shirt } from "@phosphor-icons/react/dist/ssr/TShirt";
import { StorefrontIcon as Store } from "@phosphor-icons/react/dist/ssr/Storefront";
import { ScissorsIcon as Scissors } from "@phosphor-icons/react/dist/ssr/Scissors";
import { GraduationCapIcon as School } from "@phosphor-icons/react/dist/ssr/GraduationCap";
// 상태·피드백
import { CheckIcon as Check } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircleIcon as CheckCircle2 } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { XIcon as X } from "@phosphor-icons/react/dist/ssr/X";
import { WarningIcon as AlertTriangle } from "@phosphor-icons/react/dist/ssr/Warning";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/ssr/Info";
import { WarningCircleIcon as CircleAlert } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { WarningIcon as TriangleAlert } from "@phosphor-icons/react/dist/ssr/Warning";
import { CircleNotchIcon as Loader2 } from "@phosphor-icons/react/dist/ssr/CircleNotch";
// 추세
import { TrendUpIcon as TrendingUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { TrendDownIcon as TrendingDown } from "@phosphor-icons/react/dist/ssr/TrendDown";
import { MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr/Minus";
// 폼·인증
import { EnvelopeIcon as Mail } from "@phosphor-icons/react/dist/ssr/Envelope";
import { LockIcon as Lock } from "@phosphor-icons/react/dist/ssr/Lock";
import { EyeIcon as Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { EyeSlashIcon as EyeOff } from "@phosphor-icons/react/dist/ssr/EyeSlash";
import { UserIcon as User } from "@phosphor-icons/react/dist/ssr/User";
// 업무
import { PrinterIcon as Printer } from "@phosphor-icons/react/dist/ssr/Printer";
import { QrCodeIcon as QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
import { BarcodeIcon as Barcode } from "@phosphor-icons/react/dist/ssr/Barcode";
import { CameraIcon as Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { FunnelIcon as Filter } from "@phosphor-icons/react/dist/ssr/Funnel";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { ArrowSquareOutIcon as ExternalLink } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { ClockIcon as Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { RulerIcon as Ruler } from "@phosphor-icons/react/dist/ssr/Ruler";
import { PaletteIcon as Palette } from "@phosphor-icons/react/dist/ssr/Palette";
import { RadioButtonIcon as CircleDot } from "@phosphor-icons/react/dist/ssr/RadioButton";
import { PencilSimpleIcon as Pencil } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { TrashIcon as Trash2 } from "@phosphor-icons/react/dist/ssr/Trash";
import { ArrowCounterClockwiseIcon as RotateCcw } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
import { DownloadSimpleIcon as Download } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { UploadSimpleIcon as Upload } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { SunIcon as Sun } from "@phosphor-icons/react/dist/ssr/Sun";
import { MoonIcon as Moon } from "@phosphor-icons/react/dist/ssr/Moon";
import { FileTextIcon as FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { UserCircleIcon as CircleUserRound } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { CheckSquareOffsetIcon as ClipboardCheck } from "@phosphor-icons/react/dist/ssr/CheckSquareOffset";
import { CalendarDotsIcon as CalendarClock } from "@phosphor-icons/react/dist/ssr/CalendarDots";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { MoneyIcon as Banknote } from "@phosphor-icons/react/dist/ssr/Money";
// 신규 화면 이전분(Tabler → lucide, R4)
import { ArrowUUpLeftIcon as Undo2 } from "@phosphor-icons/react/dist/ssr/ArrowUUpLeft";
import { ArrowUUpRightIcon as Redo2 } from "@phosphor-icons/react/dist/ssr/ArrowUUpRight";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ProhibitIcon as Ban } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { BuildingsIcon as Building2 } from "@phosphor-icons/react/dist/ssr/Buildings";
import { CalendarCheckIcon as CalendarCheck2 } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { CalendarPlusIcon as CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
import { CalendarBlankIcon as CalendarRange } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CameraSlashIcon as CameraOff } from "@phosphor-icons/react/dist/ssr/CameraSlash";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { XCircleIcon as CircleX } from "@phosphor-icons/react/dist/ssr/XCircle";
import { NotePencilIcon as ClipboardPlus } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { ClockIcon as Clock4 } from "@phosphor-icons/react/dist/ssr/Clock";
import { PlayIcon as Play } from "@phosphor-icons/react/dist/ssr/Play";
import { StopCircleIcon as StopCircle } from "@phosphor-icons/react/dist/ssr/StopCircle";
import { ColumnsIcon as Columns2 } from "@phosphor-icons/react/dist/ssr/Columns";
import { FunnelXIcon as FilterX } from "@phosphor-icons/react/dist/ssr/FunnelX";
import { QuestionIcon as HelpCircle } from "@phosphor-icons/react/dist/ssr/Question";
import { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { TrayIcon as Inbox } from "@phosphor-icons/react/dist/ssr/Tray";
import { KeyIcon as KeyRound } from "@phosphor-icons/react/dist/ssr/Key";
import { EnvelopeOpenIcon as MailCheck } from "@phosphor-icons/react/dist/ssr/EnvelopeOpen";
import { EnvelopeSimpleIcon as MailQuestion } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { PackageIcon as PackagePlus } from "@phosphor-icons/react/dist/ssr/Package";
import { ArrowsClockwiseIcon as RefreshCw } from "@phosphor-icons/react/dist/ssr/ArrowsClockwise";
import { RepeatIcon as Repeat } from "@phosphor-icons/react/dist/ssr/Repeat";
import { TruckIcon as Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { VideoCameraIcon as Video } from "@phosphor-icons/react/dist/ssr/VideoCamera";
import { MagnifyingGlassPlusIcon as ZoomIn } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus";
import { MagnifyingGlassMinusIcon as ZoomOut } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassMinus";
import { CircleIcon as Circle } from "@phosphor-icons/react/dist/ssr/Circle";
// 문구 보내기/키오스크(0023 UI 연결)
import { CopyIcon as Copy } from "@phosphor-icons/react/dist/ssr/Copy";
import { ShareNetworkIcon as Share2 } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
import { ChatTextIcon as MessageSquare } from "@phosphor-icons/react/dist/ssr/ChatText";
import { PhoneIcon as Phone } from "@phosphor-icons/react/dist/ssr/Phone";
import { PaperPlaneTiltIcon as Send } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { BackspaceIcon as Delete } from "@phosphor-icons/react/dist/ssr/Backspace";
// 렌탈 돈 흐름(0027): 미수금 메뉴
import { HandCoinsIcon as HandCoins } from "@phosphor-icons/react/dist/ssr/HandCoins";

export {
  LayoutDashboard,
  CalendarDays,
  Users,
  Package,
  ClipboardList,
  Boxes,
  Wrench,
  ScanLine,
  Receipt,
  UserCog,
  Settings,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  Bell,
  Plus,
  Factory,
  Shirt,
  Store,
  Scissors,
  School,
  Check,
  CheckCircle2,
  X,
  AlertTriangle,
  Info,
  CircleAlert,
  TriangleAlert,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Printer,
  QrCode,
  Barcode,
  Camera,
  Filter,
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Clock,
  MapPin,
  Ruler,
  Palette,
  CircleDot,
  Pencil,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  Sun,
  Moon,
  FileText,
  CircleUserRound,
  ClipboardCheck,
  CalendarClock,
  BookOpen,
  Banknote,
  Undo2,
  Redo2,
  ArrowLeft,
  Ban,
  Building2,
  CalendarCheck2,
  CalendarPlus,
  CalendarRange,
  CameraOff,
  ListChecks,
  CircleX,
  ClipboardPlus,
  Clock4,
  Play,
  StopCircle,
  Columns2,
  FilterX,
  HelpCircle,
  History,
  Inbox,
  KeyRound,
  MailCheck,
  MailQuestion,
  PackagePlus,
  RefreshCw,
  Repeat,
  Truck,
  UserPlus,
  Video,
  ZoomIn,
  ZoomOut,
  Circle,
  Copy,
  Share2,
  MessageSquare,
  Phone,
  Send,
  Delete,
  HandCoins,
};

/** 업종 → 아이콘. `lib/industry/config.ts` 의 `icon` 문자열이 Tabler 이름이라 여기서 변환한다. */
export const INDUSTRY_ICON = {
  factory: Factory,
  rental: Shirt, // Phosphor 2.1 에도 Hanger 가 없다(실측). 의류 = TShirt 가 가장 가깝다.
  unmanned: Store,
  salon: Scissors,
  academy: School,
} as const;

/** 알 수 없는 업종 키로 떨어질 때의 대체 아이콘. */
export const FALLBACK_ICON = Building2;

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
};

export const navIcon = (key: string) => NAV_ICON[key] ?? CircleDot;

/** 상태 → 아이콘. 색만으로 상태를 전달하지 않기 위한 짝(§5.3·dataviz). */
export const STATUS_ICON = {
  ok: CheckCircle2,
  warn: TriangleAlert,
  error: CircleAlert,
  info: Info,
} as const;

/** 레퍼런스 §4.1 기준 크기. 임의 px 을 흩뿌리지 않는다. */
export const ICON_SIZE = {
  nav: 18,
  topbar: 18,
  inline: 14,
  empty: 30,
} as const;
