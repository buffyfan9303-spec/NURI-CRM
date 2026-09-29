"use client";

/**
 * 렌탈·무인매장 화면 공통 조각(상태 탭+건수, 검색, 페이지네이션, 카드 머리, 셀렉트, 알림줄).
 * 목록은 전부 `PageHeader → 필터 행 → Card(표|카드) → Pager` 순서를 쓰도록(§5.7) 여기 모은다.
 * 새 컴포넌트 디렉터리를 만들지 않기 위해 rental 소유 폴더 안에 둔다 — unmanned 보드도 여기서
 * 가져다 쓴다(둘 다 같은 소유자). ui 프리미티브로 승격할 후보는 보고서에 적는다.
 *
 * html{font-size:14px} 라 rem 유틸(h-9 등)이 줄어든다 — 치수는 전부 px, 터치는 44px 로 승격.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Shirt, Search, X, CircleAlert, CheckCircle2, ArrowLeft, Printer } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { ScrollHintOverlay } from "@/components/ui/ScrollHint";

/** 네이티브 select/input/textarea 공통 모양 — Input.tsx 와 같은 치수·경계·포커스(경계 강조색 + 3px 링, 디자인 시스템 §5.4). */
export const CONTROL =
  "h-[40px] w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-[16px] text-t outline-none transition-[border-color,box-shadow,background-color] duration-1 ease-out sm:text-[13.5px] hover:border-t2 focus:border-[var(--accent)] focus:shadow-ring disabled:cursor-not-allowed disabled:bg-sf2 disabled:text-t3 disabled:hover:border-[var(--bd2)] [@media(pointer:coarse)]:h-[44px]";
/** 표 안의 작은 입력(PC 32px, 터치 44px). */
export const CONTROL_SM =
  "h-[32px] rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-2 text-[16px] text-t outline-none transition-[border-color,box-shadow] duration-1 ease-out sm:text-[length:var(--fs-meta)] hover:border-t2 focus:border-[var(--accent)] focus:shadow-ring disabled:bg-sf2 disabled:text-t3 [@media(pointer:coarse)]:h-[44px]";
/** 여러 줄 입력 — CONTROL 에서 높이만 뺀다. */
export const TEXTAREA =
  "w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 py-2.5 text-[16px] leading-relaxed text-t outline-none transition-[border-color,box-shadow] duration-1 ease-out sm:text-[13.5px] hover:border-t2 focus:border-[var(--accent)] focus:shadow-ring disabled:bg-sf2 disabled:text-t3";

/**
 * 중립 pill — 상태가 아닌 분류·태그·건수(항목 상태, 업무 유형, 고객 태그, 헤더 건수)에 쓴다.
 * Badge 와 같은 치수(11.5px/600/rounded-full/안쪽 1px 링)라 한 줄에 섞여도 높이가 같다. 색으로 뜻을 나타내지 않는다.
 */
export const PILL =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sf2 px-2 py-[2px] text-[length:var(--fs-meta)] font-semibold leading-[16px] text-t2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_14%,transparent)] tabular-nums";

export function SelectField({
  label,
  required,
  hint,
  wrapperClassName,
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; wrapperClassName?: string }) {
  const id = React.useId();
  return (
    <div className={cn("mb-4", wrapperClassName)}>
      <label htmlFor={id} className="mb-1.5 block text-[length:var(--fs-body)] font-medium text-t2">
        {label}
        {required && <span className="ml-0.5 text-et" aria-hidden>*</span>}
      </label>
      <select id={id} required={required} className={cn(CONTROL, className)} {...rest}>
        {children}
      </select>
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-t3">{hint}</p>}
    </div>
  );
}

export function StatusTab({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-[32px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-sm)] border px-3 text-[length:var(--fs-meta)] font-medium transition-[background-color,border-color,color,transform] duration-1 ease-out active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] [@media(pointer:coarse)]:h-[44px]",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
          : "border-[var(--bd)] bg-sf text-t2 hover:border-[var(--bd-strong)] hover:bg-sf2 hover:text-t"
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 py-px text-[12px] tabular-nums", active ? "bg-[var(--accent-strong)] text-[var(--accent-contrast)]" : "bg-sf3 text-t3")}>
          {count}
        </span>
      )}
    </button>
  );
}

const FILTER_SCROLL = "scrollable -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0";

/**
 * 탭·검색을 한 줄에 — 휴대폰에서는 줄바꿈 대신 가로 스크롤(탭이 3줄로 쌓이지 않게).
 * 직접 자식에 `<SearchBox>` 가 있으면 <sm 에서 그 검색칸만 칩 줄 **위 전폭 한 줄**로 올린다(C2).
 * sm+ 는 자식 순서 그대로 한 줄. 호출부는 바꿀 것 없다.
 */
