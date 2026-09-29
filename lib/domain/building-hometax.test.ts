import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import {
  buildHometaxWorkbook,
  neutralizeCell,
  validateHometaxRows,
  HOMETAX_DATA_START_ROW,
  HOMETAX_HEADER_ROW,
  HOMETAX_SHEET_NAME,
  type HometaxFormat,
  type HometaxKind,
  type HometaxRow,
} from "./building-hometax";

// 홈택스 공식 .xls 에서 추출한 머리글(docs/design-references/hometax/official-headers.json)
const OFFICIAL = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../docs/design-references/hometax/official-headers.json"), "utf8"),
) as Record<HometaxKind, { sheetNames: string[]; headerRow: number; dataStartRow: number; title: string; notes: string[]; headers: string[]; merges: number[][] }>;

/** 가짜 사업자번호: 앞 9자리 + 국세청 검증번호. 실제 상호·번호는 쓰지 않는다. */
function fakeBizNo(nine: string): string {
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const d = nine.split("").map(Number);
  let s = d.reduce((n, x, i) => n + x * w[i], 0) + Math.floor((d[8] * 5) / 10);
  return nine + ((10 - (s % 10)) % 10);
}
const SUPPLIER_NO = fakeBizNo("111222333");
const RECEIVER_NO = fakeBizNo("444555666");

function row(kind: HometaxKind, over: Partial<HometaxRow> = {}): HometaxRow {
  const supply = 100_000;
  const tax = kind === "tax_invoice" ? 10_000 : 0;
  return {
    writeDate: "20260925",
    supplier: { bizNo: SUPPLIER_NO, name: "테스트빌딩관리", ceo: "홍길동", address: "가상시 가상구 1", email: "a@example.com" },
    receiver: { bizNo: RECEIVER_NO, name: "가짜상사", ceo: "김가짜", email: "b@example.com" },
    items: [{ day: 25, name: "9월 관리비", supply, tax: kind === "tax_invoice" ? tax : undefined }],
    supplyTotal: supply,
    taxTotal: tax,
    total: supply + tax,
    receiptType: "02",
    ...over,
  };
}

/** 생성 파일을 SheetJS 로 다시 읽는다(xls·xlsx 공통). 테스트 전용 — 앱 코드는 쓰기만 한다. */
function readBack(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer", cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r: r - 1, c })] as XLSX.CellObject | undefined;
  const rowValues = (r: number, n: number) => Array.from({ length: n }, (_, c) => cell(r, c)?.v ?? null);
  return { wb, ws, cell, rowValues };
}

const CASES: Array<[HometaxKind, HometaxFormat]> = [
  ["tax_invoice", "xls"], ["invoice_exempt", "xls"], ["tax_invoice", "xlsx"], ["invoice_exempt", "xlsx"],
];

describe.each(CASES)("공식 양식 구조 — %s · %s", (kind, format) => {
  it("시트명·안내문·6행 머리글·열 순서가 공식 파일과 같다", async () => {
    const res = await buildHometaxWorkbook([row(kind)], kind, { format });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    const off = OFFICIAL[kind];
    const { wb, ws, cell, rowValues } = readBack(res.files[0].buffer);
    expect(res.files[0].fileName.endsWith(`.${format}`)).toBe(true);
    if (format === "xls") expect(res.files[0].buffer.subarray(0, 4).toString("hex")).toBe("d0cf11e0"); // OLE2(BIFF8)
    expect(wb.SheetNames[0]).toBe(off.sheetNames[0]);
    expect(wb.SheetNames[0]).toBe(HOMETAX_SHEET_NAME);
    expect(HOMETAX_HEADER_ROW).toBe(off.headerRow);
    expect(HOMETAX_DATA_START_ROW).toBe(off.dataStartRow);
    expect(cell(1, 0)?.v).toBe(off.title);
    expect([2, 3, 4].map((r) => cell(r, 0)?.v)).toEqual(off.notes);
    expect(rowValues(off.headerRow, off.headers.length)).toEqual(off.headers);
    expect(cell(off.headerRow, off.headers.length)).toBeUndefined();
    expect(XLSX.utils.decode_range(ws["!ref"]!).e.c + 1).toBe(off.headers.length);
    const merges = (ws["!merges"] ?? []).map((m) => [m.s.r, m.s.c, m.e.r, m.e.c]);
    expect(merges.sort()).toEqual([...off.merges].sort());
  });

  it("데이터는 7행부터, 전부 텍스트(@) 셀이고 수식이 없으며 값이 제자리에 있다", async () => {
    const res = await buildHometaxWorkbook([row(kind)], kind, { format });
    if (!res.ok) throw new Error("fail");
    const off = OFFICIAL[kind];
    const { ws, cell, rowValues } = readBack(res.files[0].buffer);
    const vals = rowValues(7, off.headers.length);
    const at = (h: string) => vals[off.headers.indexOf(h)];
    expect(at(off.headers[0])).toBe(kind === "tax_invoice" ? "01" : "05");
    expect(at("작성일자")).toBe("20260925");
    expect(at('공급자 등록번호\n("-" 없이 입력)')).toBe(SUPPLIER_NO);
    expect(at("공급받는자 상호")).toBe("가짜상사");
    expect(at("공급가액")).toBe("100000");
    expect(at("일자1\n(2자리, 작성년월 제외)")).toBe("25");
    expect(at("공급가액1")).toBe("100000");
    expect(at("영수(01),\n청구(02)")).toBe("02");
    if (kind === "tax_invoice") expect(at("세액")).toBe("10000");
    else expect(off.headers).not.toContain("세액");
    for (let c = 0; c < off.headers.length; c++) {
      const cl = cell(7, c);
      if (cl && cl.v !== "") {
        expect(cl.t).toBe("s");
        expect(cl.z).toBe("@");
      }
    }
    for (const k of Object.keys(ws)) if (!k.startsWith("!")) expect((ws[k] as XLSX.CellObject).f).toBeUndefined();
  });
});

