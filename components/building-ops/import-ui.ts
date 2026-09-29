/**
 * 외부 파일 가져오기 화면의 공용 타입과 순수 보조 함수(서버 라우트와 클라이언트가 함께 쓴다).
 * 필수 항목 표시는 lib/import/validate.ts 의 규칙을 안내용으로만 옮겼다. 판정은 서버 검증과 DB 가 한다.
 */
export type ImportKind = "meter" | "bill" | "bank" | "expense";

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  meter: "검침 자료(전기·수도 등 지침)",
  bill: "청구서(전기·수도·가스 업체 고지서)",
  bank: "은행 입금 내역",
  expense: "비용 내역",
};
export const IMPORT_KIND_NOTE: Record<ImportKind, string> = {
  meter: "확정하면 그 달 검침 값으로 들어갑니다. 호실을 찾지 못한 행은 오류입니다.",
  bill: "확정하면 고른 항목의 비용으로 들어갑니다. 항목이 호실별 직접 입력이면 호실별 금액으로 들어갑니다.",
  bank: "확정하면 입금 기록만 만듭니다. 어느 청구에 맞출지는 수납 확인 화면에서 사람이 정합니다.",
  expense: "확정하면 고른 항목의 비용으로 들어갑니다.",
};

export const FIELD_LABEL: Record<string, string> = {
  room: "호실", building: "동", floor: "층", occupantName: "입주자", meterNo: "계량기 번호", customerNo: "고객번호", prevReading: "전월 지침", currReading: "당월 지침",
  usage: "사용량", multiplier: "배율", unit: "단위", readDate: "검침일", period: "청구월", baseFee: "기본요금", usageFee: "사용요금", vat: "부가세", totalAmount: "청구 합계",
  dueDate: "납기일", heatValue: "열량", correction: "보정", waterFee: "수도요금", sewerFee: "하수도요금", waterLevy: "물이용부담금", txnDatetime: "거래일시",
  depositor: "입금자", depositAmount: "입금액", withdrawAmount: "출금액", balance: "잔액", txnId: "거래번호", memo: "적요", branch: "취급점", item: "항목",
  amount: "금액", supplyAmount: "공급가액", taxAmount: "세액", vendor: "거래처",
};
export const REQUIRED_FIELDS: Record<ImportKind, string[]> = { meter: ["room", "currReading"], bill: ["totalAmount"], bank: [], expense: ["amount"] };
export const TOTAL_FIELD: Partial<Record<ImportKind, string>> = { bill: "totalAmount", expense: "amount", bank: "depositAmount" };

export type Mapping = Record<string, number>;

export interface AnalyzeResult {
  fileHash: string; fileName: string; sheets: { name: string; rows: number }[]; sheetIndex: number;
  headerRow: number; headers: string[]; detected: boolean; confidence: number; mapping: Mapping; fieldConfidence: Record<string, number>;
  fingerprint: string; template: boolean; preview: string[][]; dataRows: number;
}
export interface IssueLine { row: number | null; field: string | null; level: "error" | "warning"; code: string; message: string }
export interface ValidateResult {
  rows: number; excluded: number; errorRows: number; warningRows: number; issues: IssueLine[]; issuesTruncated: boolean;
  preview: { row: number; values: Record<string, string | number | null>; level: "ok" | "warning" | "error" }[];
}

/** 필드에 열을 지정한다. 같은 열이 다른 필드에 이미 있으면 그쪽을 비운다(한 열은 한 필드). col=null 이면 지정 해제. */
export function assignColumn(mapping: Mapping, field: string, col: number | null): Mapping {
  const next: Mapping = {};
  for (const [f, c] of Object.entries(mapping)) if (f !== field && c !== col) next[f] = c;
  if (col !== null) next[field] = col;
  return next;
}
export const missingRequired = (kind: ImportKind, mapping: Mapping): string[] => REQUIRED_FIELDS[kind].filter((f) => mapping[f] === undefined);

/** 데이터 행 번호(0부터) → 엑셀에서 보이는 행 번호(1부터). headerRow 는 1부터 센 머리글 행. */
export const sheetRowNo = (headerRow: number, rowIndex: number) => headerRow + rowIndex + 1;

/** 0 → A, 25 → Z, 26 → AA */
export function colLetter(i: number): string {
  let n = i, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
