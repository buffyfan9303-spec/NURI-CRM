/**
 * 건물 관리비(building) — 홈택스 "전자(세금)계산서 일괄발급" 엑셀 업로드 파일 생성. 서버 전용(SheetJS·exceljs, Buffer).
 * "use server" 가 아니다: 서버 액션/라우트에서 import 해서 쓰는 순수 함수 모듈. 클라이언트에서 import 금지.
 *
 * 기준: 홈택스 공식 양식 `세금계산서등록양식(일반).xls`·`계산서등록양식(일반).xls`
 * (docs/design-references/hometax/ 원본 + official-headers.json, 설명은 HOMETAX-BULK-FORMAT.md).
 *  - 시트 '엑셀업로드양식', 1~4행 안내문, 6행 머리글, 7행부터 데이터, 파일당 최대 100건, 품목 칸 4개.
 *  - 양식의 데이터 셀은 전부 텍스트(@) 서식이다. 숫자 셀로 넣으면 "공급가액 항목 오류"가 나는 사례가 있어
 *    금액·코드·날짜도 텍스트 셀로 쓴다(수식은 절대 넣지 않는다 — 공식 유의사항).
 *
 * 이 파일은 "업로드할 파일 준비"까지다. 발행은 사용자가 홈택스에서 하고 승인번호를 따로 기록한다.
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { isValidBizRegNo, normalizeBizRegNo } from "@/lib/external/bizno";

export type HometaxKind = "tax_invoice" | "invoice_exempt";
export type HometaxFormat = "xls" | "xlsx";

/** 공급자·공급받는자. building-types.ts 가 생기면 그 타입으로 맞춘다. */
export interface HometaxParty {
  /** 사업자등록번호(하이픈 허용). 공급받는자는 주민등록번호 13자리·외국인 9999999999999 도 허용(공식). */
  bizNo: string;
  /** 종사업장번호 4자리(사업자단위과세만). */
  subBizNo?: string;
  name: string; // 상호
  ceo: string; // 성명(대표자)
  address?: string;
  bizType?: string; // 업태
  bizItem?: string; // 종목
  email?: string;
  /** 공급받는자만 쓴다(이메일2). */
  email2?: string;
}

export interface HometaxItem {
  /** 일(1~31). 년월은 작성일자의 년월이 적용된다(공식). */
  day: number;
  name?: string; // 품목
  spec?: string; // 규격
  qty?: number; // 수량(소수 2자리까지)
  unitPrice?: number; // 단가(소수 2자리까지)
  supply: number; // 공급가액(원, 정수)
  /** 세액(원, 정수). 면세는 비우거나 0. */
  tax?: number;
  note?: string; // 품목비고
}

export interface HometaxRow {
  /** 작성일자 YYYYMMDD */
  writeDate: string;
  supplier: HometaxParty;
  receiver: HometaxParty;
  items: HometaxItem[];
  supplyTotal: number;
  taxTotal: number; // 면세는 0
  total: number; // 합계금액 = 공급가액 + 세액 (양식에는 칸이 없고 검증에만 쓴다)
  /** 01 영수 · 02 청구 */
  receiptType: "01" | "02";
  note?: string; // 비고
}

export interface HometaxIssue {
  /** 입력 배열의 0부터 시작하는 순번. 파일 단위 문제는 -1. */
  row: number;
  field: string;
  message: string;
}

export interface HometaxFile {
  fileName: string;
  buffer: Buffer;
  count: number;
}

export type HometaxBuildResult =
  | { ok: true; files: HometaxFile[]; warnings: HometaxIssue[] }
  | { ok: false; errors: HometaxIssue[]; warnings: HometaxIssue[] };

export const HOMETAX_MAX_ROWS_PER_FILE = 100;
export const HOMETAX_MAX_ITEMS = 4;
export const HOMETAX_SHEET_NAME = "엑셀업로드양식";
export const HOMETAX_HEADER_ROW = 6;
export const HOMETAX_DATA_START_ROW = 7;

// ── 공식 양식 문구(원본 .xls 에서 추출, 테스트가 official-headers.json 과 대조) ─────────────
const COMMON_NOTE_1 = "★주황색으로 표시된 부분은 필수입력항목으로 반드시 입력하셔야 합니다.\n★아래 '항목설명' 시트를 참고하여 작성하시기 바랍니다.";
const COMMON_NOTE_3 =
  "★전자(세금)계산서 종류는 엑셀 업로드 양식에 따라 해당 전자(세금)계산서 종류코드를 반드시 입력하셔야 합니다.\n★품목은 1건이상 입력해야 합니다.\n★공급받는자 등록번호는 사업자등록번호, 주민등록번호를 입력할 수 있습니다. \n   외국인인 경우 '9999999999999'를 입력하시고, 비고란에  외국인등록번호 또는 여권번호를 입력하시기 바랍니다.";
