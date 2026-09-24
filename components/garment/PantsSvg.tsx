"use client";

import type { PantsSpec } from "@/lib/garment/spec";
import type { ResolvedSwatch } from "@/lib/garment/fabric";
import { PANTS_BODY_D, PANTS_WAIST_D } from "./shapes";
import type { GarmentView } from "./JacketSvg";

/** 바지 앞/뒤 — 같은 외곽선 공유(shapes.ts). 도식 뷰는 무채색 선화. */
export function PantsSvg({ spec, fabric, view }: { spec: PantsSpec; fabric: ResolvedSwatch; view: GarmentView }) {
  const isDiagram = view === "diagram";
  const isBack = view === "back";
  const stroke = isDiagram ? "#1f2937" : "#0d1a2b";
  const dl = isDiagram ? "#374151" : "#33465c";
  const fill = isDiagram ? "#eef1f3" : fabric.fill;

  return (
    <svg viewBox="0 0 180 216" className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`바지 ${isBack ? "후면" : isDiagram ? "제작 도식" : "정면"}`}>
      <defs>{!isDiagram && fabric.defs && <g dangerouslySetInnerHTML={{ __html: fabric.defs }} />}</defs>
      <path d={PANTS_BODY_D} fill={fill} stroke={stroke} strokeWidth={2} />
      <path d={PANTS_WAIST_D} fill={isDiagram ? "#e5e9ec" : fabric.fill} stroke={stroke} strokeWidth={2} data-hotspot="obi" />
      <circle cx={90} cy={31} r={2.4} fill={stroke} />

      {!isBack && (
        <g data-hotspot="botTuck" stroke={dl} strokeWidth={2} fill="none">
          {/* 역주름은 옆선 쪽으로 열리므로 선을 바깥으로 옮기고 윗부분에 꺾임 표시를 단다 */}
          {spec.pleats >= 1 && (spec.pleatReverse
            ? (<><path d="M58 44 l4 4 V92" /><path d="M122 44 l-4 4 V92" /></>)
            : (<><line x1={64} y1={44} x2={64} y2={92} /><line x1={116} y1={44} x2={116} y2={92} /></>))}
          {spec.pleats >= 2 && (spec.pleatReverse
            ? (<><path d="M50 44 l4 4 V84" strokeWidth={1.5} /><path d="M130 44 l-4 4 V84" strokeWidth={1.5} /></>)
            : (<><line x1={74} y1={44} x2={74} y2={84} strokeWidth={1.5} /><line x1={106} y1={44} x2={106} y2={84} strokeWidth={1.5} /></>))}
        </g>
      )}

      {!isBack && (
        <g data-hotspot="botFrontP" stroke={dl} strokeWidth={2.4} fill="none">
          {spec.frontPocket === "사이드" && (<><line x1={44} y1={48} x2={44} y2={74} /><line x1={136} y1={48} x2={136} y2={74} /></>)}
          {spec.frontPocket === "슬랜티드" && (<><line x1={44} y1={48} x2={60} y2={72} /><line x1={136} y1={48} x2={120} y2={72} /></>)}
          {spec.frontPocket === "입술" && (<><path d="M44 48 V74 M48 48 V74" strokeWidth={1.4} /><path d="M136 48 V74 M132 48 V74" strokeWidth={1.4} /></>)}
          {spec.frontPocket === "크로스" && (<><line x1={44} y1={64} x2={64} y2={64} /><line x1={136} y1={64} x2={116} y2={64} /></>)}
        </g>
      )}

      {isBack && (
        <g data-hotspot="botBackP" stroke={dl} strokeWidth={1.5} fill="none">
          <path d="M64 42 L66 70 M116 42 L114 70" strokeDasharray="2 2" strokeWidth={1} />
          {spec.backPocket !== "없음" && (
            <>
              {/* 한쪽 = 오른쪽 뒷주머니 하나(뒤에서 본 그림 기준 왼쪽 칸은 비움) */}
              {spec.backPocket !== "한쪽" && <path d="M50 60 H80 V70 H50 Z" />}
              <path d="M100 60 H130 V70 H100 Z" />
              {spec.backPocket === "양쪽-후다" && (<><path d="M50 60 L65 68 L80 60" /><path d="M100 60 L115 68 L130 60" /></>)}
              {spec.backPocket === "양쪽-단추" && (<><circle cx={65} cy={65} r={2} fill={dl} /><circle cx={115} cy={65} r={2} fill={dl} /></>)}
            </>
          )}
        </g>
      )}

      {(spec.hem === "턴업" || spec.hem === "카브라") && (
        <g data-hotspot="botHem" stroke={dl} strokeWidth={2}>
          <line x1={48} y1={196} x2={84} y2={196} /><line x1={96} y1={196} x2={132} y2={196} />
        </g>
      )}
      {spec.vCut && isBack && <path data-hotspot="vCut" d="M85 30 L90 40 L95 30" fill="none" stroke={dl} strokeWidth={1.4} />}
      {spec.beltLoop && <g data-hotspot="beltLoop" fill={dl}><rect x={58} y={22} width={4} height={10} /><rect x={118} y={22} width={4} height={10} /></g>}

      {isDiagram && (
        <g fontSize={8.5} fill="#374151">
          <text x={4} y={210}>봉제 {spec.botSew} · 오비 {spec.obi}</text>
          {spec.sas && <text x={4} y={16}>SAS 있음</text>}
          {spec.taping && <text x={100} y={16}>턱시도깡</text>}
        </g>
      )}
    </svg>
  );
}
