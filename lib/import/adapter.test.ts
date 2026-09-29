import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "./parse";
import { detectHeaderRow, suggestMapping } from "./mapping";
import { validateRows } from "./validate";
import { toStagingRows } from "./adapter";
import { buildKepcoMeterXlsx } from "./__fixtures__/build";

describe("toStagingRows", () => {
  it("합계 행을 빼고, 오류/경고 플래그를 채워서 스테이징 입력으로 변환한다", async () => {
    const parsed = await parseSpreadsheet(await buildKepcoMeterXlsx(), "kepco.xlsx");
    const rows = parsed.sheets[0].rows;
    const header = detectHeaderRow(rows)!;
    const mapping = suggestMapping(header.headers);
    const dataRows = rows.slice(header.headerRowIndex + 1);
    const validated = validateRows(dataRows, mapping);
    const staging = toStagingRows(validated, mapping, "2026-08");

    expect(staging).toHaveLength(3); // 합계 행 제외
    expect(staging.every((r) => r.sourceKind === "meter")).toBe(true);
    expect(staging.every((r) => r.period === "2026-08")).toBe(true);
    const reversed = staging.find((r) => r.roomKey === "B101");
    expect(reversed?.hasError).toBe(true);
  });
});
