/**
 * 재킷·바지·조끼 SVG 조각(문자열 path) — 부품별 마스크에 원단을 채우기 전 "도형"만 담당.
 * 정면/후면/안쪽 모두 같은 몸판·소매 외곽선을 공유해서(요청 §5.1) 옵션을 바꿔도 틈이
 * 생기지 않는다. 색/무늬는 채우지 않는다 — components/garment/*.tsx가 fill만 입힌다.
 */
import type { JacketSpec, VestSpec } from "@/lib/garment/spec";

// 재킷 — 몸판·소매(정면/후면/안쪽 공용, 절대 옵션에 따라 바뀌지 않는 외곽선).
export const JACKET_BODY_D =
  "M100 40 C86 40 78 48 70 58 C62 64 60 74 62 96 L70 264 C70 272 78 276 100 276 C122 276 130 272 130 264 L138 96 C140 74 138 64 130 58 C122 48 114 40 100 40 Z";
export const JACKET_SLEEVE_L_D =
  "M66 62 C52 70 44 94 42 120 L36 218 C35 228 60 232 66 222 L82 134 C84 108 80 86 86 70 Z";
export const JACKET_SLEEVE_R_D =
  "M134 62 C148 70 156 94 158 120 L164 218 C165 228 140 232 134 222 L118 134 C116 108 120 86 114 70 Z";

/** 더블 여밈일 때 몸판 위에 겹쳐지는 넓은 앞자락(외곽선은 그대로, 위에 얹는 장식 레이어). */
export function doubleBreastedFlapD(lw: number): string {
  const rx = 100 + lw * 1.05;
  return `M100 56 L${rx} 66 C${rx + 2} 130 ${rx - 2} 210 ${rx - 6} 260 L100 270 Z`;
}

export interface LapelPaths {
  collar: string;
  facing: string;
  notchOrPeak: string | null;
  rollLine: string;
}

/** 라펠(정면) — 노치드/피크드/숄/기타. lw=라펠 폭 절반(px), lapelSize cm에 비례해 스케일됨. */
export function lapelPaths(kind: string, lw: number): LapelPaths {
  const topL = 100 - lw, topR = 100 + lw;
  const shoulderL = 100 - lw * 0.4, shoulderR = 100 + lw * 0.4;
  const collar = `M100 44 C${shoulderL} 44 ${topL + 6} 50 ${topL} 58 L${100 - lw * 0.3} 66 C${100 - lw * 0.06} 64 ${100 + lw * 0.06} 64 ${100 + lw * 0.3} 66 L${topR} 58 C${topR - 6} 50 ${shoulderR} 44 100 44 Z`;

  if (kind === "숄") {
    const facing = `M${topL} 60 C${100 - lw * 0.85} 80 ${100 - lw * 0.85} 150 ${100 - lw * 0.55} 186 L${100 - lw * 0.2} 190 L${100 + lw * 0.2} 186 C${100 + lw * 0.55} 150 ${100 + lw * 0.55} 80 ${topR} 60 Z`;
    const rollLine = `M${topL + 4} 62 C${100 - lw * 0.8} 82 ${100 - lw * 0.8} 148 ${100 - lw * 0.5} 182 M${topR - 4} 62 C${100 + lw * 0.8} 82 ${100 + lw * 0.8} 148 ${100 + lw * 0.5} 182`;
    return { collar, facing, notchOrPeak: null, rollLine };
  }

  const facing = `M${100 - lw * 0.28} 66 C${100 - lw * 0.5} 76 ${100 - lw * 0.55} 90 ${100 - lw * 0.5} 100 L${100 - lw * 0.45} 168 C${100 - lw * 0.2} 180 100 186 100 186 C100 186 ${100 + lw * 0.2} 180 ${100 + lw * 0.45} 168 L${100 + lw * 0.5} 100 C${100 + lw * 0.55} 90 ${100 + lw * 0.5} 76 ${100 + lw * 0.28} 66 Z`;
  const rollLine = `M${100 - lw * 0.4} 100 L${100 - lw * 0.4} 166 M${100 + lw * 0.4} 100 L${100 + lw * 0.4} 166`;

  if (kind === "피크드") {
    const peakL = `M${100 - lw * 0.55} 100 L${100 - lw * 1.15} 84 L${100 - lw * 0.42} 96 Z`;
    const peakR = `M${100 + lw * 0.55} 100 L${100 + lw * 1.15} 84 L${100 + lw * 0.42} 96 Z`;
    return { collar, facing, notchOrPeak: `${peakL} ${peakR}`, rollLine };
  }
  if (kind === "기타") {
    return { collar, facing, notchOrPeak: null, rollLine };
  }
  // 노치드(기본)
  const notchL = `M${100 - lw * 0.5} 100 L${100 - lw * 0.72} 92 L${100 - lw * 0.36} 86 Z`;
  const notchR = `M${100 + lw * 0.5} 100 L${100 + lw * 0.72} 92 L${100 + lw * 0.36} 86 Z`;
  return { collar, facing, notchOrPeak: `${notchL} ${notchR}`, rollLine };
}