export function FilterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const items = React.Children.toArray(children);
  const i = items.findIndex((c) => React.isValidElement(c) && c.type === SearchBox);
  if (i < 0) return <div className={cn(FILTER_SCROLL, className)}>{children}</div>;
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5", className)}>
      <div className="flex sm:contents">{items[i]}</div>
      <div className={cn(FILTER_SCROLL, "sm:contents sm:[gap:inherit]")}>
        {i > 0 && <div className="contents sm:-order-1 sm:flex sm:flex-wrap sm:items-center sm:[gap:inherit]">{items.slice(0, i)}</div>}
        {items.slice(i + 1)}
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  onSubmit,
  className,
  ariaLabel = "검색",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** 있으면 Enter/버튼으로 제출하는 폼이 된다(서버 조회형). 없으면 즉시 필터(클라이언트형). */
  onSubmit?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const input = (
    <div className={cn("relative min-w-0 flex-1 sm:w-[260px] sm:flex-none", className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(CONTROL, "pl-9 pr-9")}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(""); }}
          aria-label="검색어 지우기"
          className="absolute right-1 top-1/2 flex h-[32px] w-[32px] -translate-y-1/2 items-center justify-center rounded-[var(--r-sm)] text-t3 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[40px] [@media(pointer:coarse)]:w-[40px]"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
  if (!onSubmit) return input;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      {input}
      <Button type="submit" size="sm" variant="secondary" className="h-[40px] [@media(pointer:coarse)]:h-[44px]">검색</Button>
    </form>
  );
}

/** "필터 초기화" 같은 보조 텍스트 동작 — 터치 44px 확보. */
export function TextAction({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex h-[32px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]", className)}
    >
      {children}
    </button>
  );
}

/** 실제로 페이지를 이동시키는 최소 페이지네이션. 필터가 바뀌면 호출부가 page를 1로 되돌려야 한다. */
export function usePager<T>(rows: T[], pageSize: number) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  return { page: clampedPage, setPage, totalPages, pageRows, start };
}

