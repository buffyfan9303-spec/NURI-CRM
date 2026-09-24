/**
 * 정장 41항목(qty 4 + options 37) → 의복 렌더 사양 — 순수 함수 계층.
 *
 * 근거: ../../docs/crm-factory-preview.md(41항목 시각 반영 계약 표).
 * 저장 키·한글 값을 그대로 입력으로 받고, SVG 좌표/불리언 같은 "렌더러 경계" 변환은
 * 전부 이 파일 안의 작은 함수에서만 한다. lib/domain/factory-options.ts의 선택지 자체는
 * 손대지 않는다(요청 §4: 새 범용 옵션 엔진·중복 enum 금지).
 *
 * 동명 키 함정 주의: 이 스키마의 vestBack("제원단"|"안감")은 과거 스튜디오(index.html)의
 * 벨트/무벨트와 무관하다 — 여기서는 조끼 등판을 겉감으로 채울지 안감으로 채울지만 뜻한다.
 * vestLapel도 과거 값("라펠없음"/"라펠있음")과 다르다 — 현재는 "없음"/"노치드"/"피크드".
 */
import type { OptionValue } from "@/lib/domain/factory-options";

export type Pt = { x: number; y: number };

const s = (v: OptionValue | undefined, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const n = (v: OptionValue | undefined, fallback = 0): number =>
  typeof v === "number" ? v : fallback;
const pad = (v: OptionValue | undefined): { L: number; R: number } =>
  v && typeof v === "object" && "L" in v ? (v as { L: number; R: number }) : { L: 0, R: 0 };

// ── 단추 배치 (렌더러 경계 함수) ────────────────────────────────────────
function singleColumn(count: number, x: number, yTop: number, spacing: number): Pt[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({ x, y: yTop + i * spacing }));
}
function doubleColumn(count: number, xL: number, xR: number, yTop: number, spacing: number): Pt[] {
  const pts: Pt[] = [];
  const rows = Math.ceil(count / 2);
  for (let r = 0; r < rows && pts.length < count; r++) {
    pts.push({ x: xL, y: yTop + r * spacing });
    if (pts.length < count) pts.push({ x: xR, y: yTop + r * spacing });
  }
  return pts;
}

/**
 * 여밈↔단추 개수 제조 가능 조합 보정.
 * 근거: 더블 브레스티드는 좌우 두 열이 대칭이어야 해서 단추 총수가 짝수여야 하고,
 * 싱글은 한 줄 구성이 표준이라 1~3개가 일반적이다(재단 관례 — 브랜드 취향이 아니라
 * 대칭·열 구성이라는 구조적 제약). 근거 없는 조합(예: 싱글 5개)까지 확대하지 않는다.
 */
export function resolveComboCorrections(
  options: Record<string, OptionValue>
): {
  options: Record<string, OptionValue>;
  changes: { key: string; label: string; from: string; to: string; reason: string }[];
} {
  const next = { ...options };
  const changes: { key: string; label: string; from: string; to: string; reason: string }[] = [];

  const design = s(next.design, "싱글");
  const btnN = s(next.btnN, "2");
  if (design === "더블" && !["2", "4", "6"].includes(btnN)) {
    const to = btnN === "1" ? "2" : btnN === "3" || btnN === "2/3" ? "4" : "6";
    changes.push({
      key: "btnN", label: "앞단추 개수", from: btnN, to,
      reason: `더블 여밈에 맞춰 앞단추가 ${to}개로 변경됐어요(더블은 좌우 대칭 단추 열이 필요합니다).`,
    });
    next.btnN = to;
  } else if (design === "싱글" && !["1", "2", "3", "2/3"].includes(btnN)) {
    changes.push({
      key: "btnN", label: "앞단추 개수", from: btnN, to: "3",
      reason: "싱글 여밈에 맞춰 앞단추가 3개로 변경됐어요(싱글은 한 줄 단추 구성이 표준입니다).",
    });
    next.btnN = "3";
  }

  // "더블(밑단 일자)" 도 더블 여밈이다 — 밑단 모양만 다른 선택지.
  const vestFasten = s(next.vestFasten, "싱글").startsWith("더블") ? "더블" : "싱글";
  const vestBtnN = s(next.vestBtnN, "5");
  if (vestFasten === "더블" && vestBtnN === "5") {
    changes.push({
      key: "vestBtnN", label: "조끼 단추 개수", from: "5", to: "4",
      reason: "더블 여밈 조끼에 맞춰 단추가 4개로 변경됐어요(더블은 좌우 대칭 단추 열이 필요합니다).",
    });
    next.vestBtnN = "4";
  }

  return { options: next, changes };
}

