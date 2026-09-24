"use client";

import * as React from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "@/lib/icons";
import { cn } from "@/lib/utils/cn";
import { resolveSwatch } from "@/lib/garment/fabric";
import type { MaterialOption } from "@/lib/domain/factory-types";
import type { JacketSpec, PantsSpec, VestSpec } from "@/lib/garment/spec";
import { JacketSvg, type GarmentView } from "./JacketSvg";
import { PantsSvg } from "./PantsSvg";
import { VestSvg } from "./VestSvg";

export type GarmentItem = "jacket" | "pants" | "vest" | "coat";

export interface Hotspot { key: string; x: number; y: number; label: string }

const HOTSPOTS: Record<GarmentItem, Partial<Record<GarmentView, Hotspot[]>>> = {
  jacket: {
    front: [
      { key: "lapel", x: 50, y: 22, label: "라펠" },
      { key: "design", x: 68, y: 34, label: "여밈" },
      { key: "btnN", x: 50, y: 54, label: "단추" },
      { key: "hak", x: 40, y: 73, label: "주머니" },
      { key: "ticketP", x: 60, y: 67, label: "티켓포켓" },
    ],
    back: [
      { key: "shldSew", x: 50, y: 17, label: "어깨 봉제" },
      { key: "vent", x: 50, y: 88, label: "뒷트임" },
    ],
    inside: [
      { key: "lining", x: 50, y: 8, label: "안감" },
      { key: "bond", x: 50, y: 14, label: "접착" },
    ],
  },
  pants: {
    front: [
      { key: "botTuck", x: 44, y: 25, label: "앞주름" },
      { key: "botFrontP", x: 25, y: 28, label: "앞주머니" },
      { key: "obi", x: 50, y: 12, label: "오비" },
      { key: "botHem", x: 40, y: 90, label: "밑단" },
    ],
    back: [
      { key: "botBackP", x: 35, y: 30, label: "뒷주머니" },
      { key: "vCut", x: 50, y: 17, label: "V트임" },
    ],
  },
  vest: {
    front: [
      { key: "vestLapel", x: 50, y: 15, label: "라펠" },
      { key: "vestBtnN", x: 50, y: 55, label: "단추" },
      { key: "vestPocketN", x: 35, y: 65, label: "주머니" },
    ],
    back: [{ key: "vestBack", x: 50, y: 50, label: "등판" }],
  },
  coat: {},
};

const VIEWS: { key: GarmentView; label: string }[] = [
  { key: "front", label: "정면" },
  { key: "back", label: "후면" },
  { key: "inside", label: "안쪽" },
  { key: "diagram", label: "제작 도식" },
];

/** 뒷면에서만 보이는 변경 — 정면일 때 바꾸면 "후면에서 확인" 배너를 띄운다(요청 §7-5). */
export const BACK_ONLY_KEYS = new Set(["vent", "vCut", "botBackP", "vestBack"]);

export function GarmentPreview({
  item, view, jacket, pants, vest, fabric, lining, button, calibrationMm,
}: {
  item: GarmentItem;
  view: GarmentView;
  jacket: JacketSpec;
  pants: PantsSpec;
  vest: VestSpec;
  fabric: MaterialOption | null;
  lining: MaterialOption | null;
  button: MaterialOption | null;
  calibrationMm?: { w: number; h: number } | null;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const fabricSwatch = resolveSwatch(fabric, "fabric", `f-${uid}`, calibrationMm);
  const liningSwatch = resolveSwatch(lining, "lining", `l-${uid}`);
  const buttonSwatch = resolveSwatch(button, "button", `bt-${uid}`);

  if (item === "coat") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center text-[12.5px] text-t3">
        <span>코트는 별도 사양 세트가 없습니다(패턴 선택만으로 사이즈가 반영됩니다).</span>
        <span className="font-medium text-wt">기준 패턴 도식 자산 미확보 — 확인 필요</span>
      </div>
    );
  }
  if (item === "pants") return <PantsSvg spec={pants} fabric={fabricSwatch} view={view === "inside" ? "front" : view} />;
  if (item === "vest") return <VestSvg spec={vest} fabric={fabricSwatch} lining={liningSwatch} button={buttonSwatch} view={view} />;
  return <JacketSvg spec={jacket} fabric={fabricSwatch} lining={liningSwatch} button={buttonSwatch} view={view} />;
}

