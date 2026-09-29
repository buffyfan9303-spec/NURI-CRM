/**
 * 스프레드시트(xlsx/xls/csv) → 순수 문자열 행렬 파서.
 * 수식/매크로는 실행하지 않고 값만 읽는다(exceljs·TextDecoder만 사용, 셀 재계산 없음).
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { ImportParseError, type ParsedSheet, type ParsedSpreadsheet } from "./types";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 50_000;

function extOf(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "";
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // 수식 셀: 계산된 result만 쓰고 수식 자체는 실행하지 않는다.
    if ("result" in value && value.result != null) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    }
    if ("text" in value) return String((value as { text: unknown }).text ?? "");
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

/** 병합 셀: 마스터 셀 값을 범위 내 나머지 셀에 채운다(제목/머리글 2단 구성 대응). */
function fillMerges(rows: string[][], merges: string[]): void {
  for (const range of merges) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
    if (!m) continue;
    const colToNum = (s: string) => s.split("").reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    const c1 = colToNum(m[1]) - 1;
    const r1 = Number(m[2]) - 1;
    const c2 = colToNum(m[3]) - 1;
    const r2 = Number(m[4]) - 1;
    const master = rows[r1]?.[c1] ?? "";
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (!rows[r]) continue;
        if (!rows[r][c]) rows[r][c] = master;
      }
    }
  }
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheets: ParsedSheet[] = [];
  wb.eachSheet((worksheet) => {
    const rows: string[][] = [];
    let colCount = 0;
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as ExcelJS.CellValue[]; // 1-based, index 0 unused
      const arr: string[] = [];
      for (let i = 1; i < values.length; i++) arr.push(cellToString(values[i]));
      colCount = Math.max(colCount, arr.length);
      rows.push(arr);
    });
    if (rows.length > MAX_ROWS) {
      throw new ImportParseError("TOO_MANY_ROWS", `시트 "${worksheet.name}"의 행이 ${MAX_ROWS}개를 초과합니다.`);
    }
    for (const r of rows) while (r.length < colCount) r.push("");
    const merges = ((worksheet as unknown as { model?: { merges?: string[] } }).model?.merges ?? []) as string[];
    fillMerges(rows, merges);
    sheets.push({ name: worksheet.name, rows });
  });
  return sheets;
}

/** 구형 .xls: 공식 SheetJS 배포판(cdn.sheetjs.com tgz, 홈택스 담당과 공유)로 읽는다.
 * SheetJS는 파일에 저장된 계산 결과(cell.v)만 읽고 수식을 재실행하지 않는다.
 */
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function parseXls(buffer: Buffer): ParsedSheet[] {
  // 진짜 BIFF8(.xls, OLE2 컨테이너) 파일만 받는다 — 그 외는 SheetJS가 다른 포맷으로 오추정할 수 있다.
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(OLE2_MAGIC)) {
    throw new ImportParseError("UNSUPPORTED_XLS", "유효한 .xls(OLE2) 파일이 아닙니다.");
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
    if (raw.length > MAX_ROWS) {
      throw new ImportParseError("TOO_MANY_ROWS", `시트 "${name}"의 행이 ${MAX_ROWS}개를 초과합니다.`);
    }
    const colCount = raw.reduce((max, r) => Math.max(max, r.length), 0);
    const rows: string[][] = raw.map((r) => {
      const arr = r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v)));
      while (arr.length < colCount) arr.push("");
      return arr;
    });
    const merges = (ws["!merges"] ?? []).map(
      (m) => `${XLSX.utils.encode_cell(m.s)}:${XLSX.utils.encode_cell(m.e)}`,
    );
    fillMerges(rows, merges);
    sheets.push({ name, rows });
  }
  return sheets;
}

/** 간단 CSV 파서: 따옴표·콤마·개행 포함 필드를 처리한다(RFC4180 부분집합). */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\r") {
      // no-op, \n이 처리
    } else if (ch === "\n") {
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function decodeCsvBuffer(buffer: Buffer): string {
  // BOM 있으면 UTF-8로 확정
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  try {
    // fatal:true로 utf-8 디코딩 시도 — 잘못된 시퀀스면 예외 발생
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // 한전/은행 CSV는 CP949(EUC-KR)가 흔하다
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch {
      throw new ImportParseError("DECODE_FAILED", "CSV 인코딩을 판별할 수 없습니다(UTF-8/CP949 아님).");
    }
  }
}

export async function parseSpreadsheet(buffer: Buffer, fileName: string): Promise<ParsedSpreadsheet> {
  if (buffer.length > MAX_BYTES) {
    throw new ImportParseError("FILE_TOO_LARGE", `파일 크기가 ${MAX_BYTES / 1024 / 1024}MB를 초과합니다.`);
  }
  const ext = extOf(fileName);
  if (ext === "xlsx" || ext === "xlsm") {
    return { sheets: await parseXlsx(buffer) };
  }
  if (ext === "xls") {
    try {
      return { sheets: parseXls(buffer) };
    } catch (err) {
      if (err instanceof ImportParseError) throw err;
      throw new ImportParseError(
        "UNSUPPORTED_XLS",
        "구형 .xls 파일을 읽지 못했습니다. 엑셀에서 '다른 이름으로 저장 → xlsx'로 변환 후 업로드하세요.",
      );
    }
  }
  if (ext === "csv") {
    const text = decodeCsvBuffer(buffer);
    const rows = parseCsvText(text);
    if (rows.length > MAX_ROWS) {
      throw new ImportParseError("TOO_MANY_ROWS", `행이 ${MAX_ROWS}개를 초과합니다.`);
    }
    return { sheets: [{ name: "csv", rows }] };
  }
  throw new ImportParseError("UNSUPPORTED_FORMAT", `지원하지 않는 파일 형식입니다: .${ext || "?"}`);
}