export interface JacketSpec {
  design: string;
  buttonCount: number;
  buttons: Pt[];
  doubleOverlap: boolean;
  lapel: string;
  lapelWidthScale: number;
  lapelSizeCm: number;
  lapelDetail: string;
  lapelDetailReview: boolean;
  vent: string;
  pocketShape: string;
  pocketFlap: boolean;
  pocketAngle: "정각" | "경사";
  ticketPocket: boolean;
  /** 3버튼 2롤 — 맨 위 단추가 라펠에 말려 들어가 채우지 않는다(속빈 원으로 그린다). */
  rollTopButton: boolean;
  liningStyle: string;
  liningVisibleInside: boolean;
  amf: string;
  padL: number;
  padR: number;
  sweatPad: boolean;
  bond: string;
  goji: string;
  gojiReview: boolean;
  shldSew: string;
  shldSewReview: boolean;
  cuff: string;
  cuffReview: boolean;
  btnext: string;
  btnextReview: boolean;
  shldFix: string;
  postFix: string;
}

export function buildJacketSpec(options: Record<string, OptionValue>): JacketSpec {
  const design = s(options.design, "싱글");
  // "2/3"(3버튼 2롤)은 단추 3개를 달고 맨 위를 라펠로 접는다 — 그림은 3개로 그린다.
  const btnN = s(options.btnN, "2") === "2/3" ? 3 : Math.max(1, parseInt(s(options.btnN, "2"), 10) || 2);
  const doubleOverlap = design === "더블";
  const buttons = doubleOverlap
    ? doubleColumn(btnN, 88, 112, 150, 26)
    : singleColumn(btnN, 100, 150, 26);
  const lapelSizeCm = n(options.lapelSize, 8.5);
  const lapelDetail = s(options.lapelDet, "없음");
  const shldSew = s(options.shldSew, "일반(후러쉬)");
  const cuff = s(options.cuff, "없음");
  const goji = s(options.goji, "나폴리");
  const btnext = s(options.btnext, "기본");
  const padVal = pad(options.pad);
  const frontPocket = s(options.frontPocket, "기본");

  return {
    design,
    buttonCount: buttons.length,
    rollTopButton: s(options.btnN, "2") === "2/3",
    buttons,
    doubleOverlap,
    lapel: s(options.lapel, "노치드"),
    lapelWidthScale: Math.min(1.35, Math.max(0.75, lapelSizeCm / 8.5)),
    lapelSizeCm,
    lapelDetail,
    // 쎄빠는 현장 용어라 원본 패턴 근거 없이 도형을 창작하지 않는다 — 사양만 보존.
    lapelDetailReview: lapelDetail === "쎄빠",
    vent: s(options.vent, "사이드벤트"),
    // 앞주머니에서 아웃포켓/라운드아웃을 고르면 학고(주머니 모양)보다 우선한다 — 예전엔 앞주머니 값이 그림에 반영되지 않았다.
    pocketShape: frontPocket === "아웃포켓" || frontPocket === "라운드아웃" ? frontPocket : s(options.hak, "일반"),
    pocketFlap: frontPocket !== "입술",
    pocketAngle: frontPocket === "경사" ? "경사" : "정각",
    ticketPocket: s(options.ticketP, "무") === "유",
    liningStyle: s(options.lining, "전체"),
    liningVisibleInside: s(options.lining, "전체") !== "언컨(제원단)",
    amf: s(options.amf, "없음"),
    padL: padVal.L,
    padR: padVal.R,
    sweatPad: s(options.sweatPad, "없음") === "있음",
    bond: s(options.bond, "반접착"),
    goji,
    gojiReview: true, // 나폴리/톰포드 실제 패턴 차이는 원본 자료 확인 전까지 항상 "확인 필요"
    shldSew,
    shldSewReview: shldSew !== "일반(후러쉬)",
    cuff,
    cuffReview: cuff === "홍아개" || cuff === "쎄빠",
    btnext,
    btnextReview: btnext === "카마치아",
    shldFix: s(options.shldFix, "없음(0)"),
    postFix: s(options.postFix, "없음(0)"),
  };
}

