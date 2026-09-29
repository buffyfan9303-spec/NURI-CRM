/** 호실 일괄 등록(엑셀 붙여넣기) 해석과 날짜 범위 해석. 순수 함수 — 서버 dry-run 이 최종 검증한다. */
import type { UnitBulkInput, UnitUseKind } from "@/lib/domain/building-types";

export const USE_KIND_LABEL: Record<UnitUseKind, string> = { retail: "상가", office: "사무실", residential: "주거", parking: "주차", common: "공용", other: "기타" };

const USE_KIND_WORDS: [RegExp, UnitUseKind][] = [
  [/^(상가|점포|매장|retail)$/i, "retail"],
  [/^(사무실|오피스|사무|office)$/i, "office"],
  [/^(주거|주택|아파트|residential)$/i, "residential"],
  [/^(주차|주차장|parking)$/i, "parking"],
  [/^(공용|공용부|common)$/i, "common"],
  [/^(기타|other)$/i, "other"],
];

export interface ParsedUnitRow { line: number; input: UnitBulkInput; error?: string }

const numOrUndef = (s: string): number | undefined | "bad" => {
  const t = s.replace(/[,\s㎡%]/g, "");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "bad";
};

/**
 * 열 순서: 동 · 층 · 호실 · 용도 · 전용면적 · 공용면적 · 지분 · 가중치.
 * 첫 줄이 머리글(호실 열이 숫자가 아니고 '호' 또는 '호실' 포함)이면 건너뛴다. 빈 줄은 무시. 줄 번호는 원문 기준 1부터.
 */
export function parseUnitRows(text: string): ParsedUnitRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ParsedUnitRow[] = [];
  lines.forEach((raw, idx) => {
    if (raw.trim() === "") return;
    const c = raw.split("\t").map((x) => x.trim());
    if (idx === 0 && (/^(동|dong)$/i.test(c[0] ?? "") || /호실|호수|unit/i.test(c[2] ?? ""))) return;
    const [dong, floor, unitNo, use, ex, co, share, weight] = c;
    const line = idx + 1;
    if (!unitNo) { out.push({ line, input: { unit_no: "" }, error: "호실 번호가 비어 있습니다." }); return; }
    let useKind: UnitUseKind | undefined;
    if (use) {
      useKind = USE_KIND_WORDS.find(([re]) => re.test(use))?.[1];
      if (!useKind) { out.push({ line, input: { unit_no: unitNo }, error: `용도 '${use}' 를 알 수 없습니다(상가·사무실·주거·주차·공용·기타).` }); return; }
    }
    const nums = { area_exclusive: numOrUndef(ex ?? ""), area_common: numOrUndef(co ?? ""), share: numOrUndef(share ?? ""), weight: numOrUndef(weight ?? "") };
    const badKey = (Object.keys(nums) as (keyof typeof nums)[]).find((k) => nums[k] === "bad");
    if (badKey) { out.push({ line, input: { unit_no: unitNo }, error: "면적·지분·가중치는 0 이상의 숫자여야 합니다." }); return; }
    const input: UnitBulkInput = { unit_no: unitNo };
    if (dong) input.dong = dong;
    if (floor) input.floor = floor;
    if (useKind) input.use_kind = useKind;
    for (const k of Object.keys(nums) as (keyof typeof nums)[]) if (nums[k] !== undefined) (input as unknown as Record<string, number>)[k] = nums[k] as number;
    out.push({ line, input });
  });
  return out;
}

/** Postgres daterange 문자열 "[2026-01-01,2027-01-01)" → 시작·끝(끝이 없으면 null). */
export function parseRange(s: string | null | undefined): { from: string; to: string | null } {
  const m = /^[\[(]\s*"?([^,"]*)"?\s*,\s*"?([^\])"]*)"?\s*[\])]$/.exec(s ?? "");
  return { from: m?.[1] ?? "", to: m && m[2] ? m[2] : null };
}