const note2 = (verb: string) =>
  `★실제 업로드할 DATA는 7행부터 입력하여야 합니다. 최대 100건까지 입력이 가능하나, ${verb}은 최대 10건씩 처리가 됩니다.(100건 초과 자료는 처리 안됨)\n★임의로 행을 추가하거나 삭제하는 경우 파일을 제대로 읽지 못하는 경우가 있으므로, 주어진 양식안에 반드시 작성을 하시기 바랍니다.`;

const FORM = {
  tax_invoice: {
    code: "01", // 01 일반 (02 영세율은 관리비에 해당 없음)
    title: "엑셀 업로드 양식(전자세금계산서-일반(영세율))",
    notes: [COMMON_NOTE_1, note2("발급"), COMMON_NOTE_3],
    kindHeader: "전자(세금)계산서 종류\n(01:일반, 02:영세율)",
    label: "세금계산서",
  },
  invoice_exempt: {
    code: "05", // 05 일반 전자계산서
    title: "엑셀 업로드 양식(전자계산서-일반)",
    notes: [COMMON_NOTE_1, note2("발행"), COMMON_NOTE_3],
    kindHeader: "전자(세금)계산서 종류\n(05::일반)",
    label: "계산서",
  },
} as const;

/** 공식 6행 머리글. 과세 59열(A~BG), 면세 54열(A~BB) — 면세는 세액 칸이 없다. */
export function hometaxHeaders(kind: HometaxKind): string[] {
  const tax = kind === "tax_invoice";
  const items: string[] = [];
  for (let i = 1; i <= HOMETAX_MAX_ITEMS; i++) {
    items.push(`일자${i}\n(2자리, 작성년월 제외)`, `품목${i}`, `규격${i}`, `수량${i}`, `단가${i}`, `공급가액${i}`);
    if (tax) items.push(`세액${i}`);
    items.push(`품목비고${i}`);
  }
  return [
    FORM[kind].kindHeader, "작성일자",
    '공급자 등록번호\n("-" 없이 입력)', "공급자\n 종사업장번호", "공급자 상호", "공급자 성명",
    "공급자 사업장주소", "공급자 업태", "공급자 종목", "공급자 이메일",
    '공급받는자 등록번호\n("-" 없이 입력)', "공급받는자 \n종사업장번호", "공급받는자 상호", "공급받는자 성명",
    "공급받는자 사업장주소", "공급받는자 업태", "공급받는자 종목", "공급받는자 이메일1", "공급받는자 이메일2",
    "공급가액", ...(tax ? ["세액"] : []), "비고",
    ...items,
    "현금", "수표", "어음", "외상미수금", "영수(01),\n청구(02)",
  ];
}

// ── 문자열 도우미 ────────────────────────────────────────────────────────────
/** 홈택스 길이 기준: 영문·숫자 1byte, 한글 2byte. */
const byteLen = (s: string) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0);
const cutBytes = (s: string, max: number) => {
  let out = "";
  for (const ch of s) {
    if (byteLen(out + ch) > max) break;
    out += ch;
  }
  return out;
};

/** 수식 주입 무해화(OWASP CSV injection): = + - @ 탭 CR 로 시작하면 앞에 ' 를 붙인다. */
export function neutralizeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

const isYmd = (s: string) => {
  if (!/^\d{8}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const daysInMonth = (ymd: string) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6), 0)).getUTCDate();
const isWon = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
/** 소수 2자리 이하 & 정수부 자리 제한(수량 10, 단가 13 — 공식 항목설명). */
const isDec2 = (n: number, intDigits: number) =>
  Number.isFinite(n) && n >= 0 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6 && Math.trunc(n) < 10 ** intDigits;
const dec2 = (n: number) => String(Math.round(n * 100) / 100);

// ── 검증 ─────────────────────────────────────────────────────────────────────
const LIMITS: Array<[keyof HometaxParty, string, number]> = [
  ["name", "상호", 70], ["ceo", "성명", 30], ["address", "사업장주소", 150],
  ["bizType", "업태", 40], ["bizItem", "종목", 60], ["email", "이메일", 40], ["email2", "이메일2", 40],
];

