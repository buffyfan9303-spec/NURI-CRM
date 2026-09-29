/**
 * 테스트용 가짜 샘플 파일 빌더. 실제 개인정보는 넣지 않는다(합성 데이터).
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import iconv from "iconv-lite";

/** 한전식 검침 xlsx: 제목 행(병합) + 실제 머리글 행 + 데이터. */
export async function buildKepcoMeterXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검침대장");
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "2026년 8월 전기 검침대장";
  ws.addRow(["호실", "계량기번호", "전월지침", "당월지침", "사용량", "단위", "검침일", "비고"]);
  ws.addRow(["101호", "M-101", 1000, 1120, 120, "kWh", "2026-08-31", ""]);
  ws.addRow(["102호", "M-102", 500, 610, 110, "kWh", "2026-08-31", ""]);
  ws.addRow(["B101", "M-B01", 200, 190, 0, "kWh", "2026-08-31", "역전 의심"]);
  ws.addRow(["합계", "", "", "", 230, "kWh", "", ""]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** 수도요금 CSV(CP949 인코딩). */
export function buildWaterBillCsvCp949(): Buffer {
  const lines = [
    "청구기간,고객번호,사용량,기본요금,사용요금,부가세,청구금액,납기일",
    "2026-08,W-1001,15,3000,12000,1500,16500,2026-09-25",
    "2026-08,W-1002,8,3000,6400,940,10340,2026-09-25",
  ];
  return iconv.encode(lines.join("\r\n"), "cp949");
}

/** 은행 거래내역 xlsx. */
export async function buildBankXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("거래내역");
  ws.addRow(["거래일시", "적요", "입금액", "출금액", "잔액", "거래고유번호"]);
  ws.addRow(["2026-08-05", "101호 관리비", 165000, "", 5165000, "TXN-0001"]);
  ws.addRow(["2026-08-05", "102호 관리비", 98000, "", 5263000, "TXN-0002"]);
  ws.addRow(["2026-08-06", "관리비 환불", "", 30000, 5233000, "TXN-0003"]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** 구형 .xls(BIFF8) 검침 파일 — 공식 SheetJS(xlsx 패키지)로 읽을 수 있어야 한다. */
export function buildLegacyMeterXls(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["호실", "전월지침", "당월지침", "사용량", "검침일"],
    ["201호", 100, 220, 120, "2026-08-31"],
    ["202호", 50, 170, 120, "2026-08-31"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "검침");
  return XLSX.write(wb, { bookType: "biff8", type: "buffer" }) as Buffer;
}

/** 호실 표기가 섞인 파일(엑셀 검침). */
export async function buildMixedRoomNotationXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("검침");
  ws.addRow(["호실", "당월지침", "전월지침", "사용량", "검침일"]);
  ws.addRow(["101호", 1120, 1000, 120, "2026-08-31"]);
  ws.addRow(["1-102", 610, 500, 110, "2026-08-31"]);
  ws.addRow(["지하1층 101", 300, 250, 50, "2026-08-31"]);
  ws.addRow(["103", 400, 350, 50, "2026-08-31"]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
