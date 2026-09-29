/**
 * 머리글 자동 탐지 + 소스 종류 추정 + 필드 자동 매핑.
 */
import { SYNONYMS } from "./synonyms";
import { normalizeHeader, fingerprint } from "./normalize";
import { SOURCE_FIELDS, type HeaderDetectResult, type MappingResult, type SourceKind } from "./types";

const SOURCE_KINDS: SourceKind[] = ["meter", "bill", "bank", "expense"];

/** 한 행을 헤더 후보로 볼 때, 소스별로 몇 개 필드가 매칭되는지와 점수. */
function scoreRowAsHeader(cells: string[]): { sourceKind: SourceKind; matches: number; score: number } {
  let best = { sourceKind: SOURCE_KINDS[0], matches: 0, score: 0 };
  const normCells = cells.map(normalizeHeader);
  for (const kind of SOURCE_KINDS) {
    const dict = SYNONYMS[kind];
    let matches = 0;
    let score = 0;
    for (const field of SOURCE_FIELDS[kind]) {
      const variants = dict[field].map(normalizeHeader);
      const hit = normCells.some((c) => c && variants.includes(c));
      if (hit) {
        matches++;
        score += 1;
      }
    }
    if (matches > best.matches) best = { sourceKind: kind, matches, score };
  }
  return best;
}

/**
 * 상위 30행 안에서 사전과 가장 많이 맞는 행을 머리글로 고른다.
 * 최소 2개 필드 이상 매칭되어야 유효한 머리글로 인정한다.
 */
export function detectHeaderRow(rows: string[][], forcedSourceKind?: SourceKind): HeaderDetectResult | null {
  const scanLimit = Math.min(30, rows.length);
  let best: HeaderDetectResult | null = null;
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c.trim())) continue;
    const scored = scoreRowAsHeader(row);
    if (forcedSourceKind && scored.sourceKind !== forcedSourceKind) continue;
    if (scored.matches < 2) continue;
    const fieldCount = SOURCE_FIELDS[scored.sourceKind].length;
    const confidence = scored.matches / fieldCount;
    if (!best || scored.matches > SOURCE_FIELDS[best.sourceKind].length * best.confidence) {
      best = { headerRowIndex: i, headers: row, sourceKind: scored.sourceKind, confidence };
    }
  }
  return best;
}

/** 정규화한 헤더 문자열이 사전 변형과 정확히 같으면 1.0, 부분 포함이면 0.6, 없으면 0. */
function matchScore(normalizedHeader: string, variants: string[]): number {
  if (variants.includes(normalizedHeader)) return 1;
  if (normalizedHeader && variants.some((v) => normalizedHeader.includes(v) || v.includes(normalizedHeader))) return 0.6;
  return 0;
}

export function suggestMapping(headers: string[], sourceKindHint?: SourceKind): MappingResult {
  const normHeaders = headers.map(normalizeHeader);
  const candidates = sourceKindHint ? [sourceKindHint] : SOURCE_KINDS;

  let best: MappingResult | null = null;
  for (const kind of candidates) {
    const dict = SYNONYMS[kind];
    const mapping: Record<string, number> = {};
    const fieldConfidence: Record<string, number> = {};
    const usedCols = new Set<number>();

    for (const field of SOURCE_FIELDS[kind]) {
      const variants = dict[field].map(normalizeHeader);
      let bestCol = -1;
      let bestScore = 0;
      normHeaders.forEach((h, idx) => {
        if (usedCols.has(idx)) return;
        const s = matchScore(h, variants);
        if (s > bestScore) {
          bestScore = s;
          bestCol = idx;
        }
      });
      if (bestCol >= 0 && bestScore > 0) {
        mapping[field] = bestCol;
        fieldConfidence[field] = bestScore;
        usedCols.add(bestCol);
      }
    }

    const total = SOURCE_FIELDS[kind].length;
    const matched = Object.keys(mapping).length;
    const confidence = matched / total;
    if (!best || confidence > best.confidence) {
      best = {
        sourceKind: kind,
        mapping,
        fieldConfidence,
        confidence,
        fingerprint: fingerprint(headers),
      };
    }
  }
  return best as MappingResult;
}