/**
 * 업로드 전 검증. errors 가 하나라도 있으면 파일을 만들지 않는다. warnings 는 막지 않는다(중복 의심 등).
 * kind 를 주지 않으면 세액 기준으로 과세/면세를 판단하지 않고 과세 규칙을 쓴다 — build 는 항상 kind 를 준다.
 */
export function validateHometaxRows(rows: HometaxRow[], kind: HometaxKind = "tax_invoice") {
  const errors: HometaxIssue[] = [];
  const warnings: HometaxIssue[] = [];
  const err = (row: number, field: string, message: string) => errors.push({ row, field, message });
  const taxable = kind === "tax_invoice";

  if (rows.length === 0) err(-1, "rows", "발행할 자료가 없습니다.");

  const supplierKeys = new Set<string>();
  const seen = new Map<string, number>();

  rows.forEach((r, i) => {
    // 작성일자
    if (!isYmd(r.writeDate ?? "")) err(i, "writeDate", "작성일자는 YYYYMMDD 형식의 실제 날짜여야 합니다.");

    // 공급자 — 사업자등록번호 10자리 + 체크섬
    const sNo = normalizeBizRegNo(r.supplier?.bizNo ?? "");
    if (!isValidBizRegNo(sNo)) err(i, "supplier.bizNo", "공급자 사업자등록번호가 올바르지 않습니다(10자리·검증번호).");
    supplierKeys.add(`${sNo}|${r.supplier?.subBizNo ?? ""}`);

    // 공급받는자 — 사업자번호(체크섬) 또는 주민번호 13자리/외국인 9999999999999(공식 허용)
    const rNo = normalizeBizRegNo(r.receiver?.bizNo ?? "");
    if (rNo.length === 13) {
      if (rNo === "9999999999999" && !r.note?.trim()) err(i, "note", "외국인은 비고에 외국인등록번호 또는 여권번호를 적어야 합니다.");
    } else if (!isValidBizRegNo(rNo)) {
      err(i, "receiver.bizNo", "공급받는자 등록번호가 올바르지 않습니다(사업자 10자리·검증번호 또는 13자리).");
    }

    for (const [who, p] of [["supplier", r.supplier], ["receiver", r.receiver]] as const) {
      const label = who === "supplier" ? "공급자" : "공급받는자";
      if (!p?.name?.trim()) err(i, `${who}.name`, `${label} 상호가 비었습니다.`);
      if (!p?.ceo?.trim()) err(i, `${who}.ceo`, `${label} 성명(대표자)이 비었습니다.`);
      if (p?.subBizNo && !/^\d{4}$/.test(p.subBizNo)) err(i, `${who}.subBizNo`, `${label} 종사업장번호는 숫자 4자리입니다.`);
      for (const [key, name, max] of LIMITS) {
        const v = p?.[key];
        if (typeof v === "string" && byteLen(v) > max) err(i, `${who}.${key}`, `${label} ${name}이(가) 너무 깁니다(최대 ${max}byte, 한글 2byte).`);
      }
    }
    if (r.note && byteLen(r.note) > 150) err(i, "note", "비고가 너무 깁니다(최대 150byte).");
    if (r.receiptType !== "01" && r.receiptType !== "02") err(i, "receiptType", "영수(01)/청구(02) 중 하나여야 합니다.");

    // 품목
    const items = r.items ?? [];
    if (items.length === 0) err(i, "items", "품목은 1건 이상이어야 합니다.");
    const dim = isYmd(r.writeDate ?? "") ? daysInMonth(r.writeDate) : 31;
    items.forEach((it, k) => {
      const f = `items[${k}]`;
      if (!Number.isInteger(it.day) || it.day < 1 || it.day > dim) err(i, `${f}.day`, `품목${k + 1} 일자가 작성월에 없는 날입니다.`);
      if (!isWon(it.supply)) err(i, `${f}.supply`, `품목${k + 1} 공급가액은 0 이상 정수(원)여야 합니다.`);
      if (taxable ? !isWon(it.tax) : (it.tax ?? 0) !== 0) err(i, `${f}.tax`, taxable ? `품목${k + 1} 세액이 비었거나 정수가 아닙니다.` : `면세 계산서는 품목 세액이 0이어야 합니다.`);
      if (it.qty != null && !isDec2(it.qty, 10)) err(i, `${f}.qty`, `품목${k + 1} 수량은 소수 2자리까지(정수 10자리)입니다.`);
      if (it.unitPrice != null && !isDec2(it.unitPrice, 13)) err(i, `${f}.unitPrice`, `품목${k + 1} 단가는 소수 2자리까지(정수 13자리)입니다.`);
      if (it.name && byteLen(it.name) > 100) err(i, `${f}.name`, `품목${k + 1} 이름이 너무 깁니다(최대 100byte).`);
      if (it.spec && byteLen(it.spec) > 60) err(i, `${f}.spec`, `품목${k + 1} 규격이 너무 깁니다(최대 60byte).`);
      if (it.note && byteLen(it.note) > 100) err(i, `${f}.note`, `품목${k + 1} 비고가 너무 깁니다(최대 100byte).`);
    });

    // 금액 — 합계 일치, 과세는 세액 ≈ 공급가액×10%(±1원), 면세는 세액 0
    if (!isWon(r.supplyTotal) || r.supplyTotal >= 1e15) err(i, "supplyTotal", "공급가액은 0 이상 정수(원)여야 합니다.");
    if (!isWon(r.taxTotal)) err(i, "taxTotal", "세액은 0 이상 정수(원)여야 합니다.");
    const sumSupply = items.reduce((n, it) => n + (it.supply || 0), 0);
    const sumTax = items.reduce((n, it) => n + (it.tax || 0), 0);
    if (sumSupply !== r.supplyTotal) err(i, "supplyTotal", `품목 공급가액 합(${sumSupply})과 공급가액(${r.supplyTotal})이 다릅니다.`);
    if (sumTax !== r.taxTotal) err(i, "taxTotal", `품목 세액 합(${sumTax})과 세액(${r.taxTotal})이 다릅니다.`);
    if (r.supplyTotal + r.taxTotal !== r.total) err(i, "total", "합계금액이 공급가액+세액과 다릅니다.");
    if (taxable && isWon(r.supplyTotal) && Math.abs(Math.round(r.supplyTotal * 0.1) - r.taxTotal) > 1)
      err(i, "taxTotal", `세액(${r.taxTotal})이 공급가액의 10%(${Math.round(r.supplyTotal * 0.1)})와 1원 넘게 차이 납니다.`);
    if (!taxable && r.taxTotal !== 0) err(i, "taxTotal", "면세 계산서는 세액이 0이어야 합니다.");

    // 중복 발행 의심: 같은 수신자·같은 월·같은 합계
    const key = `${rNo}|${r.receiver?.subBizNo ?? ""}|${(r.writeDate ?? "").slice(0, 6)}|${r.total}`;
    const prev = seen.get(key);
    if (prev != null) warnings.push({ row: i, field: "duplicate", message: `${prev + 1}번째 자료와 같은 수신자·같은 월·같은 금액입니다. 중복 발행이 아닌지 확인하세요.` });
    else seen.set(key, i);
  });

  if (supplierKeys.size > 1) err(-1, "supplier", "한 파일에는 공급자 한 곳만 넣을 수 있습니다. 공급자별로 나눠 주세요.");
  return { errors, warnings };
}

