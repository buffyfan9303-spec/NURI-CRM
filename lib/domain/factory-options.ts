/**
 * 정장 주문서 옵션 41항목 — 단일 출처.
 *
 * 근거: docs/crm-baseline-inventory.md §C(정장 옵션 전체 표, index.html:2878-3320/4470-4486),
 *       docs/crm-migration-map.md §2(41항목 매핑, "한글 문자열 그대로 jsonb 보존" 채택안).
 *
 * 정규화 금지: 값은 기준본과 동일한 한글 문자열 그대로 쓴다(예: '반접착', '노치드').
 * 코드(enum)로 바꾸면 작업지시서 인쇄 시 다시 한글로 역변환해야 해서 매핑 계층만 늘어난다
 * (이관맵 §2 근거 1-4 참고).
 *
 * 저장 위치: crm.factory_orders는 options jsonb + qty jsonb 두 컬럼을 갖는다(0007_factory.sql).
 * "일정/수량" 그룹(수트/바지/조끼/코트 수량)은 qty로, 나머지 37항목은 options로 간다.
 * 그룹당 개수: 일정/수량 4, 상의 16, 패턴 수정 2, 하의 10, 조끼 5, 기타 4 = 41.
 */

export type FactoryOptionGroup =
  | "일정/수량"
  | "상의"
  | "패턴 수정"
  | "하의"
  | "조끼"
  | "기타";

export interface SelectFieldDef {
  kind: "select";
  key: string;
  label: string;
  group: FactoryOptionGroup;
  choices: string[];
  default: string;
}

export interface NumberFieldDef {
  kind: "number";
  key: string;
  label: string;
  group: FactoryOptionGroup;
  default: number;
  unit?: string;
  step?: number;
}

/** 패드 좌/우처럼 좌우 한 쌍으로 다루는 숫자 필드(order.pad{L,R}, 기준본 STEP3). */
export interface PadFieldDef {
  kind: "pad";
  key: string;
  label: string;
  group: FactoryOptionGroup;
  default: { L: number; R: number };
  unit: string;
}

export type FactoryFieldDef = SelectFieldDef | NumberFieldDef | PadFieldDef;

/** qty(jsonb)로 가는 4항목 — "수량" 자체가 값이라 select/pad가 아니라 항상 number. */
export const FACTORY_QTY_FIELDS: NumberFieldDef[] = [
  { kind: "number", key: "s", label: "수트(자켓) 수량", group: "일정/수량", default: 1 },
  { kind: "number", key: "p", label: "바지 수량", group: "일정/수량", default: 0 },
  { kind: "number", key: "v", label: "조끼 수량", group: "일정/수량", default: 0 },
  { kind: "number", key: "c", label: "코트 수량", group: "일정/수량", default: 0 },
];

