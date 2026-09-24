/**
 * 아이엘 도식화(docs/design-references/il-schematics, public/schematics) ↔ 공장 옵션 대응표 — 단일 출처.
 * 옵션 카드(OptionField) · 작업지시서(WorkOrderSheet) 가 모두 이 표만 읽는다.
 *
 * 값에 도식이 없으면 undefined(텍스트 카드로 표시).
 * 2026-09-24 도식 원본을 직접 확인해 대응을 확정했다 — 일자·경사·입술 주머니 도식은 재킷이 아니라 **바지 앞주머니**,
 * 소매 '기본'은 단추 4개 간격 배열(= 일자), '겹단추'는 단추가 겹친 배열(= 겹침).
 * 도식 40장 전부가 아래 대응에 쓰인다.
 */
export interface Schematic { src: string; label: string }

const S = (file: string, label: string): Schematic => ({ src: `/schematics/${file}.jpg`, label });

const BY_FIELD: Record<string, Record<string, Schematic>> = {
  bond: { 언컨: S("unconstructed", "언컨") },
  lapel: { 노치드: S("lapel-notched", "노치드"), 피크드: S("lapel-peaked", "피크드"), 숄: S("lapel-shawl", "숄") },
  lapelDet: { "큐큐(플라워홀)": S("lapel-flowerhole", "큐큐 있음"), 없음: S("lapel-no-flowerhole", "큐큐 없음") },
  lining: {
    전체: S("lining-full", "전체 안감"), 반안감: S("lining-half", "반안감"), 갈매기반안감: S("lining-half-gull", "갈매기 반안감"),
    "언컨(제원단)": S("unconstructed", "언컨"), "언컨(안감)": S("unconstructed", "언컨"),
  },
  vent: { 사이드벤트: S("vent-side", "사이드벤트"), 센터벤트: S("vent-center", "센터벤트"), 통막음: S("vent-none", "노벤트") },
  cuff: {
    홍아개: S("cuff-working", "홍아개"), 쎄빠: S("cuff-sseppa", "쎄빠"), 없음: S("cuff-no-button", "단추 없음"),
    겹침: S("cuff-kissing", "겹단추"), 일자: S("cuff-basic", "소매단추 기본"),
  },
  botTuck: {
    "0": S("tuck-0", "노턱"), "1": S("tuck-1", "1주름"), "1(역주름)": S("tuck-1-reverse", "1주름 역주름"),
    "2": S("tuck-2", "2주름"), "2(역주름)": S("tuck-2-reverse", "2주름 역주름"),
  },
  botFrontP: { 사이드: S("pocket-straight", "일자 주머니"), 슬랜티드: S("pocket-slanted", "경사 주머니"), 입술: S("pocket-jetted", "입술 주머니") },
  botBackP: { "양쪽-후다": S("pocket-back-flap", "뒤 후다 주머니") },
  botHem: { 기본: S("hem-straight", "밑단 일자"), 턴업: S("hem-turnup", "턴업"), 모닝컷: S("hem-morningcut", "모닝컷") },
  sas: { 있음: S("side-adjuster", "사이드 어드저스트") },
  vestFasten: {
    싱글: S("vest-single", "조끼 싱글"), 더블: S("vest-double", "조끼 더블"),
    "싱글(밑단 일자)": S("vest-single-straight", "조끼 싱글 밑단 일자"), "더블(밑단 일자)": S("vest-double-straight", "조끼 더블 밑단 일자"),
  },
};

/** 앞단추 개수는 여밈(싱글/더블)과 조합해야 도식이 정해진다. */
function buttonSchematic(n: string, design: unknown): Schematic | undefined {
  if (design === "더블") return n === "4" ? S("btn-double-4", "더블 4버튼") : n === "6" ? S("btn-double-6", "더블 6버튼") : undefined;
  if (n === "2/3") return S("btn-3roll2", "3버튼 2롤");
  return n === "1" || n === "2" || n === "3" ? S(`btn-${n}`, `${n}버튼`) : undefined;
}

export function schematicFor(key: string, value: unknown, options?: Record<string, unknown>): Schematic | undefined {
  if (typeof value !== "string") return undefined;
  if (key === "btnN") return buttonSchematic(value, options?.design);
  return BY_FIELD[key]?.[value];
}

/** 이 필드에 도식 카드로 보여줄 만큼(2개 이상) 도식이 있는가. */
export function hasSchematicCards(key: string): boolean {
  return key === "btnN" || Object.keys(BY_FIELD[key] ?? {}).length >= 2;
}

/** 현재 옵션에서 선택된 도식 전부 — 작업지시서 등 요약용. 같은 그림은 한 번만. */
export function selectedSchematics(options: Record<string, unknown>, keys: readonly string[]): { key: string; s: Schematic }[] {
  const seen = new Set<string>();
  const out: { key: string; s: Schematic }[] = [];
  for (const k of keys) {
    const s = schematicFor(k, options[k], options);
    if (s && !seen.has(s.src)) { seen.add(s.src); out.push({ key: k, s }); }
  }
  return out;
}

export const JACKET_SCHEMATIC_KEYS = ["lapel", "btnN", "lapelDet", "vent", "cuff", "lining", "bond"] as const;
export const PANTS_SCHEMATIC_KEYS = ["botFrontP", "botTuck", "botBackP", "botHem", "sas"] as const;
export const VEST_SCHEMATIC_KEYS = ["vestFasten"] as const;
