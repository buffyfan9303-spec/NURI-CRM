/**
 * 원단·안감·단추 스와치 → SVG <pattern> 합성. 순수 함수(색/무늬 결정)와
 * 얇은 React 훅(이미지 decode) 두 층으로 나눈다 — DOM 의존 부분만 훅에 남긴다.
 *
 * 정직성 규칙(요청 §3): crm.materials에는 아직 color_hex/pattern_kind/image_* 컬럼이
 * 없다(0007_factory.sql 확인). 그래서 오늘은 항상 "원단 사진 미등록" 중립 도식만 나온다.
 * 이름/코드를 분석해 색상·무늬를 추정하지 않는다 — 실제 등록값이 있을 때만 사진/색을 쓴다.
 *
 * 반복 크기(§5.2): mm 단위를 의복 좌표(userSpaceOnUse, GARMENT_MM_PER_UNIT) 로 변환해서
 * 화면 확대와 무관하게 항상 같은 간격으로 보이게 한다.
 */
import * as React from "react";
import type { MaterialOption } from "@/lib/domain/factory-types";

/** 의복 SVG 1유닛 ≈ 3mm (재킷 몸판 폭 ~200유닛 ≈ 실측 가슴판 600mm 근사, 도식적 기준). */
export const GARMENT_MM_PER_UNIT = 3;
export const mmToUnits = (mm: number) => mm / GARMENT_MM_PER_UNIT;

const NEUTRAL_HEX: Record<"fabric" | "lining" | "button", string> = {
  fabric: "#c7ccd3",
  lining: "#b9c0cf",
  button: "#7d828b",
};

const DEFAULT_REPEAT_MM: Record<NonNullable<MaterialOption["patternKind"]>, { w: number; h: number }> = {
  solid: { w: 0, h: 0 },
  stripe: { w: 10, h: 10 },
  check: { w: 14, h: 14 },
  herringbone: { w: 8, h: 8 },
};

export interface ResolvedSwatch {
  fill: string;
  defs: string | null;
  registered: boolean;
  calibrated: boolean;
  noteBadge: string;
}

/**
 * material === null(선택 안 함)이거나 색상 데이터가 없으면 중립 사선 해치 패턴 +
 * "원단 사진 미등록" 배지를 반환한다. 실패 이미지를 성공한 미리보기처럼 남기지 않는다.
 */
export function resolveSwatch(
  material: MaterialOption | null,
  kind: "fabric" | "lining" | "button",
  patternId: string,
  calibrationOverrideMm?: { w: number; h: number } | null
): ResolvedSwatch {
  if (!material || !material.colorHex) {
    const base = NEUTRAL_HEX[kind];
    const line = kind === "lining" ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.16)";
    const tile = kind === "button" ? 6 : 10;
    const angle = kind === "lining" ? "-45" : "45";
    return {
      fill: `url(#${patternId})`,
      defs: `<pattern id="${patternId}" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><rect width="${tile}" height="${tile}" fill="${base}"/><line x1="0" y1="0" x2="0" y2="${tile}" stroke="${line}" stroke-width="1"/></pattern>`,
      registered: false,
      calibrated: false,
      noteBadge: "원단 사진 미등록",
    };
  }

  const hex = material.colorHex;
  const patternKind = material.patternKind ?? "solid";
  const repeat = calibrationOverrideMm ?? material.repeatMm ?? DEFAULT_REPEAT_MM[patternKind];
  const calibrated = Boolean(calibrationOverrideMm || (material.repeatMm && material.repeatCalibrated));
  const w = Math.max(1, mmToUnits(repeat.w || 10));
  const h = Math.max(1, mmToUnits(repeat.h || 10));
  const lineColor = "rgba(0,0,0,.18)";

  if (material.imageUrl) {
    // 실측 반복 치수를 알 때만 실사 텍스처를 정확한 배율로 반복한다.
    return {
      fill: `url(#${patternId})`,
      defs: `<pattern id="${patternId}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><image href="${material.imageUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/></pattern>`,
      registered: true,
      calibrated,
      noteBadge: calibrated ? "실측 반복" : "무늬 크기 미보정",
    };
  }

  if (patternKind === "stripe") {
    return {
      fill: `url(#${patternId})`,
      defs: `<pattern id="${patternId}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${hex}"/><line x1="${w * 0.35}" y1="0" x2="${w * 0.35}" y2="${h}" stroke="${lineColor}" stroke-width="${Math.max(0.6, w * 0.12)}"/></pattern>`,
      registered: true, calibrated, noteBadge: calibrated ? "실측 반복" : "무늬 크기 미보정",
    };
  }
  if (patternKind === "check") {
    return {
      fill: `url(#${patternId})`,
      defs: `<pattern id="${patternId}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${hex}"/><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${lineColor}" stroke-width="${Math.max(0.6, h * 0.09)}"/><line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="${lineColor}" stroke-width="${Math.max(0.6, w * 0.09)}"/></pattern>`,
      registered: true, calibrated, noteBadge: calibrated ? "실측 반복" : "무늬 크기 미보정",
    };
  }
  if (patternKind === "herringbone") {
    return {
      fill: `url(#${patternId})`,
      defs: `<pattern id="${patternId}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${hex}"/><path d="M0 ${h / 2} L${w / 2} 0 L${w} ${h / 2} M0 ${h} L${w / 2} ${h / 2} L${w} ${h}" fill="none" stroke="${lineColor}" stroke-width="1"/></pattern>`,
      registered: true, calibrated, noteBadge: calibrated ? "실측 반복" : "무늬 크기 미보정",
    };
  }
  // solid — 등록된 실제 색상 그대로, 패턴 없음.
  return { fill: hex, defs: null, registered: true, calibrated: true, noteBadge: "등록 색상" };
}

export interface FabricImageState {
  status: "idle" | "loading" | "ready" | "error";
  url: string | null;
}

/**
 * 사진 원단 전환(A→B→C) 시 최신 선택만 반영되도록 요청 토큰을 비교한다.
 * decode() 완료 시점에 이 토큰이 최신이 아니면 화면에 반영하지 않는다 — 실제 경합
 * 방지 로직은 여기(순수 비교)와 아래 훅의 tokenRef뿐이라 이 함수만 따로 테스트 가능하다.
 */
export function isLatestToken(requestToken: number, currentToken: number): boolean {
  return requestToken === currentToken;
}

/**
 * 자재에 imageUrl이 있을 때만 실제로 디코드한다(오늘 기준 데이터 없음 → 항상 idle).
 * 늦게 도착한 decode 결과는 tokenRef 비교로 무시한다(AbortController는 fetch가 아니라
 * <img> 디코드라 여기선 토큰 비교가 실질적 취소 역할을 한다 — 요청 §7-3 근거).
 */
export function useFabricImage(imageUrl: string | null): FabricImageState {
  const [state, setState] = React.useState<FabricImageState>({ status: "idle", url: null });
  const tokenRef = React.useRef(0);

  React.useEffect(() => {
    const myToken = ++tokenRef.current;
    if (!imageUrl) {
      setState({ status: "idle", url: null });
      return;
    }
    setState({ status: "loading", url: imageUrl });
    const img = new Image();
    img.src = imageUrl;
    img
      .decode()
      .then(() => {
        if (!isLatestToken(myToken, tokenRef.current)) return; // 늦은 응답 무시
        setState({ status: "ready", url: imageUrl });
      })
      .catch(() => {
        if (!isLatestToken(myToken, tokenRef.current)) return;
        setState({ status: "error", url: imageUrl });
      });
  }, [imageUrl]);

  return state;
}
