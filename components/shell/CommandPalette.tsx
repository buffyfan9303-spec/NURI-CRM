"use client";

/**
 * ⌘K / Ctrl+K 전역 검색(cmdk). 메뉴는 클라이언트에서, 업무 데이터는 서버 액션(lib/search)에서 찾는다.
 * PC: 가운데 팔레트 · 휴대폰(<640): 전체 화면 시트. 키보드만으로 조작 가능(↑↓ Enter Esc, 포커스 가둠 = useDialogA11y).
 * 상태: 대기(안내) / 검색 중 / 결과 / 없음 / 오류(재시도).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, CircleAlert, ArrowRight, navIcon } from "@/lib/icons";
import type { IndustryNav } from "@/lib/industry/config";
import { searchWorkspace } from "@/lib/search/actions";
import type { SearchGroup } from "@/lib/search/types";
import { cn } from "@/lib/utils/cn";
import { useDialogA11y } from "@/components/ui/useDialogA11y";

type Status = "idle" | "loading" | "ok" | "error";

const ITEM =
  "flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-[13.5px] text-t outline-none data-[selected=true]:bg-[var(--accent-soft)] data-[selected=true]:text-[var(--accent-ink)]";
const HEADING = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-t3";

export function CommandPalette({
  open,
  onClose,
  businessId,
  nav,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  nav: IndustryNav[];
}) {
  const router = useRouter();
  const base = `/w/${businessId}`;
  const ref = React.useRef<HTMLDivElement>(null);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [message, setMessage] = React.useState("");
  const [tick, setTick] = React.useState(0); // 재시도 트리거
  const reqId = React.useRef(0);

  useDialogA11y(ref, open, onClose);

  React.useEffect(() => {
    if (!open) { setQ(""); setStatus("idle"); setGroups([]); }
  }, [open]);

  const needle = q.trim();
  React.useEffect(() => {
    if (!open || !needle) { setStatus("idle"); setGroups([]); return; }
    const id = ++reqId.current;
    setStatus("loading");
    const t = window.setTimeout(async () => {
      try {
        const r = await searchWorkspace(businessId, needle);
        if (id !== reqId.current) return; // 늦게 온 응답은 버린다
        if (r.ok) { setGroups(r.groups); setStatus("ok"); }
        else { setMessage(r.message); setStatus("error"); }
      } catch {
        if (id !== reqId.current) return;
        setMessage("검색하지 못했습니다. 네트워크를 확인하세요.");
        setStatus("error");
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [open, needle, businessId, tick]);

  const menuHits = React.useMemo(
    () => (needle ? nav.filter((n) => n.label.toLowerCase().includes(needle.toLowerCase())) : nav),
    [nav, needle]
  );
  const hitCount = menuHits.length + groups.reduce((n, g) => n + g.hits.length, 0);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] sm:flex sm:items-start sm:justify-center sm:p-4 sm:pt-[10vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/45" aria-hidden onClick={onClose} />
      <Command
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="전체 검색"
        label="전체 검색"
        shouldFilter={false}
        loop
        tabIndex={-1}
        className={cn(
          "relative z-10 flex h-full w-full flex-col bg-sf outline-none",
          "sm:h-auto sm:max-h-[min(560px,80vh)] sm:w-[min(640px,100%)] sm:animate-sheet-up sm:rounded-[var(--r-xl)] sm:border sm:border-[var(--bd)] sm:shadow-modal"
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--bd)] pl-4 pr-2">
          {status === "loading" ? (
            <Loader2 size={17} className="shrink-0 animate-spin text-t3" aria-hidden />
          ) : (
            <Search size={17} className="shrink-0 text-t3" aria-hidden />
          )}
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="고객·예약·주문·상품·메뉴 검색"
            aria-label="검색어"
            className="h-[56px] min-w-0 flex-1 bg-transparent text-[16px] text-t outline-none placeholder:text-t3 sm:h-[52px] sm:text-[14px]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="검색 닫기"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--r-sm)] text-t2 hover:bg-sf2 hover:text-t"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <Command.List className={cn("scrollable min-h-0 flex-1 overflow-y-auto p-2", HEADING)}>
          {status === "error" && (
            <div role="alert" className="m-1 flex items-start gap-2 rounded-[var(--r-md)] bg-eb px-3.5 py-3 text-[13px] text-et">
              <CircleAlert size={16} className="mt-[1px] shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{message}</span>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="min-h-[32px] shrink-0 rounded-[var(--r-sm)] px-2 font-medium underline">
                다시 시도
              </button>
            </div>
          )}
          {needle && status === "ok" && hitCount === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-t3">
              &ldquo;{needle}&rdquo;에 맞는 결과가 없습니다.
            </p>
          )}
          {!needle && (
            <p className="px-3 pb-1 pt-2 text-[12px] text-t3">이름·주문번호·SKU 를 입력하세요. 아래 메뉴는 바로 이동합니다.</p>
          )}

          {groups.map((g) => (
            <Command.Group key={g.key} heading={g.label}>
              {g.hits.map((h) => (
                <Command.Item key={`${g.key}:${h.id}`} value={`${g.key}:${h.id}`} onSelect={() => go(h.href)} className={ITEM}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-[12px] text-t3">{h.subtitle}</span>}
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-t3" aria-hidden />
                </Command.Item>
              ))}
            </Command.Group>
          ))}

          {menuHits.length > 0 && (
            <Command.Group heading="메뉴">
              {menuHits.map((n) => {
                const Icon = navIcon(n.key);
                const href = n.path ? `${base}/${n.path}` : base;
                return (
                  <Command.Item key={`nav:${n.key}`} value={`nav:${n.key}`} onSelect={() => go(href)} className={ITEM}>
                    <Icon size={17} className="shrink-0 text-t2" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}
        </Command.List>

        <div className="hidden shrink-0 items-center gap-3 border-t border-[var(--bd)] px-4 py-2 text-[11.5px] text-t3 sm:flex" aria-hidden>
          <span><kbd className="rounded-[4px] border border-[var(--bd)] bg-sf2 px-1">↑↓</kbd> 이동</span>
          <span><kbd className="rounded-[4px] border border-[var(--bd)] bg-sf2 px-1">Enter</kbd> 열기</span>
          <span><kbd className="rounded-[4px] border border-[var(--bd)] bg-sf2 px-1">Esc</kbd> 닫기</span>
        </div>
      </Command>
    </div>,
    document.body
  );
}
