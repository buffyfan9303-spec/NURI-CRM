/**
 * ValidatedRow[] → DB 스테이징 저장 함수(building-actions.ts, 다른 담당 소유)가 받을 입력 형태.
 * 실제 스테이징 테이블 컬럼이 확정되면 BuildingStagingRowInput(types.ts)만 맞추면 된다.
 */
import type { BuildingStagingRowInput, MappingResult, ValidatedRow } from "./types";

export function toStagingRows(
  validated: ValidatedRow[],
  mapping: MappingResult,
  period: string | null = null,
): BuildingStagingRowInput[] {
  return validated
    .filter((row) => !row.excluded)
    .map((row) => {
      const hasError = row.issues.some((i) => i.level === "error");
      const hasWarning = row.issues.some((i) => i.level === "warning");
      const roomKey = typeof row.normalized.room === "string" ? row.normalized.room : null;
      const roomMatchType =
        row.issues.find((i) => i.code === "ROOM_UNMATCHED")
          ? "none"
          : row.issues.find((i) => i.code === "ROOM_FUZZY")
            ? "fuzzy"
            : roomKey
              ? "exact"
              : null;
      return {
        sourceKind: mapping.sourceKind,
        period: (typeof row.normalized.period === "string" ? row.normalized.period : null) ?? period,
        roomKey,
        roomMatchType,
        fields: row.normalized,
        hasError,
        hasWarning,
        issues: row.issues,
      } satisfies BuildingStagingRowInput;
    });
}