export function GarmentStage({
  item, view, onViewChange, jacket, pants, vest, fabric, lining, button, calibrationMm,
  onFocusField, backNotice, onDismissBackNotice, fabricLoading, compactVh,
}: {
  item: GarmentItem;
  view: GarmentView;
  onViewChange: (v: GarmentView) => void;
  jacket: JacketSpec;
  pants: PantsSpec;
  vest: VestSpec;
  fabric: MaterialOption | null;
  lining: MaterialOption | null;
  button: MaterialOption | null;
  calibrationMm?: { w: number; h: number } | null;
  onFocusField: (key: string) => void;
  backNotice: { key: string; label: string } | null;
  onDismissBackNotice: () => void;
  /** 사진 원단 decode 대기 중이면 true(오늘 기준 색상 데이터가 없어 항상 false). */
  fabricLoading?: boolean;
  /** 태블릿 세로 1열 레이아웃에서만 지정(요청 §6: "미리보기 높이는 대략 38~42vh"). */
  compactVh?: number;
}) {
  const [zoom, setZoom] = React.useState(1);
  const hotspots = item === "coat" ? [] : [
    ...(HOTSPOTS[item]?.[view] ?? []),
    ...(view === "diagram" ? [...(HOTSPOTS[item]?.front ?? []), ...(HOTSPOTS[item]?.back ?? [])] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-[var(--r-md)] bg-sf2 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onViewChange(v.key)}
              className={cn(
                "min-h-[32px] rounded-[6px] px-2.5 text-[12px] font-medium",
                view === v.key ? "bg-sf text-t shadow-sm" : "text-t3 hover:text-t2"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="축소" onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))} className="rounded-[6px] p-1.5 text-t3 hover:bg-sf2 hover:text-t"><ZoomOut size={15} /></button>
          <button type="button" aria-label="확대" onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))} className="rounded-[6px] p-1.5 text-t3 hover:bg-sf2 hover:text-t"><ZoomIn size={15} /></button>
          <button type="button" aria-label="전체 보기로 복귀" onClick={() => setZoom(1)} className="rounded-[6px] p-1.5 text-t3 hover:bg-sf2 hover:text-t"><RotateCcw size={15} /></button>
        </div>
      </div>

      {backNotice && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-[var(--r-md)] bg-eb px-3 py-1.5 text-[12px] text-et">
          <span>{backNotice.label}이(가) 변경됐습니다 — 후면에서 확인하세요.</span>
          <div className="flex items-center gap-2">
            <button type="button" className="font-semibold underline" onClick={() => { onViewChange("back"); onDismissBackNotice(); }}>후면에서 확인</button>
            <button type="button" aria-label="닫기" onClick={onDismissBackNotice} className="text-et/70">×</button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[var(--r-lg)] border border-[var(--bd)]",
          compactVh ? "flex-none" : "flex-1"
        )}
        style={{ background: "#ECEEF0", height: compactVh ? `${compactVh}vh` : undefined }}
      >
        <div className="relative aspect-[2/3] h-full max-h-full" style={{ transform: `scale(${zoom})`, transition: "transform .15s ease" }}>
          <GarmentPreview item={item} view={view} jacket={jacket} pants={pants} vest={vest} fabric={fabric} lining={lining} button={button} calibrationMm={calibrationMm} />
          {hotspots.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => onFocusField(h.key)}
              aria-label={`${h.label} 옵션 편집`}
              title={`${h.label} 편집`}
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--accent)]/70 shadow hover:bg-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
            />
          ))}
        </div>

        {fabricLoading && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-black/70 px-3 py-1 text-[11px] text-white">새 원단 불러오는 중 · 이전 미리보기</span>
          </div>
        )}
      </div>

      {hotspots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hotspots.map((h) => (
            <button
              key={`t-${h.key}`}
              type="button"
              onClick={() => onFocusField(h.key)}
              className="rounded-[6px] border border-[var(--bd)] px-2 py-1 text-[11.5px] text-t2 hover:border-[var(--accent)] hover:text-t"
            >
              {h.label} 편집
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] text-t3">디자인 미리보기 · 실제 색상은 원단 견본 기준</p>
    </div>
  );
}
