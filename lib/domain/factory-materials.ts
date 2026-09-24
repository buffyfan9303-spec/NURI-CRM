/**
 * 정장 주문의 "선택 자재"(원단/안감/단추) 저장 계약 — 클라이언트 세이프 순수 모듈.
 *
 * 문제: factory_orders에는 options(jsonb)/qty(jsonb) 두 컬럼만 있고 자재 선택을 담을
 * 전용 컬럼이 없다(0007_factory.sql, crm-data-security 소유라 마이그레이션 직접 작성 금지).
 * 재고 차감(consumeMaterial → material_moves)은 "쓰기 전용" 이력이라 상세 화면에 되읽을 수 없고,
 * inventory.adjust 권한이 없는 직원이 주문을 작성하면 선택 자재가 통째로 유실된다.
 *
 * 해결: options는 이미 자유 jsonb라 스키마 변경 없이 예약 키 하나(`_materials`)를 더 넣는다.
 * validateFactoryOptions()는 FACTORY_OPTION_FIELDS에 정의된 키만 검사하므로 이 키는
 * 41항목 검증에 영향을 주지 않는다. 41항목의 저장 키·한글 값은 그대로 보존된다.
 *
 * 재고 출고(consumeMaterial)와는 완전히 분리한다 — 이 모듈은 "무엇을 골랐는지"만 기록하고,
 * "실제로 재고에서 뺐는지"는 여전히 inventory.adjust 권한 + material_moves가 담당한다.
 */
import type { MaterialOption } from "./factory-types";

export const MATERIAL_SELECTION_KEY = "_materials" as const;

export interface MaterialSelection {
  fabricId: string | null;
  /** 선택 당시 스냅샷("코드 · 이름") — 자재 마스터가 나중에 바뀌어도 확정본 재현용으로 보존. */
  fabricLabel: string | null;
  liningId: string | null;
  liningLabel: string | null;
  buttonId: string | null;
  buttonLabel: string | null;
  /** 원단 무늬 반복 크기를 자재 마스터가 모를 때 사용자가 직접 보정한 값(원단/안감 별도). */
  patternCalibrationMm?: Partial<Record<"fabric" | "lining", { w: number; h: number }>>;
}

export const EMPTY_MATERIAL_SELECTION: MaterialSelection = {
  fabricId: null,
  fabricLabel: null,
  liningId: null,
  liningLabel: null,
  buttonId: null,
  buttonLabel: null,
};

export function readMaterialSelection(
  options: Record<string, unknown> | null | undefined
): MaterialSelection {
  const raw = options?.[MATERIAL_SELECTION_KEY];
  if (!raw || typeof raw !== "object") return { ...EMPTY_MATERIAL_SELECTION };
  const r = raw as Partial<MaterialSelection>;
  return {
    fabricId: r.fabricId ?? null,
    fabricLabel: r.fabricLabel ?? null,
    liningId: r.liningId ?? null,
    liningLabel: r.liningLabel ?? null,
    buttonId: r.buttonId ?? null,
    buttonLabel: r.buttonLabel ?? null,
    // undefined 값 키를 그대로 남기면 assert.deepEqual/JSON 비교에서 "키가 없는 것"과
    // 달라져 놀라움을 준다 — 실제로 보정값이 있을 때만 키 자체를 만든다.
    ...(r.patternCalibrationMm ? { patternCalibrationMm: r.patternCalibrationMm } : {}),
  };
}

/** options에 선택 자재를 얹는다. 41항목 키는 절대 건드리지 않는다(스프레드로 보존). */
export function writeMaterialSelection(
  options: Record<string, unknown>,
  selection: MaterialSelection
): Record<string, unknown> {
  return { ...options, [MATERIAL_SELECTION_KEY]: selection };
}

export function isMaterialSelectionEmpty(sel: MaterialSelection): boolean {
  return !sel.fabricId && !sel.liningId && !sel.buttonId;
}

/**
 * v_materials 한 행 → MaterialOption.
 *
 * **왜 따로 빼 놨나**: 예전 코드는 `repeat_width_mm`/`repeat_height_mm`/`image_url` 을 읽었는데
 * 실제 컬럼은 `repeat_w_mm`/`repeat_h_mm`/`swatch_path` 라, 값이 늘 undefined 인데도
 * `?? null` 때문에 **에러 없이 조용히 비어** 있었다. 타입 검사도 못 잡는다(Record<string, unknown>).
 * 그래서 컬럼명을 고정하는 회귀 테스트를 붙일 수 있게 순수 함수로 분리했다.
 * (scripts/test-factory-options.mjs — "v_materials 컬럼명" 케이스)
 */
export function mapMaterialRow(row: Record<string, unknown>): MaterialOption {
  // numeric 은 supabase-js 가 문자열로 줄 수 있어 Number() 로 맞춘다.
  const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  const repeatW = num(row.repeat_w_mm);
  const repeatH = num(row.repeat_h_mm);
  return {
    id: row.id as string,
    kind: row.kind as string,
    code: row.code as string,
    name: row.name as string,
    unit: row.unit as string,
    stock: row.stock as number,
    minStock: row.min_stock as number,
    vendor: (row.vendor as string) ?? null,
    colorHex: (row.color_hex as string) ?? null,
    patternKind: (row.pattern_kind as MaterialOption["patternKind"]) ?? null,
    repeatMm: repeatW && repeatH ? { w: repeatW, h: repeatH } : null,
    // 별도 컬럼이 아니라 파생값이다 — 반복 치수가 둘 다 있으면 실측된 것으로 본다.
    repeatCalibrated: Boolean(repeatW && repeatH),
    swatchPath: (row.swatch_path as string) ?? null,
    texturePath: (row.texture_path as string) ?? null,
    // 경로를 서명 URL 로 바꾸는 코드가 아직 없다. 있는 척하지 않는다(factory-types.ts 주석 참고).
    imageUrl: null,
    imageVersion: null,
  };
}
