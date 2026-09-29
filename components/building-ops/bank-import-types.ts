/** 은행 엑셀 일괄 넣기: 서버 미리보기(step=match)와 화면이 함께 쓰는 타입. */
export interface BankMatchRow {
  /** 시트의 행 번호 */
  row: number;
  /** 거래 시각(UTC ISO). 화면 표시는 사업장 시간대로 바꾼다. */
  paidAt: string;
  amount: number;
  payer: string;
  memo: string;
  /** 중복 방지 거래키(은행 거래번호 또는 일시+금액+입금자 해시) */
  key: string;
  status: "auto" | "review" | "none";
  /** 글자에서 찾은 호실 후보(auto 는 1개, review 는 여러 개) */
  unitIds: string[];
  by: "dongho" | "room" | "name" | null;
  /** 이미 등록된 거래키(최근 500건 안) */
  existing: boolean;
}
export interface BankMatchResult {
  fileName: string;
  rows: BankMatchRow[];
  stats: { withdraw: number; duplicateInFile: number; noDate: number; other: number };
}
export const MATCH_BY_LABEL: Record<NonNullable<BankMatchRow["by"]>, string> = { dongho: "동·호 글자", room: "호실 번호", name: "계약자 이름" };