/** 학고(hak) × 앞주머니(frontPocket) — 같은 부위, 외곽 형태(hak) × 플랩/각도(frontPocket). */
export function pocketPaths(shape: string, flap: boolean, angle: "정각" | "경사"): string {
  const tilt = angle === "경사" ? 6 : 0;
  const box = (x: number) => {
    const x2 = x + 32;
    if (!flap) {
      // 입술(웰트만, 플랩 없음)
      return `M${x} ${214 + tilt * (x > 90 ? -0.3 : 0)} L${x2} ${210} L${x2 - 1} ${217} L${x + 1} ${221 + tilt * (x > 90 ? -0.3 : 0)} Z`;
    }
    if (shape === "아웃포켓") return `M${x} 208 H${x2} V${234 - tilt * 0.2} H${x} Z`;
    if (shape === "라운드아웃") return `M${x} 208 H${x2} V${226} Q${(x + x2) / 2} ${238} ${x} ${226} Z`;
    if (shape === "바르카") return `M${x} 212 Q${(x + x2) / 2} ${204 - tilt * 0.3} ${x2} ${212} L${x2 - 2} ${220} Q${(x + x2) / 2} ${213} ${x + 2} ${220} Z`;
    // 일반
    return `M${x + tilt * 0.1} 212 L${x2} 212 L${x2 - 2} 230 L${x + 2 + tilt * 0.1} 230 Z`;
  };
  return `${box(64)} ${box(104)}`;
}

// 바지 — 앞/뒤 공용 외곽선.
export const PANTS_BODY_D = "M40 22 H140 L132 208 H98 L90 96 L82 208 H48 Z";
export const PANTS_WAIST_D = "M40 22 H140 V40 H40 Z";

// 조끼 — 앞/뒤 공용 외곽선.
export const VEST_BODY_D = "M40 26 L66 16 L100 34 L134 16 L160 26 L150 150 L100 188 L50 150 Z";

export function vestLapelPaths(kind: string): { neckline: string; collar: string | null } {
  if (kind === "없음") return { neckline: "M72 26 L100 96 L128 26", collar: null };
  const collar = kind === "피크드"
    ? "M78 22 L64 36 L86 40 Z M122 22 L136 36 L114 40 Z"
    : "M78 30 L66 40 L84 42 Z M122 30 L134 40 L116 42 Z";
  return { neckline: "M74 24 C68 44 70 76 82 106 M126 24 C132 44 130 76 118 106", collar };
}

export function jacketSpecKey(spec: JacketSpec): string {
  return JSON.stringify(spec);
}
export function vestSpecKey(spec: VestSpec): string {
  return JSON.stringify(spec);
}