/** options(jsonb)로 가는 37항목. */
export const FACTORY_OPTION_FIELDS: FactoryFieldDef[] = [
  // ── 상의 16종 (①~⑯) ──────────────────────────────────────────
  { kind: "select", key: "bond", label: "① 접착", group: "상의",
    choices: ["반접착", "비접착", "턱시도", "숄카라", "언컨"], default: "반접착" },
  { kind: "select", key: "design", label: "② 디자인", group: "상의",
    choices: ["싱글", "더블"], default: "싱글" },
  { kind: "select", key: "btnN", label: "③ 앞단추 개수", group: "상의",
    choices: ["1", "2", "3", "2/3", "4", "6"], default: "2" },
  { kind: "select", key: "lapel", label: "④ 라펠 모양", group: "상의",
    choices: ["노치드", "피크드", "숄", "기타"], default: "노치드" },
  { kind: "number", key: "lapelSize", label: "⑤ 라펠 사이즈", group: "상의",
    default: 8.5, unit: "cm", step: 0.1 },
  { kind: "select", key: "lapelDet", label: "⑥ 라펠 디테일", group: "상의",
    choices: ["쎄빠", "큐큐(플라워홀)", "없음"], default: "없음" },
  { kind: "select", key: "lining", label: "⑦ 안감 사양", group: "상의",
    choices: ["전체", "반안감", "갈매기반안감", "언컨(제원단)", "언컨(안감)"], default: "전체" },
  { kind: "select", key: "vent", label: "⑧ 뒷트임", group: "상의",
    choices: ["사이드벤트", "센터벤트", "통막음"], default: "사이드벤트" },
  { kind: "select", key: "hak", label: "⑨ 학고 사양", group: "상의",
    choices: ["일반", "바르카", "아웃포켓", "라운드아웃"], default: "일반" },
  { kind: "select", key: "frontPocket", label: "⑩ 앞주머니", group: "상의",
    choices: ["기본", "아웃포켓", "라운드아웃", "입술", "경사"], default: "기본" },
  { kind: "select", key: "shldSew", label: "⑪ 어깨 봉제", group: "상의",
    choices: ["일반(후러쉬)", "보카시-주름없음", "보카시-주름있음", "소꼬(로프트)"], default: "일반(후러쉬)" },
  { kind: "select", key: "cuff", label: "⑫ 소매 밑단", group: "상의",
    choices: ["홍아개", "쎄빠", "없음", "겹침", "일자"], default: "없음" },
  { kind: "pad", key: "pad", label: "⑬ 패드 좌/우", group: "상의",
    default: { L: 2, R: 2 }, unit: "mm" },
  { kind: "select", key: "amf", label: "⑭ AMF 스티치", group: "상의",
    choices: ["없음", "앞판", "전체(앞·뒷판)", "본봉스티치"], default: "없음" },
  { kind: "select", key: "sweatPad", label: "⑮ 땀받이", group: "상의",
    choices: ["있음", "없음"], default: "없음" },
  { kind: "select", key: "ticketP", label: "⑯ 티켓 포켓", group: "상의",
    choices: ["유", "무"], default: "무" },

  // ── 패턴 수정 2종 ────────────────────────────────────────────
  { kind: "select", key: "shldFix", label: "어깨 수정", group: "패턴 수정",
    choices: ["없음(0)", "강상(+1.5)", "중상(+1)", "약상(+0.5)", "약하(-0.5)", "중하(-1)", "강하(-1.5)"],
    default: "없음(0)" },
  { kind: "select", key: "postFix", label: "자세 수정", group: "패턴 수정",
    choices: ["없음(0)", "강반(+1.5)", "중반(+1)", "약반(+0.5)", "약굴(-0.5)", "중굴(-1)", "강굴(-1.5)"],
    default: "없음(0)" },

  // ── 하의 10종 (①~⑩) ─────────────────────────────────────────
  { kind: "select", key: "botSew", label: "① 봉제 방식", group: "하의",
    choices: ["일반", "프리미엄"], default: "일반" },
  { kind: "select", key: "botTuck", label: "② 앞 주름", group: "하의",
    choices: ["0", "1", "1(역주름)", "2", "2(역주름)"], default: "0" },
  { kind: "select", key: "obi", label: "③ 오비", group: "하의",
    choices: ["보통", "마고리(6cm)"], default: "보통" },
  { kind: "select", key: "botFrontP", label: "④ 앞 주머니", group: "하의",
    choices: ["사이드", "슬랜티드", "입술", "크로스", "없음"], default: "사이드" },
  { kind: "select", key: "botBackP", label: "⑤ 뒷 주머니", group: "하의",
    choices: ["양쪽-입술", "양쪽-단추", "양쪽-후다", "한쪽", "없음"], default: "양쪽-입술" },
  { kind: "select", key: "botHem", label: "⑥ 밑단 모양", group: "하의",
    choices: ["기본", "턴업", "카브라", "모닝컷"], default: "기본" },
  { kind: "select", key: "sas", label: "⑦ 사이드 어드져스트", group: "하의",
    choices: ["있음", "없음"], default: "없음" },
  { kind: "select", key: "taping", label: "⑧ 턱시도깡", group: "하의",
    choices: ["있음", "없음"], default: "없음" },
  { kind: "select", key: "beltLoop", label: "⑨ 벨트 고리", group: "하의",
    choices: ["있음", "없음"], default: "있음" },
  { kind: "select", key: "vCut", label: "⑩ V 트임", group: "하의",
    choices: ["있음", "없음"], default: "없음" },

  // ── 조끼 5종 (①~⑤, 조끼/라펠조끼 선택 시에만 활성) ────────────
  { kind: "select", key: "vestFasten", label: "① 여밈", group: "조끼",
    choices: ["싱글", "더블", "싱글(밑단 일자)", "더블(밑단 일자)"], default: "싱글" },
  { kind: "select", key: "vestBtnN", label: "② 단추 개수", group: "조끼",
    choices: ["4", "5", "6"], default: "5" },
  { kind: "select", key: "vestPocketN", label: "③ 주머니 개수", group: "조끼",
    choices: ["2", "3", "4"], default: "2" },
  { kind: "select", key: "vestBack", label: "④ 등판", group: "조끼",
    choices: ["제원단", "안감"], default: "제원단" },
  { kind: "select", key: "vestLapel", label: "⑤ 라펠 모양", group: "조끼",
    choices: ["없음", "노치드", "피크드"], default: "없음" },

  // ── 기타 4종 ─────────────────────────────────────────────────
  { kind: "select", key: "fitYn", label: "가봉 진행 여부", group: "기타",
    choices: ["Y", "N"], default: "N" },
  { kind: "select", key: "goji", label: "고지라인", group: "기타",
    choices: ["나폴리", "톰포드"], default: "나폴리" },
  { kind: "select", key: "btnext", label: "버튼/특수", group: "기타",
    choices: ["기본", "리얼버튼", "카마치아"], default: "기본" },
  { kind: "select", key: "vest", label: "조끼 유형(통합)", group: "기타",
    choices: ["없음", "베스트", "라펠조끼"], default: "없음" },
];

