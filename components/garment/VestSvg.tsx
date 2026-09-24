"use client";

import type { VestSpec } from "@/lib/garment/spec";
import type { ResolvedSwatch } from "@/lib/garment/fabric";
import { VEST_BODY_D, vestLapelPaths } from "./shapes";
import type { GarmentView } from "./JacketSvg";

/**
 * 조끼 앞/뒤. 기존 버그 수정(요청 §5.1): 단추 3개·주머니 on/off 고정 → spec 기반 개수로 교체.
 * 동명 키 함정 수정: vestBack("제원단"|"안감")은 벨트 유무가 아니라 등판 재질이다 —
 * 과거 스튜디오의 벨트/무벨트 의미를 가져오지 않는다(요청 §5.1 "동명 키 함정" 경고 반영).
 */
export function VestSvg({
  spec, fabric, lining, button, view,
}: {
  spec: VestSpec;
  fabric: ResolvedSwatch;
  lining: ResolvedSwatch;
  button: ResolvedSwatch;
  view: GarmentView;
}) {
  const isDiagram = view === "diagram";
  const isBack = view === "back";
  const stroke = isDiagram ? "#1f2937" : "#0d1a2b";
  const dl = isDiagram ? "#374151" : "#33465c";
  const backFill = spec.back === "안감" ? lining.fill : fabric.fill;
  const backDefs = spec.back === "안감" ? lining.defs : fabric.defs;
  const frontFill = isDiagram ? "#eef1f3" : fabric.fill;
  const buttonColor = isDiagram ? "none" : (button.registered ? button.fill : "#4a4f57");
  const lp = vestLapelPaths(spec.lapel);

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`조끼 ${isBack ? "후면(등판)" : isDiagram ? "제작 도식" : "정면"}`}>
      <defs>
        {!isDiagram && isBack && backDefs && <g dangerouslySetInnerHTML={{ __html: backDefs }} />}
        {!isDiagram && !isBack && fabric.defs && <g dangerouslySetInnerHTML={{ __html: fabric.defs }} />}
      </defs>

      <path d={VEST_BODY_D} fill={isBack ? (isDiagram ? "#eef1f3" : backFill) : frontFill} stroke={stroke} strokeWidth={2} data-hotspot="vestBack" />

      {!isBack && (
        <g data-hotspot="vestLapel">
          <path d={lp.neckline} fill="none" stroke={dl} strokeWidth={2} />
          {lp.collar && <path d={lp.collar} fill={frontFill} stroke={stroke} strokeWidth={1.4} />}
        </g>
      )}

      {!isBack && (
        <g data-hotspot="vestPocketN" fill="none" stroke={dl} strokeWidth={1.8}>
          {spec.pockets.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={9} />)}
        </g>
      )}

      {!isBack && (
        <g data-hotspot="vestBtnN">
          {spec.buttons.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={2.4} fill={buttonColor} stroke={isDiagram ? stroke : "none"} />
          ))}
        </g>
      )}

      {isBack && (
        <path d="M100 30 L100 186" fill="none" stroke={dl} strokeWidth={0.8} strokeDasharray="3 3" />
      )}

      {isDiagram && (
        <text x={4} y={196} fontSize={9} fill="#374151">여밈 {spec.fasten} · 등판 {spec.back}</text>
      )}
    </svg>
  );
}
