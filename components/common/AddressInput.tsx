"use client";

/**
 * 카카오 우편번호(다음 주소) 검색 입력. 키 없이 쓰는 공식 임베드 스크립트만 쓴다
 * (postcode.map.kakao.com/guide, 2026-03 도메인 변경 후 URL 확인함 — t1.kakaocdn.net).
 * 저장은 새 컬럼을 만들지 않고 기존 `address` 텍스트 컬럼에 "[우편번호] 기본주소 · 상세주소"
 * 한 줄로 합쳐 넣는다. `parseAddressValue`로 되돌려 폼을 다시 채울 수 있다.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { X, MapPin } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";

const POSTCODE_SRC = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

interface DaumPostcodeResult {
  zonecode: string;
  address: string;
  roadAddress: string;
  jibunAddress: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: {
        oncomplete: (data: DaumPostcodeResult) => void;
        width?: string | number;
        height?: string | number;
      }) => { embed: (el: HTMLElement) => void };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadPostcodeScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = POSTCODE_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("주소 검색 스크립트를 불러오지 못했습니다."));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/** "[12345] 서울 강남구 테헤란로 1 · 101동 202호" → 조각. 형식이 아니어도(기존 자유 텍스트) 전체를 detail로 돌려준다. */
export function parseAddressValue(full: string | null | undefined): { zonecode: string; base: string; detail: string } {
  if (!full) return { zonecode: "", base: "", detail: "" };
  const m = full.match(/^\[(\d{5})\]\s*(.*?)(?:\s*·\s*(.*))?$/);
  if (!m) return { zonecode: "", base: "", detail: full };
  return { zonecode: m[1] ?? "", base: m[2] ?? "", detail: m[3] ?? "" };
}

function joinAddressValue(zonecode: string, base: string, detail: string): string {
  if (!base) return detail.trim();
  const head = zonecode ? `[${zonecode}] ${base}` : base;
  return detail.trim() ? `${head} · ${detail.trim()}` : head;
}

/** 우편번호 검색 오버레이. 모바일·PC 모두 전체 화면 레이어로 띄운다(팝업 차단 회피 겸 터치 폭 확보). */
function PostcodeOverlay({ onComplete, onClose }: { onComplete: (d: DaumPostcodeResult) => void; onClose: () => void }) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    loadPostcodeScript()
      .then(() => {
        if (!alive || !hostRef.current || !window.daum) return;
        new window.daum.Postcode({
          oncomplete: (data) => onComplete(data),
          width: "100%",
          height: "100%",
        }).embed(hostRef.current);
      })
      .catch((e) => setError(e.message ?? "주소 검색을 불러오지 못했습니다."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg" role="dialog" aria-modal aria-label="주소 검색">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--bd)] px-4">
        <span className="text-[14px] font-semibold text-t">주소 검색</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="주소 검색 닫기"
          className="flex h-[40px] w-[40px] items-center justify-center rounded-[var(--r-sm)] text-t2 hover:bg-sf2"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-et">{error}</div>
      ) : (
        <div ref={hostRef} className="min-h-0 flex-1" />
      )}
    </div>,
    document.body
  );
}

export function AddressInput({
  value,
  onChange,
  label = "주소",
  required,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}) {
  const parsed = React.useMemo(() => parseAddressValue(value), [value]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(parsed.detail);

  // value가 바깥에서 바뀌면(예: 고객 상세 불러오기) detail 입력칸도 다시 맞춘다.
  React.useEffect(() => setDetail(parsed.detail), [parsed.detail]);

  const handleComplete = (d: DaumPostcodeResult) => {
    setSearchOpen(false);
    onChange(joinAddressValue(d.zonecode, d.roadAddress || d.jibunAddress || d.address, ""));
    setDetail("");
  };

  const inputId = React.useId();

  return (
    <div className={cn("mb-4", className)}>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-t2">
        {label}
        {required && <span className="ml-0.5 text-et" aria-hidden>*</span>}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          readOnly
          value={parsed.zonecode ? `[${parsed.zonecode}] ${parsed.base}` : parsed.base}
          placeholder="주소 검색을 눌러 주소를 찾으세요"
          onClick={() => setSearchOpen(true)}
          className="h-[40px] w-full min-w-0 flex-1 cursor-pointer rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 text-[16px] text-t outline-none sm:text-[13.5px] [@media(pointer:coarse)]:h-[44px]"
        />
        <Button type="button" variant="secondary" onClick={() => setSearchOpen(true)} className="shrink-0">
          <MapPin size={15} aria-hidden />
          주소 검색
        </Button>
      </div>
      <input
        aria-label="상세 주소"
        value={detail}
        onChange={(e) => {
          setDetail(e.target.value);
          onChange(joinAddressValue(parsed.zonecode, parsed.base, e.target.value));
        }}
        placeholder="상세 주소(동·호수 등)"
        className="mt-1.5 h-[40px] w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf px-3.5 text-[16px] text-t outline-none sm:text-[13.5px] [@media(pointer:coarse)]:h-[44px]"
      />
      {searchOpen && <PostcodeOverlay onComplete={handleComplete} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