export const FACTORY_OPTION_GROUPS: FactoryOptionGroup[] = [
  "일정/수량",
  "상의",
  "패턴 수정",
  "하의",
  "조끼",
  "기타",
];

/** 코트는 별도 옵션 세트가 없다(패턴 선택만으로 사이즈 자동 반영, 기준본 §C 하단). */
export const COAT_HAS_NO_OPTIONS = true;

export type OptionValue = string | number | { L: number; R: number };

/** options jsonb 기본값 — 새 주문 폼 초기 상태. */
export function defaultFactoryOptions(): Record<string, OptionValue> {
  const out: Record<string, OptionValue> = {};
  for (const f of FACTORY_OPTION_FIELDS) {
    out[f.key] = f.kind === "pad" ? { ...f.default } : f.default;
  }
  return out;
}

/** qty jsonb 기본값. */
export function defaultFactoryQty(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FACTORY_QTY_FIELDS) out[f.key] = f.default;
  return out;
}

/**
 * 허용된 값인지 검사(select는 choices 안, number/pad는 유한수). RPC가 최종 검증하지 않는
 * 자유 jsonb 컬럼이므로, 화면에서 이상값을 보내기 전에 한 번 걸러 사용자 오류를 조기에 보여준다.
 */
export function validateFactoryOptions(
  options: Record<string, unknown>
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  for (const f of FACTORY_OPTION_FIELDS) {
    const v = options[f.key];
    if (f.kind === "select") {
      if (typeof v !== "string" || !f.choices.includes(v)) {
        errors.push(`${f.label}: 허용되지 않은 값입니다(${String(v)}).`);
      }
    } else if (f.kind === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        errors.push(`${f.label}: 숫자가 아닙니다.`);
      }
    } else {
      const pad = v as { L?: unknown; R?: unknown } | undefined;
      if (!pad || typeof pad.L !== "number" || typeof pad.R !== "number") {
        errors.push(`${f.label}: 좌/우 숫자 쌍이 아닙니다.`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function fieldsByGroup(group: FactoryOptionGroup): FactoryFieldDef[] {
  return FACTORY_OPTION_FIELDS.filter((f) => f.group === group);
}
