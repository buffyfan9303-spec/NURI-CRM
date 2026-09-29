/**
 * 은행 입금 행 → 호실 자동 매칭(순수 함수). 입금자명·적요·메모 글자에서 호실을 찾는다.
 * 순서: (a) 동+호(`201동 1403호`, `201-1403`, `1403호`) → (b) 호실번호 단독(3~4자리, 금액·날짜 숫자 제외) → (c) 계약 당사자 이름·상호.
 * 앞 단계에서 하나라도 찾으면 거기서 멈추고, 이름이 다른 호실을 가리키면 "확인 필요". 하나만 맞으면 auto, 여러 개면 review, 없으면 none.
 * 매칭은 "제안"이다. 화면에서 사람이 고치고, 배정·중복은 서버(recordPayment RPC)가 다시 판정한다.
 */
export interface MatchUnit { id: string; dong: string | null; unitNo: string; /** 계약 당사자(임차인·청구처)·대표자 이름 */ names: string[] }
export type MatchBy = "dongho" | "room" | "name";
export interface MatchResult { status: "auto" | "review" | "none"; unitIds: string[]; by: MatchBy | null }
export interface MatchInput { depositor?: string | null; memo?: string | null; /** 입금액 — 호실번호와 같은 숫자를 호실로 착각하지 않으려고 쓴다 */ amount?: number | null }

const normDong = (s: string | null | undefined) => (s ?? "").replace(/동/g, "").replace(/\s+/g, "").replace(/^0+(?=\d)/, "").toUpperCase();
const normNo = (s: string | null | undefined) => (s ?? "").replace(/호(실)?$/, "").replace(/\s+/g, "").toUpperCase();

/** 이름 비교용: (주)·주식회사 등 제거, 글자·숫자만 남기고 소문자. 공백·기호는 단어 경계로 쓴다. */
const COMPANY = /\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)|\(사\)|\(재\)/g;
const tokens = (s: string) => s.replace(COMPANY, " ").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export const nameKey = (s: string) => tokens(s).join("");
/** 이름 뒤에 붙어도 같은 사람으로 보는 말. 그 밖의 글자가 붙으면(김철 → 김철수) 다른 사람이다. */
const SUFFIX = /^(\d+|님|씨|귀중|대표|대표님|사장|사장님|관리비|월세|임대료|입금|이체|송금|보증금)+$/;

/** 필드 하나에서 이름이 "한 단어(또는 이어진 단어들)"로 나오는지. 글자 일부만 겹치면 오탐이라 거른다. */
function hasName(field: string, key: string): boolean {
  const t = tokens(field);
  for (let i = 0; i < t.length; i++) {
    let acc = "";
    for (let j = i; j < t.length && acc.length < key.length; j++) {
      acc += t[j];
      if (acc === key) return true;
      if (acc.length > key.length && acc.startsWith(key) && j === i && SUFFIX.test(acc.slice(key.length))) return true;
    }
  }
  return false;
}

const idsWhere = (units: MatchUnit[], pred: (u: MatchUnit) => boolean) => units.filter(pred).map((u) => u.id);
const blank = (text: string, m: RegExpMatchArray) => text.slice(0, m.index) + " ".repeat(m[0].length) + text.slice((m.index ?? 0) + m[0].length);

export function matchUnit(input: MatchInput, units: MatchUnit[]): MatchResult {
  const fields = [input.depositor, input.memo].map((x) => (x ?? "").trim()).filter(Boolean);
  let text = fields.join(" | ");
  const A = new Set<string>(), B = new Set<string>(), C = new Set<string>();

  // (a) 동+호. 실제 호실과 맞은 글자는 지워서 뒤 단계가 같은 숫자를 또 보지 않게 한다.
  const dongho: [RegExp, (m: RegExpMatchArray) => [string, string]][] = [
    [/(?<![가-힣])([A-Za-z]|\d{1,4})\s*동\s*[-–]?\s*(\d{2,4}[A-Za-z]?)\s*호?/g, (m) => [m[1], m[2]]],
    [/(?<![\d\-–./])(\d{1,4})\s*[-–]\s*(\d{3,4})(?!\d|\s*[-–]\s*\d)/g, (m) => [m[1], m[2]]],
  ];
  for (const [re, pick] of dongho) {
    for (const m of [...text.matchAll(re)]) {
      const [d, n] = pick(m);
      const hit = idsWhere(units, (u) => !!u.dong && normDong(u.dong) === normDong(d) && normNo(u.unitNo) === normNo(n));
      if (hit.length > 0) { hit.forEach((id) => A.add(id)); text = blank(text, m); }
    }
  }
  // 호실만 + "호": 동이 여러 개면 여럿이 맞아 확인 필요가 된다.
  for (const m of [...text.matchAll(/(?<![\d\-–.])(\d{2,4}[A-Za-z]?)\s*호/g)]) {
    idsWhere(units, (u) => normNo(u.unitNo) === normNo(m[1])).forEach((id) => A.add(id));
    text = blank(text, m);
  }

  // (b) 호실번호 단독: 3~4자리 숫자가 다른 숫자·쉼표·점·하이픈에 붙지 않고, 금액·연월일 표기가 아닐 때만.
  if (A.size === 0) {
    const money = input.amount != null ? String(Math.trunc(input.amount)) : null;
    for (const m of text.matchAll(/(?<![\d,.\-–/])(\d{3,4})(?!\d|[.,]\d|\s*[-–/]\s*\d)(?!\s*(?:원|년|월|일|%))/g)) {
      if (m[1] === money) continue;
      idsWhere(units, (u) => normNo(u.unitNo) === m[1]).forEach((id) => B.add(id));
    }
  }

  // (c) 계약 당사자 이름·상호
  for (const u of units) {
    for (const name of u.names) {
      const key = nameKey(name);
      if (key.length < 2) continue;
      if (fields.some((f) => hasName(f, key))) { C.add(u.id); break; }
    }
  }

  const primary = A.size > 0 ? A : B.size > 0 ? B : C;
  const by: MatchBy | null = A.size > 0 ? "dongho" : B.size > 0 ? "room" : C.size > 0 ? "name" : null;
  if (!by) return { status: "none", unitIds: [], by: null };
  const ids = new Set(primary);
  // 호실 글자와 이름이 서로 다른 호실을 가리키면 사람이 봐야 한다.
  if (by !== "name") for (const id of C) if (!primary.has(id)) ids.add(id);
  return { status: ids.size === 1 ? "auto" : "review", unitIds: [...ids], by };
}

/** 호실·계약·당사자 → MatchUnit. 종료된 계약의 당사자도 넣는다(옛 임차인의 늦은 입금도 잡으려고). */
export function buildMatchUnits(
  units: { id: string; dong: string | null; unit_no: string }[],
  contracts: { unit_id: string; tenant_party_id: string; bill_to_party_id: string | null }[],
  parties: { id: string; name: string; ceo_name: string | null }[],
): MatchUnit[] {
  const p = new Map(parties.map((x) => [x.id, x]));
  const names = new Map<string, Set<string>>();
  for (const c of contracts) {
    const set = names.get(c.unit_id) ?? new Set<string>();
    for (const id of [c.tenant_party_id, c.bill_to_party_id]) {
      const party = id ? p.get(id) : undefined;
      if (party) { set.add(party.name); if (party.ceo_name) set.add(party.ceo_name); }
    }
    names.set(c.unit_id, set);
  }
  return units.map((u) => ({ id: u.id, dong: u.dong, unitNo: u.unit_no, names: [...(names.get(u.id) ?? [])] }));
}
