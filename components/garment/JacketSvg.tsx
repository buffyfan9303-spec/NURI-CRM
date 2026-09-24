"use client";

import * as React from "react";
import type { JacketSpec } from "@/lib/garment/spec";
import type { ResolvedSwatch } from "@/lib/garment/fabric";
import {
  JACKET_BODY_D, JACKET_SLEEVE_L_D, JACKET_SLEEVE_R_D, doubleBreastedFlapD, lapelPaths, pocketPaths,
} from "./shapes";

export type GarmentView = "front" | "back" | "inside" | "diagram";

/**
 * 재킷 정면/후면/안쪽/제작도식 — 4뷰가 전부 같은 몸판·소매 외곽(shapes.ts)을 공유한다.
 * 기존 버그 수정(요청 §5.1): 앞단추 2개 고정 → spec.buttons(디자인·개수 반영)로 교체.
 */
export function JacketSvg({
  spec, fabric, lining, button, view,
}: {
  spec: JacketSpec;
  fabric: ResolvedSwatch;
  lining: ResolvedSwatch;
  button: ResolvedSwatch;
  view: GarmentView;
}) {
  const isDiagram = view === "diagram";
  const stroke = isDiagram ? "#1f2937" : "#0d1a2b";
  const dl = isDiagram ? "#374151" : "#33465c";
  const bodyFill = isDiagram ? "#eef1f3" : view === "inside" && spec.liningVisibleInside ? lining.fill : fabric.fill;
  const bodyDefs = isDiagram ? null : view === "inside" && spec.liningVisibleInside ? lining.defs : fabric.defs;
  const buttonColor = isDiagram ? "none" : (button.registered ? button.fill : "#4a4f57");
  const lw = 22 * spec.lapelWidthScale * (spec.doubleOverlap ? 1.12 : 1);
  const lp = view === "front" || isDiagram ? lapelPaths(spec.lapel, lw) : null;

  return (
    <svg viewBox="0 0 200 300" className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`재킷 ${view === "front" ? "정면" : view === "back" ? "후면" : view === "inside" ? "안쪽" : "제작 도식"}`}>
      <defs>
        {bodyDefs && <g dangerouslySetInnerHTML={{ __html: bodyDefs }} />}
        {!isDiagram && fabric.defs && view !== "inside" && <g dangerouslySetInnerHTML={{ __html: fabric.defs }} />}
      </defs>

      <path d={JACKET_SLEEVE_L_D} fill={bodyFill} stroke={stroke} strokeWidth={1.6} />
      <path d={JACKET_SLEEVE_R_D} fill={bodyFill} stroke={stroke} strokeWidth={1.6} />
      <path d={JACKET_BODY_D} fill={bodyFill} stroke={stroke} strokeWidth={1.8} />

      {spec.doubleOverlap && (view === "front" || isDiagram) && (
        <path d={doubleBreastedFlapD(lw)} fill={bodyFill} stroke={stroke} strokeWidth={1.4} fillOpacity={isDiagram ? 1 : 0.94} data-hotspot="design" />
      )}

      {(view === "front" || isDiagram) && lp && (
        <g data-hotspot="lapel">
          <path d={lp.collar} fill={isDiagram ? "#e5e9ec" : fabric.fill} stroke={stroke} strokeWidth={1.2} />
          <path d={lp.facing} fill={isDiagram ? "#f4f6f7" : fabric.fill} stroke={stroke} strokeWidth={1} fillOpacity={isDiagram ? 1 : 0.96} />
          {lp.notchOrPeak && <path d={lp.notchOrPeak} fill={isDiagram ? "#eef1f3" : bodyFill} stroke={dl} strokeWidth={1.3} />}
          <path d={lp.rollLine} fill="none" stroke={dl} strokeWidth={1} />
          {spec.lapel === "기타" && (
            <text x={100 + lw + 4} y={90} fontSize={11} fill="#b45309" fontWeight={700}>확인필요</text>
          )}
          {spec.lapelDetail === "큐큐(플라워홀)" && (
            <g><ellipse cx={100 - lw * 0.3} cy={110} rx={4} ry={1.6} fill="none" stroke={dl} strokeWidth={1} /></g>
          )}
          {spec.lapelDetailReview && (
            <text x={100 + lw + 4} y={105} fontSize={10} fill="#b45309">쎄빠 · 확인필요</text>
          )}
        </g>
      )}

      {(view === "front" || isDiagram) && (
        <g data-hotspot="btnN">
          {spec.buttons.map((b, i) => (
            // 3버튼 2롤: 맨 위(첫) 단추는 라펠에 말려 채우지 않은 원으로 — '3버튼'과 구분된다.
            spec.rollTopButton && i === 0
              ? <circle key={i} cx={b.x} cy={b.y} r={3.4} fill="none" stroke={isDiagram ? stroke : buttonColor} strokeWidth={1.2} strokeDasharray="2 1.5" />
              : <circle key={i} cx={b.x} cy={b.y} r={3.4} fill={buttonColor} stroke={isDiagram ? stroke : "none"} />
          ))}
        </g>
      )}

      {(view === "front" || isDiagram) && (
        <g data-hotspot="hak" fill="none" stroke={dl} strokeWidth={1.6}>
          <path d={pocketPaths(spec.pocketShape, spec.pocketFlap, spec.pocketAngle)} />
        </g>
      )}

      {(view === "front" || isDiagram) && spec.ticketPocket && (
        <path data-hotspot="ticketP" d="M104 196 L132 196 L131 206 L104 206 Z" fill="none" stroke="#1ab394" strokeWidth={1.4} />
      )}

      {(view === "front" || isDiagram) && spec.amf !== "없음" && (
        <g data-hotspot="amf" fill="none" stroke="#1ab394" strokeWidth={1.2} strokeDasharray="2 3">
          <path d="M84 80 C82 110 82 150 88 176" />
          {(spec.amf.includes("전체") || spec.amf === "본봉스티치") && <path d="M116 80 C118 110 118 150 112 176" />}
        </g>
      )}

      {(view === "back" || isDiagram) && (
        <g data-hotspot="vent" stroke={dl} strokeWidth={1.4}>
          {spec.vent === "센터벤트" && <line x1={100} y1={236} x2={100} y2={276} />}
          {spec.vent === "사이드벤트" && (<><line x1={80} y1={240} x2={80} y2={276} /><line x1={120} y1={240} x2={120} y2={276} /></>)}
          {spec.vent === "통막음" && <line x1={70} y1={274} x2={130} y2={274} strokeWidth={2.4} />}
        </g>
      )}

      {(view === "back" || isDiagram) && (
        <path d="M76 48 C84 44 116 44 124 48 L122 60 C112 56 88 56 78 60 Z" fill={isDiagram ? "#eef1f3" : "none"} stroke={dl} strokeWidth={1.1} data-hotspot="shldSew" />
      )}

      {(view === "front" || view === "back" || isDiagram) && (
        <g data-hotspot="cuff" stroke={dl} strokeWidth={1}>
          {spec.cuff === "겹침" && (<><path d="M44 210 C50 218 58 219 66 213" fill="none" /><path d="M156 210 C150 218 142 219 134 213" fill="none" /></>)}
          {spec.cuff === "일자" && (<><line x1={42} y1={212} x2={66} y2={212} /><line x1={158} y1={212} x2={134} y2={212} /></>)}
          {(spec.cuff === "홍아개" || spec.cuff === "쎄빠") && (
            <text x={20} y={212} fontSize={9} fill="#b45309">{spec.cuff}·확인필요</text>
          )}
        </g>
      )}

      {view === "inside" && (
        <g fontSize={10} fill="#4b5563">
          <text x={12} y={20}>안감: {spec.liningStyle}</text>
          <text x={12} y={34}>접착: {spec.bond}</text>
          {spec.sweatPad && <text x={12} y={48}>땀받이 있음</text>}
        </g>
      )}

      {isDiagram && (
        <g fontSize={9.5} fill="#374151">
          <text x={4} y={292}>패드 L{spec.padL}/R{spec.padR}mm</text>
          {spec.shldFix !== "없음(0)" && <text x={4} y={12}>어깨수정 {spec.shldFix}</text>}
          {spec.postFix !== "없음(0)" && <text x={130} y={12}>자세수정 {spec.postFix}</text>}
          <text x={140} y={292}>라펠 {spec.lapelSizeCm}cm</text>
        </g>
      )}
    </svg>
  );
}