export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "flex h-[32px] w-[32px] items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] text-t2 hover:bg-sf2 disabled:opacity-40 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-t2">
      <span>
        총 {total.toLocaleString("ko-KR")}건 중 {from}–{to}건
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="이전 페이지" className={btn}>
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[52px] text-center font-medium tabular-nums text-t">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="다음 페이지" className={btn}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/** 카드 머리(레퍼런스01: 제목 15px + 한 줄 설명 + 우측 작은 링크/동작). */
export function CardHead({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[var(--fs-card)] font-semibold leading-snug text-t">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] text-t3">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** 카드 머리 우측 "전체 보기 →" 링크. */
export function ViewAll({ href, children = "전체 보기" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[32px] items-center gap-0.5 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]"
    >
      {children} <ChevronRight size={14} aria-hidden />
    </Link>
  );
}

/**
 * 표 공통 클래스 — 카드 안에서 쓴다(카드가 경계를 이미 가지므로 표에 다시 테두리를 두르지 않는다).
 * 2단계 a(Linear/Airtable 표 밀도): 머리글은 `sf2` 면 + 12px/500 `t2`(흰 면 위 5.6:1), 행은 `bd` 하이라인,
 * hover `sf2` 120ms, 행 등장은 `animate-rise`(240ms, reduced-motion 이면 전역 규칙이 0ms). 숫자 열은 호출부가 `tabular-nums text-right`.
 */
export const TABLE = "w-full border-collapse text-[length:var(--fs-body)]";
export const THEAD = "border-b border-[var(--bd)] bg-sf2/60 text-left text-[12px] font-medium text-t2";
export const TH = "h-[40px] px-3 py-2 font-medium whitespace-nowrap";
export const TR = "animate-rise border-b border-[var(--bd)] last:border-b-0 transition-[background-color] duration-1 ease-out";
export const TR_CLICK = `${TR} cursor-pointer hover:bg-sf2 focus-within:bg-sf2 active:bg-sf3`;
export const TD = "px-3 py-2.5 align-middle";
/**
 * 가로로 넘칠 수 있는 표 래퍼 — 넘칠 때만 오른쪽 끝에 그림자와 "옆으로 밀어 보기" 단서가 뜬다(D4·D7).
 * 표 머리글 줄 오른쪽 끝에 떠서 본문 금액을 가리지 않는다. 끝까지 밀면 사라진다. 카드 안쪽 여백(p-4 sm:p-5, tight 면 3.5)을 상쇄해 카드 가장자리까지 스크롤 영역을 넓힌다.
 * 단서는 absolute 라 레이아웃을 밀지 않는다(CLS 0).
 */
export function ScrollTable({ label, tight, children }: { label: string; tight?: boolean; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [more, setMore] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return (
    <div className={cn("relative", tight ? "-mx-3.5" : "-mx-4 sm:-mx-5")}>
      <div
        ref={ref}
        className={cn("overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]", tight ? "px-3.5" : "px-4 sm:px-5")}
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        {children}
      </div>
      <ScrollHintOverlay more={more} />
    </div>
  );
}
/**
 * 표 셀 안의 이름 링크/버튼(행 전체 클릭 + 실제 조작 요소 하나, §5.3). 줄상자 20px 로는 터치 기준 미달이라
 * PC 28px·터치 44px 를 세로 음수 여백으로 흡수해 행 높이(52px)를 바꾸지 않는다. 호출부는 truncate 폭만 준다.
 */
export const CELL_LINK =
  "-my-1 block max-w-full truncate text-left font-medium leading-[28px] text-t hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:leading-[44px]";

/**
 * 상세 화면 요약 줄(Stripe/Linear 상세 헤더): PageHeader 바로 아래, 핵심 수치 3~6개를 한 줄로.
 * 값은 이미 포맷된 문자열/노드. tone 은 값 색만 바꾼다(빨강=지연·미수, 초록=완료, 기본=본문).
 * 휴대폰은 2열, 태블릿 이상은 자동 채움. 카드 안 카드가 아니라 카드 하나에 구분선으로 나눈다.
 */
export function SummaryStrip({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; tone?: "default" | "danger" | "success" | "muted"; hint?: string }[];
  className?: string;
}) {
  if (items.length === 0) return null;
  const tone = { default: "text-t", danger: "text-et", success: "text-okt", muted: "text-t2" };
  return (
    // flex-wrap + 최소 폭: 마지막 줄의 칸이 남은 폭을 채워 빈 회색 칸(grid 의 빈 슬롯)이 생기지 않는다. 1px 틈이 구분선.
    <dl
      className={cn(
        "mb-4 flex flex-wrap gap-px overflow-hidden rounded-[var(--r-lg)] border border-[var(--bd)] bg-[var(--bd)] shadow-card",
        className
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0 flex-[1_1_140px] bg-sf px-4 py-3" title={it.hint}>
          <dt className="truncate text-[length:var(--fs-meta)] font-medium text-t3">{it.label}</dt>
          <dd className={cn("mt-0.5 truncate text-[15px] font-semibold tabular-nums tracking-[var(--tr-snug)]", tone[it.tone ?? "default"])}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 오류/성공/주의 인라인 알림 한 줄. */
export function Alert({ kind = "error", children, className }: { kind?: "error" | "success" | "warning"; children: React.ReactNode; className?: string }) {
  const cls = kind === "error" ? "bg-eb text-et" : kind === "success" ? "bg-okb text-okt" : "bg-wb text-wt";
  const Icon = kind === "success" ? CheckCircle2 : CircleAlert;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-[var(--r-md)] px-3.5 py-2.5 text-[length:var(--fs-meta)] leading-snug", cls, className)}>
      <Icon size={15} className="mt-[1px] shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** 상세 화면 상단 "← 목록" 링크(터치 44px). */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-ml-2 mb-1 inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[length:var(--fs-meta)] text-t3 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[44px]">
      <ArrowLeft size={14} aria-hidden />
      {children}
    </Link>
  );
}

/** 서버 컴포넌트의 ErrorState 에 붙이는 재시도 — 같은 URL 을 다시 조회한다. */
export function RetryButton({ label = "다시 시도" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      className="mt-2"
      onClick={() => {
        setBusy(true);
        router.refresh();
        window.setTimeout(() => setBusy(false), 1200);
      }}
    >
      {label}
    </Button>
  );
}

/** 인쇄 트리거. 실제 인쇄 스타일은 페이지의 @media print 가 맡는다. */
export function PrintButton({ label = "인쇄 / PDF 저장" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={15} aria-hidden />
      {label}
    </Button>
  );
}

/** 상품/개체 목록용 고정 비율 썸네일 프레임 — 실제 사진 없으면 작은 품목 아이콘, 빈 대형 칸을 만들지 않는다. */
export function Thumb({ src, code, size = 40 }: { src: string | null | undefined; code: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-sm)] border border-[var(--bd)] bg-sf2 text-t3"
      style={{ width: size, height: size }}
      title={code}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Shirt size={Math.round(size * 0.5)} aria-hidden />
      )}
    </span>
  );
}