export interface PantsSpec {
  pleats: number;
  /** 역주름 — 주름이 옆선 쪽으로 열린다(선 위치를 바깥쪽으로 그린다). */
  pleatReverse: boolean;
  frontPocket: string;
  backPocket: string;
  hem: string;
  botSew: string;
  obi: string;
  sas: boolean;
  taping: boolean;
  beltLoop: boolean;
  vCut: boolean;
}

export function buildPantsSpec(options: Record<string, OptionValue>): PantsSpec {
  return {
    pleats: parseInt(s(options.botTuck, "0"), 10) || 0,
    pleatReverse: s(options.botTuck, "0").includes("역"),
    frontPocket: s(options.botFrontP, "사이드"),
    backPocket: s(options.botBackP, "양쪽-입술"),
    hem: s(options.botHem, "기본"),
    botSew: s(options.botSew, "일반"),
    obi: s(options.obi, "보통"),
    sas: s(options.sas, "없음") === "있음",
    taping: s(options.taping, "없음") === "있음",
    beltLoop: s(options.beltLoop, "있음") === "있음",
    vCut: s(options.vCut, "없음") === "있음",
  };
}

export interface VestSpec {
  fasten: string;
  buttonCount: number;
  buttons: Pt[];
  pocketCount: number;
  pockets: { x: number; y: number; w: number }[];
  back: "제원단" | "안감";
  lapel: string;
}

export function buildVestSpec(options: Record<string, OptionValue>): VestSpec {
  const fasten = s(options.vestFasten, "싱글").startsWith("더블") ? "더블" : "싱글";
  const buttonCount = Math.max(1, parseInt(s(options.vestBtnN, "5"), 10) || 5);
  const buttons = fasten === "더블"
    ? doubleColumn(buttonCount, 90, 110, 90, 20)
    : singleColumn(buttonCount, 100, 88, 20);
  const pocketCount = Math.max(0, parseInt(s(options.vestPocketN, "2"), 10) || 2);
  const rows = Math.ceil(pocketCount / 2);
  const pockets: { x: number; y: number; w: number }[] = [];
  for (let r = 0; r < rows && pockets.length < pocketCount; r++) {
    const y = 120 + r * 26;
    pockets.push({ x: 58, y, w: 26 });
    if (pockets.length < pocketCount) pockets.push({ x: 116, y, w: 26 });
  }
  const back = s(options.vestBack, "제원단") === "안감" ? "안감" : "제원단";
  return { fasten, buttonCount, buttons, pocketCount, pockets, back, lapel: s(options.vestLapel, "없음") };
}

/** 41항목(qty 4 + options 37) 중 렌더러가 실제로 소비하는 키 전체 — 회귀 테스트의 단일 출처. */
export const CONSUMED_OPTION_KEYS = [
  "bond", "design", "btnN", "lapel", "lapelSize", "lapelDet", "lining", "vent", "hak",
  "frontPocket", "shldSew", "cuff", "pad", "amf", "sweatPad", "ticketP",
  "shldFix", "postFix",
  "botSew", "botTuck", "obi", "botFrontP", "botBackP", "botHem", "sas", "taping", "beltLoop", "vCut",
  "vestFasten", "vestBtnN", "vestPocketN", "vestBack", "vestLapel",
  "fitYn", "goji", "btnext", "vest",
] as const;

export function buildGarmentSpec(options: Record<string, OptionValue>, qty: Record<string, number>) {
  return {
    jacket: buildJacketSpec(options),
    pants: buildPantsSpec(options),
    vest: buildVestSpec(options),
    qty: { s: qty.s ?? 0, p: qty.p ?? 0, v: qty.v ?? 0, c: qty.c ?? 0 },
    // 가봉 여부는 외형을 바꾸지 않는다(일정/상태 반영 대상) — 그래도 사양 요약에는 표시되어야
    // "렌더러가 소비하지 않는 조용한 항목"이 되지 않는다(요청 §4 표, fitYn 행).
    fitYn: s(options.fitYn, "N"),
    vestTypeMismatch:
      (qty.v ?? 0) > 0 && s(options.vest, "없음") === "없음"
        ? "조끼 수량이 있지만 조끼 유형이 '없음'입니다."
        : (qty.v ?? 0) === 0 && s(options.vest, "없음") !== "없음"
          ? "조끼 유형이 선택됐지만 조끼 수량이 0입니다."
          : null,
  };
}
