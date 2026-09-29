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
 *
 * ⚠ 성능(2026-09-29): 이 파일은 **순수 재수출만** 둔다(`export { X as Y } from …`). 여기에 객체·함수를 두면 webpack 이
 *    배럴을 건너뛰지 못해 108개 아이콘(원시 267KB)이 **로그인 포함 모든 화면**의 공통 청크로 들어갔다(실측).
 *    업종/상태 맵은 lib/icons-map.ts, 메뉴 맵은 lib/icons-nav.ts.
 */
// 아이콘별 개별 파일 import — 통합 진입점(@phosphor-icons/react/ssr)은 1,500개를 모두 읽어 dev 컴파일이 수 분 걸렸다(실측 2026-09-25).
// 셸·네비게이션
export { SquaresFourIcon as LayoutDashboard } from "@phosphor-icons/react/dist/ssr/SquaresFour";
export { CalendarDotsIcon as CalendarDays } from "@phosphor-icons/react/dist/ssr/CalendarDots";
export { UsersIcon as Users } from "@phosphor-icons/react/dist/ssr/Users";
export { PackageIcon as Package } from "@phosphor-icons/react/dist/ssr/Package";
export { ClipboardTextIcon as ClipboardList } from "@phosphor-icons/react/dist/ssr/ClipboardText";
export { StackIcon as Boxes } from "@phosphor-icons/react/dist/ssr/Stack";
export { WrenchIcon as Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
export { ScanIcon as ScanLine } from "@phosphor-icons/react/dist/ssr/Scan";
export { ReceiptIcon as Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
export { UserGearIcon as UserCog } from "@phosphor-icons/react/dist/ssr/UserGear";
export { GearIcon as Settings } from "@phosphor-icons/react/dist/ssr/Gear";
export { ListIcon as Menu } from "@phosphor-icons/react/dist/ssr/List";
export { SidebarSimpleIcon as PanelLeftClose } from "@phosphor-icons/react/dist/ssr/SidebarSimple";
export { SidebarIcon as PanelLeftOpen } from "@phosphor-icons/react/dist/ssr/Sidebar";
export { SignOutIcon as LogOut } from "@phosphor-icons/react/dist/ssr/SignOut";
export { CaretDownIcon as ChevronDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
export { CaretLeftIcon as ChevronLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
export { CaretRightIcon as ChevronRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
export { CaretUpIcon as ChevronUp } from "@phosphor-icons/react/dist/ssr/CaretUp";
export { MagnifyingGlassIcon as Search } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
export { BellIcon as Bell } from "@phosphor-icons/react/dist/ssr/Bell";
export { PlusIcon as Plus } from "@phosphor-icons/react/dist/ssr/Plus";
// 업종
export { FactoryIcon as Factory } from "@phosphor-icons/react/dist/ssr/Factory";
export { TShirtIcon as Shirt } from "@phosphor-icons/react/dist/ssr/TShirt";
export { StorefrontIcon as Store } from "@phosphor-icons/react/dist/ssr/Storefront";
export { ScissorsIcon as Scissors } from "@phosphor-icons/react/dist/ssr/Scissors";
export { GraduationCapIcon as School } from "@phosphor-icons/react/dist/ssr/GraduationCap";
// 상태·피드백
export { CheckIcon as Check } from "@phosphor-icons/react/dist/ssr/Check";
export { CheckCircleIcon as CheckCircle2 } from "@phosphor-icons/react/dist/ssr/CheckCircle";
export { XIcon as X } from "@phosphor-icons/react/dist/ssr/X";
export { WarningIcon as AlertTriangle } from "@phosphor-icons/react/dist/ssr/Warning";
export { InfoIcon as Info } from "@phosphor-icons/react/dist/ssr/Info";
export { WarningCircleIcon as CircleAlert } from "@phosphor-icons/react/dist/ssr/WarningCircle";
export { WarningIcon as TriangleAlert } from "@phosphor-icons/react/dist/ssr/Warning";
export { CircleNotchIcon as Loader2 } from "@phosphor-icons/react/dist/ssr/CircleNotch";
// 추세
export { TrendUpIcon as TrendingUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
export { TrendDownIcon as TrendingDown } from "@phosphor-icons/react/dist/ssr/TrendDown";
export { MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr/Minus";
// 폼·인증
export { EnvelopeIcon as Mail } from "@phosphor-icons/react/dist/ssr/Envelope";
export { LockIcon as Lock } from "@phosphor-icons/react/dist/ssr/Lock";
export { EyeIcon as Eye } from "@phosphor-icons/react/dist/ssr/Eye";
export { EyeSlashIcon as EyeOff } from "@phosphor-icons/react/dist/ssr/EyeSlash";
export { UserIcon as User } from "@phosphor-icons/react/dist/ssr/User";
// 업무
export { PrinterIcon as Printer } from "@phosphor-icons/react/dist/ssr/Printer";
export { QrCodeIcon as QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
export { BarcodeIcon as Barcode } from "@phosphor-icons/react/dist/ssr/Barcode";
export { CameraIcon as Camera } from "@phosphor-icons/react/dist/ssr/Camera";
export { FunnelIcon as Filter } from "@phosphor-icons/react/dist/ssr/Funnel";
export { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
export { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
export { ArrowSquareOutIcon as ExternalLink } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
export { ClockIcon as Clock } from "@phosphor-icons/react/dist/ssr/Clock";
export { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
export { RulerIcon as Ruler } from "@phosphor-icons/react/dist/ssr/Ruler";
export { PaletteIcon as Palette } from "@phosphor-icons/react/dist/ssr/Palette";
export { RadioButtonIcon as CircleDot } from "@phosphor-icons/react/dist/ssr/RadioButton";
export { PencilSimpleIcon as Pencil } from "@phosphor-icons/react/dist/ssr/PencilSimple";
export { TrashIcon as Trash2 } from "@phosphor-icons/react/dist/ssr/Trash";
export { ArrowCounterClockwiseIcon as RotateCcw } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
export { DownloadSimpleIcon as Download } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
export { UploadSimpleIcon as Upload } from "@phosphor-icons/react/dist/ssr/UploadSimple";
export { SunIcon as Sun } from "@phosphor-icons/react/dist/ssr/Sun";
export { MoonIcon as Moon } from "@phosphor-icons/react/dist/ssr/Moon";
export { FileTextIcon as FileText } from "@phosphor-icons/react/dist/ssr/FileText";
export { UserCircleIcon as CircleUserRound } from "@phosphor-icons/react/dist/ssr/UserCircle";
export { CheckSquareOffsetIcon as ClipboardCheck } from "@phosphor-icons/react/dist/ssr/CheckSquareOffset";
export { CalendarDotsIcon as CalendarClock } from "@phosphor-icons/react/dist/ssr/CalendarDots";
export { BookOpenIcon as BookOpen } from "@phosphor-icons/react/dist/ssr/BookOpen";
export { MoneyIcon as Banknote } from "@phosphor-icons/react/dist/ssr/Money";
// 신규 화면 이전분(Tabler → lucide, R4)
export { ArrowUUpLeftIcon as Undo2 } from "@phosphor-icons/react/dist/ssr/ArrowUUpLeft";
export { ArrowUUpRightIcon as Redo2 } from "@phosphor-icons/react/dist/ssr/ArrowUUpRight";
export { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
export { ProhibitIcon as Ban } from "@phosphor-icons/react/dist/ssr/Prohibit";
export { BuildingsIcon as Building2 } from "@phosphor-icons/react/dist/ssr/Buildings";
export { CalendarCheckIcon as CalendarCheck2 } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
export { CalendarPlusIcon as CalendarPlus } from "@phosphor-icons/react/dist/ssr/CalendarPlus";
export { CalendarBlankIcon as CalendarRange } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
export { CameraSlashIcon as CameraOff } from "@phosphor-icons/react/dist/ssr/CameraSlash";
export { ListChecksIcon as ListChecks } from "@phosphor-icons/react/dist/ssr/ListChecks";
export { XCircleIcon as CircleX } from "@phosphor-icons/react/dist/ssr/XCircle";
export { NotePencilIcon as ClipboardPlus } from "@phosphor-icons/react/dist/ssr/NotePencil";
export { ClockIcon as Clock4 } from "@phosphor-icons/react/dist/ssr/Clock";
export { PlayIcon as Play } from "@phosphor-icons/react/dist/ssr/Play";
export { StopCircleIcon as StopCircle } from "@phosphor-icons/react/dist/ssr/StopCircle";
export { ColumnsIcon as Columns2 } from "@phosphor-icons/react/dist/ssr/Columns";
export { FunnelXIcon as FilterX } from "@phosphor-icons/react/dist/ssr/FunnelX";
export { QuestionIcon as HelpCircle } from "@phosphor-icons/react/dist/ssr/Question";
export { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
export { TrayIcon as Inbox } from "@phosphor-icons/react/dist/ssr/Tray";
export { KeyIcon as KeyRound } from "@phosphor-icons/react/dist/ssr/Key";
export { EnvelopeOpenIcon as MailCheck } from "@phosphor-icons/react/dist/ssr/EnvelopeOpen";
export { EnvelopeSimpleIcon as MailQuestion } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
export { PackageIcon as PackagePlus } from "@phosphor-icons/react/dist/ssr/Package";
export { ArrowsClockwiseIcon as RefreshCw } from "@phosphor-icons/react/dist/ssr/ArrowsClockwise";
export { RepeatIcon as Repeat } from "@phosphor-icons/react/dist/ssr/Repeat";
export { TruckIcon as Truck } from "@phosphor-icons/react/dist/ssr/Truck";
export { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
export { VideoCameraIcon as Video } from "@phosphor-icons/react/dist/ssr/VideoCamera";
export { MagnifyingGlassPlusIcon as ZoomIn } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus";
export { MagnifyingGlassMinusIcon as ZoomOut } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassMinus";
export { CircleIcon as Circle } from "@phosphor-icons/react/dist/ssr/Circle";
// 문구 보내기/키오스크(0023 UI 연결)
export { CopyIcon as Copy } from "@phosphor-icons/react/dist/ssr/Copy";
export { ShareNetworkIcon as Share2 } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
export { ChatTextIcon as MessageSquare } from "@phosphor-icons/react/dist/ssr/ChatText";
export { PhoneIcon as Phone } from "@phosphor-icons/react/dist/ssr/Phone";
export { PaperPlaneTiltIcon as Send } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
export { BackspaceIcon as Delete } from "@phosphor-icons/react/dist/ssr/Backspace";
// 렌탈 돈 흐름(0027): 미수금 메뉴
export { HandCoinsIcon as HandCoins } from "@phosphor-icons/react/dist/ssr/HandCoins";
