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

/** 네이티브 select/input 공통 모양 — Input.tsx 와 같은 치수·경계·포커스. */
export const CONTROL =
  "h-[40px] w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3 text-[16px] text-t outline-none transition-colors sm:text-[13.5px] focus:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50 [@media(pointer:coarse)]:h-[44px]";
/** 표 안의 작은 입력(PC 32px, 터치 44px). */
export const CONTROL_SM =
  "h-[32px] rounded-[var(--r-sm)] border border-[var(--bd2)] bg-sf px-2 text-[16px] text-t outline-none sm:text-[12.5px] focus:border-[var(--accent)] [@media(pointer:coarse)]:h-[44px]";

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
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-t2">
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
        "inline-flex h-[32px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-sm)] border px-3 text-[12.5px] font-medium transition-colors [@media(pointer:coarse)]:h-[44px]",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
          : "border-[var(--bd)] bg-sf text-t2 hover:bg-sf2 hover:text-t"
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 py-px text-[11px] tabular-nums", active ? "bg-[var(--accent-strong)] text-[var(--accent-contrast)]" : "bg-sf3 text-t3")}>
          {count}
        </span>
      )}
    </button>
  );
}

/** 탭·검색을 한 줄에 — 휴대폰에서는 줄바꿈 대신 가로 스크롤(탭이 3줄로 쌓이지 않게). */
export function FilterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("scrollable -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0", className)}>
      {children}
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
      className={cn("inline-flex h-[32px] shrink-0 items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]", className)}
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
      className="inline-flex h-[32px] items-center gap-0.5 rounded-[var(--r-sm)] px-2 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]"
    >
      {children} <ChevronRight size={14} aria-hidden />
    </Link>
  );
}

/** 표 공통 클래스 — 카드 안에서 쓴다(카드가 경계를 이미 가지므로 표에 다시 테두리를 두르지 않는다). */
export const TABLE = "w-full border-collapse text-[13px]";
export const THEAD = "border-b border-[var(--bd)] text-left text-[11.5px] font-medium text-t3";
export const TH = "px-3 py-2.5 font-medium whitespace-nowrap";
export const TR = "border-b border-[var(--bd)] last:border-b-0";
export const TR_CLICK = "border-b border-[var(--bd)] last:border-b-0 cursor-pointer transition-colors hover:bg-sf2 focus-within:bg-sf2";
export const TD = "px-3 py-2.5 align-middle";

/** 오류/성공/주의 인라인 알림 한 줄. */
export function Alert({ kind = "error", children, className }: { kind?: "error" | "success" | "warning"; children: React.ReactNode; className?: string }) {
  const cls = kind === "error" ? "bg-eb text-et" : kind === "success" ? "bg-okb text-okt" : "bg-wb text-wt";
  const Icon = kind === "success" ? CheckCircle2 : CircleAlert;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-[var(--r-md)] px-3.5 py-2.5 text-[12.5px] leading-snug", cls, className)}>
      <Icon size={15} className="mt-[1px] shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** 상세 화면 상단 "← 목록" 링크(터치 44px). */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-ml-2 mb-1 inline-flex h-[32px] items-center gap-1 rounded-[var(--r-sm)] px-2 text-[12.5px] text-t3 hover:bg-sf2 hover:text-t [@media(pointer:coarse)]:h-[44px]">
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