// ── 생성 ─────────────────────────────────────────────────────────────────────
/** 품목이 4개를 넘으면 4번째 칸에 나머지를 "○○ 외 N건"으로 합산한다(품목명은 필수 아님, 금액 합은 불변). */
function fitItems(items: HometaxItem[]): HometaxItem[] {
  if (items.length <= HOMETAX_MAX_ITEMS) return items;
  const rest = items.slice(HOMETAX_MAX_ITEMS - 1);
  const suffix = ` 외 ${rest.length - 1}건`;
  return [
    ...items.slice(0, HOMETAX_MAX_ITEMS - 1),
    {
      day: rest[0].day,
      name: cutBytes(rest[0].name ?? "기타", 100 - byteLen(suffix)) + suffix,
      supply: rest.reduce((n, it) => n + it.supply, 0),
      tax: rest.reduce((n, it) => n + (it.tax ?? 0), 0),
    },
  ];
}

function rowCells(r: HometaxRow, kind: HometaxKind): string[] {
  const tax = kind === "tax_invoice";
  const t = (s: string | undefined) => neutralizeCell(s?.trim() ?? "");
  const n = (v: number | undefined) => (v == null ? "" : String(v));
  const party = (p: HometaxParty) => [
    normalizeBizRegNo(p.bizNo), p.subBizNo ?? "", t(p.name), t(p.ceo), t(p.address), t(p.bizType), t(p.bizItem), t(p.email),
  ];
  const itemCells: string[] = [];
  const items = fitItems(r.items);
  for (let k = 0; k < HOMETAX_MAX_ITEMS; k++) {
    const it = items[k];
    if (!it) {
      itemCells.push(...Array(tax ? 8 : 7).fill(""));
      continue;
    }
    itemCells.push(String(it.day).padStart(2, "0"), t(it.name), t(it.spec),
      it.qty == null ? "" : dec2(it.qty), it.unitPrice == null ? "" : dec2(it.unitPrice), n(it.supply));
    if (tax) itemCells.push(n(it.tax ?? 0));
    itemCells.push(t(it.note));
  }
  return [
    FORM[kind].code, r.writeDate,
    ...party(r.supplier),
    ...party(r.receiver), t(r.receiver.email2),
    n(r.supplyTotal), ...(tax ? [n(r.taxTotal)] : []), t(r.note),
    ...itemCells,
    "", "", "", "", // 현금·수표·어음·외상미수금 — 선택 항목, 비워 둔다
    r.receiptType,
  ];
}

