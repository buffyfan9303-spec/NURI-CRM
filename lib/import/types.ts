/**
 * 건물 관리비 엑셀/CSV 자동 가져오기 — 공용 타입.
 *
 * DB 담당이 `lib/domain/building-types.ts`에 정식 스테이징 타입을 만들 때까지,
 * 이 파일의 `BuildingStagingRowInput`이 `toStagingRows()`의 출력 계약이다.
 * 필드명이 다르면 DB 담당과 맞춰서 이 인터페이스만 갱신하면 된다(어댑터 내부 로직은 안 바뀜).
 */

export type SourceKind = "meter" | "bill" | "bank" | "expense";

/** 소스별 필드 키. synonyms.ts의 사전과 1:1 대응. */
export const SOURCE_FIELDS: Record<SourceKind, readonly string[]> = {
  meter: [
    "room",
    "building",
    "floor",
    "occupantName",
    "meterNo",
    "customerNo",
    "prevReading",
    "currReading",
    "usage",
    "multiplier",
    "unit",
    "readDate",
  ],
  bill: [
    "period",
    "usage",
    "unit",
    "baseFee",
    "usageFee",
    "vat",
    "totalAmount",
    "dueDate",
    "customerNo",
    "heatValue",
    "correction",
    "waterFee",
    "sewerFee",
    "waterLevy",
  ],
  bank: [
    "txnDatetime",
    "depositor",
    "depositAmount",
    "withdrawAmount",
    "balance",
    "txnId",
    "memo",
    "branch",
  ],
  expense: ["item", "amount", "supplyAmount", "taxAmount", "vendor", "period"],
} as const;

export interface ParsedSheet {
  name: string;
  rows: string[][];
}

export interface ParsedSpreadsheet {
  sheets: ParsedSheet[];
}

export class ImportParseError extends Error {
  code:
    | "FILE_TOO_LARGE"
    | "TOO_MANY_ROWS"
    | "UNSUPPORTED_XLS"
    | "UNSUPPORTED_FORMAT"
    | "DECODE_FAILED";
  constructor(code: ImportParseError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "ImportParseError";
  }
}

export interface HeaderDetectResult {
  headerRowIndex: number;
  headers: string[];
  sourceKind: SourceKind;
  confidence: number;
}

export interface MappingResult {
  sourceKind: SourceKind;
  /** field → 0-based column index. 매칭 못한 필드는 없음. */
  mapping: Record<string, number>;
  /** field별 매칭 점수(0~1). */
  fieldConfidence: Record<string, number>;
  /** 전체 평균 신뢰도(0~1). */
  confidence: number;
  /** 헤더 지문 — 저장해 두면 다음에 같은 양식일 때 재사용 가능. */
  fingerprint: string;
}

export type CellIssueLevel = "error" | "warning";

export interface RowIssue {
  rowIndex: number; // 데이터 행 기준 0-based (헤더 제외)
  field?: string;
  level: CellIssueLevel;
  code: string;
  message: string;
}

export interface ValidationContext {
  /** 매칭 대상 호실 목록(있으면 호실 퍼지매칭에 사용). */
  units?: string[];
  /** 호실별 전월 지침(검침 역전 검사용). key = 정규화된 호실 키. */
  prevReadings?: Record<string, number>;
  /** 이번 회차 기간(YYYY-MM). */
  period?: string;
  /** 이 회차 총액(고지서 원본 합계) — 있으면 파일 합계와 대조(V8). */
  expectedTotal?: number;
  /** 계량기 단위(㎥/MJ/kWh 등) — 있으면 파일 단위와 다르면 차단(V12). */
  expectedUnit?: string;
  /** 은행 거래: 앞 행 잔액(이월 잔액) — 없으면 파일 첫 행부터 잔액 연속성만 검사(V9). */
  openingBalance?: number;
  /** 입금 후보 매칭용 청구 정보: 호실별 이번 회차 청구액(V11, 자동 배정하지 않고 후보만 제시). */
  expectedCharges?: Record<string, number>;
}

export interface ValidatedRow {
  rowIndex: number;
  values: Record<string, string>;
  /** normalize.ts를 거친 값들(금액=원 단위 정수, 날짜=YYYY-MM-DD 등). */
  normalized: Record<string, string | number | null>;
  issues: RowIssue[];
  /** 합계/소계 행으로 판단되어 제외 대상인 경우 true. */
  excluded: boolean;
}

/**
 * DB 담당의 건물 스테이징 테이블에 넣을 입력 형태(잠정).
 * 실제 컬럼명은 lib/domain/building-types.ts가 정의하는 대로 맞춘다.
 */
export interface BuildingStagingRowInput {
  sourceKind: SourceKind;
  period: string | null;
  roomKey: string | null;
  roomMatchType: "exact" | "fuzzy" | "none" | null;
  fields: Record<string, string | number | null>;
  hasError: boolean;
  hasWarning: boolean;
  issues: RowIssue[];
}
