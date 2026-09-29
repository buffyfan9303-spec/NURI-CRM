"use client";

/**
 * 가로로 넘치는 표의 스크롤 단서(오른쪽 그림자 + "옆으로 밀어 보기" 알약). 넘칠 때만 보이고 끝까지 밀면 사라진다.
 * 단서는 absolute 라 레이아웃을 밀지 않는다(CLS 0). `ScrollTable`(rental/listkit)과 `TableOrCards`가 같은 것을 쓴다.
 */
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function ScrollHintOverlay({ more }: { more: boolean }) {
  return (
    <div
      aria-hidden
      data-scroll-hint={more ? "on" : "off"}
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 flex w-12 items-start justify-end bg-[linear-gradient(to_left,var(--sf),transparent)] pr-2 pt-1.5 transition-opacity duration-1",
        more ? "opacity-100" : "opacity-0"
      )}
    >
      <span className="whitespace-nowrap rounded-full border border-[var(--bd)] bg-sf px-2.5 py-1 text-[length:var(--fs-meta)] font-medium text-t2 shadow-sm">
        옆으로 밀어 보기 ›
      </span>
    </div>
  );
}

/**
 * 안쪽 첫 `.overflow-x-auto` 를 스크롤 대상으로 삼아 단서를 얹는다 — 호출부의 기존 표 래퍼를 바꾸지 않고 감싸기만 한다.
 * 안에 이미 `[data-scroll-hint]`(ScrollTable)가 있으면 중복하지 않는다. 행이 바뀌거나 폰트가 늦게 로드돼도 다시 잰다.
 */
export function HintedScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [more, setMore] = React.useState(false);
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let watched: Element | null = null;
    const update = () => {
      const sc = wrap.querySelector<HTMLElement>(".overflow-x-auto");
      const own = wrap.querySelectorAll("[data-scroll-hint]").length > 1; // 자기 단서 1개 + 안쪽 ScrollTable 단서
      const child = sc?.firstElementChild ?? null;
      if (child !== watched) {
        if (watched) ro.unobserve(watched);
        if (child) ro.observe(child);
        watched = child;
      }
      setMore(!own && !!sc && sc.scrollWidth - sc.clientWidth - sc.scrollLeft > 2);
    };
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    const mo = new MutationObserver(update);
    mo.observe(wrap, { childList: true, subtree: true });
    wrap.addEventListener("scroll", update, { capture: true, passive: true });
    update();
    return () => {
      wrap.removeEventListener("scroll", update, { capture: true });
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {children}
      <ScrollHintOverlay more={more} />
    </div>
  );
}
