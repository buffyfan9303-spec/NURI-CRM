"use client";

import * as React from "react";
import { Check, Search } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { resolveSwatch } from "@/lib/garment/fabric";
import type { MaterialOption } from "@/lib/domain/factory-types";

/**
 * 원단/안감/단추 스와치 그리드 — 최소 2열, 사진(패턴) 72~96px, 선택 테두리+체크+접근가능한 이름.
 * 검색 0건은 검색어 지우기 동선을 함께 보여준다(요청 §6). 새 검색엔진/가상 스크롤 도입 안 함
 * — 기존 배열 client-side filter로 충분한 규모(사업장당 자재 수십~수백 개).
 */
export function FabricGrid({
  kind, label, options, value, onChange,
}: {
  kind: "fabric" | "lining" | "button";
  label: string;
  options: MaterialOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? options.filter((o) => o.name.toLowerCase().includes(needle) || o.code.toLowerCase().includes(needle))
    : options;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[12.5px] font-semibold text-t">{label}</h4>
        {value && (
          <button type="button" className="text-[11.5px] text-t3 hover:text-t2" onClick={() => onChange("")}>
            선택 해제
          </button>
        )}
      </div>
      <div className="relative mb-2">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-t3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`${label} 코드·이름 검색`}
          className="h-8 w-full rounded-[var(--r-md)] border border-[var(--bd2)] bg-sf pl-7 pr-2 text-[12px] text-t outline-none focus:border-[var(--accent)]"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-start gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--bd)] p-3 text-[12px] text-t3">
          <span>&quot;{q}&quot;와 일치하는 {label}이 없습니다.</span>
          <button type="button" className="text-[var(--accent-ink)] hover:underline" onClick={() => setQ("")}>검색어 지우기</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))" }}>
          {filtered.map((m) => {
            const swatch = resolveSwatch(m, kind, `grid-${kind}-${m.id}`);
            const selected = value === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id)}
                aria-pressed={selected}
                aria-label={`${m.name} (${m.code})${selected ? " 선택됨" : ""}`}
                title={`${m.name} (${m.code}) · 재고 ${m.stock}${m.unit}`}
                className={cn(
                  "group flex flex-col items-center gap-1 rounded-[var(--r-md)] border-2 p-1.5 text-left",
                  selected ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--bd2)]"
                )}
              >
                <span className="relative block h-[72px] w-full overflow-hidden rounded-[6px] border border-[var(--bd)]">
                  <svg viewBox="0 0 40 40" className="h-full w-full">
                    <defs>{swatch.defs && <g dangerouslySetInnerHTML={{ __html: swatch.defs }} />}</defs>
                    <rect width="40" height="40" fill={swatch.fill} />
                  </svg>
                  {selected && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                      <Check size={11} />
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-[11px] font-medium text-t" title={m.name}>{m.name}</span>
                <span className="w-full truncate text-[10.5px] text-t3" title={m.code}>{m.code}</span>
                {!swatch.registered && <span className="text-[9.5px] text-t3">사진 미등록</span>}
                {m.stock <= m.minStock && <span className="text-[9.5px] text-wt">재고부족</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