describe("검증 — 오류가 있으면 파일을 만들지 않는다", () => {
  it("사업자번호 체크섬 오류", async () => {
    const bad = row("tax_invoice", { receiver: { bizNo: "1234567890", name: "x", ceo: "y" } });
    const res = await buildHometaxWorkbook([bad], "tax_invoice");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.map((e) => e.field)).toContain("receiver.bizNo");
  });

  it("세액이 공급가액의 10%와 1원 넘게 다르면 오류, 1원 이내는 통과", () => {
    const off2 = row("tax_invoice", { taxTotal: 10_002, total: 110_002, items: [{ day: 25, supply: 100_000, tax: 10_002 }] });
    expect(validateHometaxRows([off2], "tax_invoice").errors.map((e) => e.field)).toContain("taxTotal");
    const off1 = row("tax_invoice", { taxTotal: 10_001, total: 110_001, items: [{ day: 25, supply: 100_000, tax: 10_001 }] });
    expect(validateHometaxRows([off1], "tax_invoice").errors).toEqual([]);
  });

  it("면세는 세액 0이어야 한다", () => {
    const r = row("invoice_exempt", { taxTotal: 10, total: 100_010 });
    expect(validateHometaxRows([r], "invoice_exempt").errors.length).toBeGreaterThan(0);
  });

  it("필수 공란·합계 불일치·날짜 형식", () => {
    const r = row("tax_invoice", { writeDate: "2026-09-25", total: 1 });
    r.supplier = { ...r.supplier, name: " " };
    const fields = validateHometaxRows([r], "tax_invoice").errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["writeDate", "supplier.name", "total"]));
    expect(validateHometaxRows([row("tax_invoice", { writeDate: "20260231" })], "tax_invoice").errors.map((e) => e.field)).toContain("writeDate");
  });

  it("공급자 혼합 금지", async () => {
    const other = row("tax_invoice", { supplier: { bizNo: fakeBizNo("777888999"), name: "다른", ceo: "사람" } });
    const res = await buildHometaxWorkbook([row("tax_invoice"), other], "tax_invoice");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.row === -1 && e.field === "supplier")).toBe(true);
  });

  it("같은 수신자·월·금액 반복은 경고(막지는 않음)", async () => {
    const res = await buildHometaxWorkbook([row("tax_invoice"), row("tax_invoice")], "tax_invoice");
    expect(res.ok).toBe(true);
    expect(res.warnings.map((w) => w.field)).toEqual(["duplicate"]);
  });
});

describe("분할·품목 합산·무해화", () => {
  it("250건은 100·100·50 세 파일(기본 .xls)", async () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      row("tax_invoice", { receiver: { bizNo: RECEIVER_NO, subBizNo: String(i % 10000).padStart(4, "0"), name: `호실${i}`, ceo: "임차인" } }),
    );
    const res = await buildHometaxWorkbook(rows, "tax_invoice");
    if (!res.ok) throw new Error(JSON.stringify(res.errors.slice(0, 3)));
    expect(res.files.map((f) => f.count)).toEqual([100, 100, 50]);
    expect(res.files[2].fileName).toBe("홈택스_세금계산서_202609_3of3.xls");
    const { cell } = readBack(res.files[0].buffer);
    expect(cell(106, 12)?.v).toBe("호실99");
    expect(cell(107, 0)).toBeUndefined();
  });

  it("품목 5개 이상은 4번째 칸에 합산", async () => {
    const items = [1, 2, 3, 4, 5, 6].map((d) => ({ day: d, name: `항목${d}`, supply: 1000, tax: 100 }));
    const r = row("tax_invoice", { items, supplyTotal: 6000, taxTotal: 600, total: 6600 });
    const res = await buildHometaxWorkbook([r], "tax_invoice");
    if (!res.ok) throw new Error("fail");
    const h = OFFICIAL.tax_invoice.headers;
    const v = readBack(res.files[0].buffer).rowValues(7, h.length);
    expect(v[h.indexOf("품목4")]).toBe("항목4 외 2건");
    expect(v[h.indexOf("공급가액4")]).toBe("3000");
    expect(v[h.indexOf("세액4")]).toBe("300");
  });

  it.each<HometaxFormat>(["xls", "xlsx"])("=,+,-,@ 로 시작하는 문자열은 무해화 — %s", async (format) => {
    expect(neutralizeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(neutralizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeCell("정상")).toBe("정상");
    const r = row("tax_invoice", { note: "=1+1", receiver: { bizNo: RECEIVER_NO, name: "+cmd", ceo: "-x" } });
    const res = await buildHometaxWorkbook([r], "tax_invoice", { format });
    if (!res.ok) throw new Error("fail");
    const h = OFFICIAL.tax_invoice.headers;
    const { ws, rowValues } = readBack(res.files[0].buffer);
    const v = rowValues(7, h.length);
    expect(v[h.indexOf("비고")]).toBe("'=1+1");
    expect(v[h.indexOf("공급받는자 상호")]).toBe("'+cmd");
    for (const k of Object.keys(ws)) if (!k.startsWith("!")) expect((ws[k] as XLSX.CellObject).f).toBeUndefined();
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.files[0].buffer as unknown as ArrayBuffer);
      wb.worksheets[0].eachRow((rr) => rr.eachCell((c) => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)));
    }
  });
});