/** 시트 전체(1행부터): 1행 제목, 2~4행 안내, 5행 빈 줄, 6행 머리글, 7행부터 데이터. 두 출력 형식이 공유한다. */
function sheetMatrix(rows: HometaxRow[], kind: HometaxKind): string[][] {
  const form = FORM[kind];
  return [[form.title], ...form.notes.map((n) => [n]), [], hometaxHeaders(kind), ...rows.map((r) => rowCells(r, kind))];
}
// 공식 원본과 같은 병합: A1:G1, A2:L2~A4:L4 (xlrd 로 원본 확인, 0-based 포함 끝)
const MERGES = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
  ...[1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: 11 } })),
];

/** .xls(BIFF8) — 공식 양식과 같은 형식. SheetJS CE 0.20.3(공식 CDN tgz)는 쓰기에만 쓴다. */
function toXls(matrix: string[][]): Buffer {
  const ws: XLSX.WorkSheet = {};
  matrix.forEach((cells, r) =>
    cells.forEach((v, c) => {
      // t:"s" 문자열 셀 + "@" 텍스트 서식. 수식(f)은 절대 넣지 않는다.
      ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v, z: "@" };
    }),
  );
  const width = Math.max(...matrix.map((r) => r.length));
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: matrix.length - 1, c: width - 1 } });
  ws["!merges"] = MERGES;
  ws["!cols"] = Array.from({ length: width }, () => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, HOMETAX_SHEET_NAME);
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" }) as Buffer;
}

/** .xlsx — 대안. 홈택스가 .xlsx 를 받는지는 미확인(HOMETAX-BULK-FORMAT.md §5). */
async function toXlsx(matrix: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(HOMETAX_SHEET_NAME);
  matrix.forEach((cells, r) => {
    if (!cells.length) return;
    const row = ws.getRow(r + 1);
    // 문자열 배열이라 exceljs 는 전부 공유 문자열(텍스트) 셀로 쓴다 — 수식이 될 수 없다.
    row.values = cells;
    if (r + 1 >= HOMETAX_DATA_START_ROW) row.eachCell({ includeEmpty: true }, (c) => (c.numFmt = "@"));
    if (r + 1 === HOMETAX_HEADER_ROW) row.eachCell((c) => (c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }));
  });
  for (const m of MERGES) ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
  ws.columns.forEach((col) => (col.width = 14));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * 검증 통과 시 100건씩 나눈 파일 목록을 돌려준다. 하나라도 오류면 파일 없이 오류 목록만.
 * 기본 형식은 공식 양식과 같은 .xls(BIFF8). .xlsx 는 대안.
 * 파일명: 홈택스_세금계산서_YYYYMM_1of2.xls (YYYYMM = 첫 자료의 작성월)
 */
export async function buildHometaxWorkbook(
  rows: HometaxRow[],
  kind: HometaxKind,
  { format = "xls" }: { format?: HometaxFormat } = {},
): Promise<HometaxBuildResult> {
  const { errors, warnings } = validateHometaxRows(rows, kind);
  if (errors.length) return { ok: false, errors, warnings };

  const chunks: HometaxRow[][] = [];
  for (let i = 0; i < rows.length; i += HOMETAX_MAX_ROWS_PER_FILE) chunks.push(rows.slice(i, i + HOMETAX_MAX_ROWS_PER_FILE));
  const ym = rows[0].writeDate.slice(0, 6);
  const files = await Promise.all(
    chunks.map(async (chunk, i) => ({
      fileName: `홈택스_${FORM[kind].label}_${ym}_${i + 1}of${chunks.length}.${format}`,
      buffer: format === "xls" ? toXls(sheetMatrix(chunk, kind)) : await toXlsx(sheetMatrix(chunk, kind)),
      count: chunk.length,
    })),
  );
  return { ok: true, files, warnings };
}
