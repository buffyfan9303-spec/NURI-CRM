/**
 * 외부 파일 가져오기(building): POST multipart. step = analyze | validate | stage. 파일은 단계마다 다시 받는다(서버에 임시 저장 없음).
 * analyze  : 파일 읽기, 머리글 찾기, 열 자동 매핑(저장된 양식 템플릿이 있으면 그것 우선). DB 쓰기 없음.
 * validate : 매핑대로 행 검사(호실 매칭·형식·합계 대조). DB 쓰기 없음.
 * stage    : 오류 0 일 때만 스테이징 저장(파일 해시 중복은 서버가 거부). 확정은 화면이 commitImport 로 따로 부른다.
 * match    : (은행 전용) 입금 행만 골라 호실 자동 매칭한 미리보기. DB 쓰기 없음. 확정은 화면이 recordPaymentsBulk 로 부른다.
 * 권한은 write(은행 확정은 서버가 payment.allocate 를 다시 검사). 서버 함수가 권한과 금액을 다시 확인한다.
 */
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { getBuilding, getImportMapping, listContracts, listParties, listPayments, listUnits, resolveBuildingFeatures } from "@/lib/domain/building";
import { stageImport } from "@/lib/domain/building-actions";
import { checkBatchTotal, detectHeaderRow, parseSpreadsheet, suggestMapping, toStagingRows, txnLocalToIso, validateRows } from "@/lib/import";
import { fingerprint } from "@/lib/import/normalize";
import { buildMatchUnits, matchUnit } from "@/lib/import/match-units";
import { ImportParseError, type MappingResult, type RowIssue, type SourceKind } from "@/lib/import/types";
import { isPeriod } from "@/components/building/period";
import type { BankMatchResult, BankMatchRow } from "@/components/building-ops/bank-import-types";
import { TOTAL_FIELD, sheetRowNo, type AnalyzeResult, type ImportKind, type Mapping, type ValidateResult } from "@/components/building-ops/import-ui";

export const runtime = "nodejs";
const MAX_BYTES = 4 * 1024 * 1024; // 서버리스 요청 본문 한도(약 4.5MB) 안쪽
const KINDS: ImportKind[] = ["meter", "bill", "bank", "expense"];
const METERS = ["electric", "water", "gas", "heat", "hotwater"] as const;

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return bad("요청 형식이 올바르지 않습니다."); }
  const businessId = str(form.get("businessId")), buildingId = str(form.get("b")), step = str(form.get("step")), kind = str(form.get("sourceKind")) as ImportKind;
  const file = form.get("file");
  if (!businessId || !buildingId || !["analyze", "validate", "stage", "match"].includes(step) || !KINDS.includes(kind)) return bad("businessId, b, step, sourceKind 값이 올바르지 않습니다.");
  if (!(file instanceof File) || file.size === 0) return bad("파일을 선택하세요.");
  if (file.size > MAX_BYTES) return bad("파일이 4MB를 넘습니다. 시트를 나누거나 필요한 열만 남겨 다시 올리세요.", 413);

  const access = await checkAccess(businessId, "write");
  if (!access.ok) return bad("접근 권한이 없습니다.", access.reason === "unauthenticated" ? 401 : 403);
  if (access.industry !== "building") return bad("이 업종에는 파일 가져오기가 없습니다.", 404);
  if (kind === "bank" && !access.caps.includes("payment.allocate" as never)) return bad("은행 입금 가져오기는 수납 배정 권한이 필요합니다.", 403);
  const bRes = await getBuilding(buildingId);
  if (!bRes.ok) return bad(bRes.message, 500);
  if (!bRes.data || bRes.data.business_id !== access.businessId) return bad("건물을 찾을 수 없습니다.", 404);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  let sheets;
  try { sheets = (await parseSpreadsheet(buffer, file.name)).sheets; } catch (e) {
    return bad(e instanceof ImportParseError ? e.message : "파일을 읽지 못했습니다. xlsx, xls, csv 파일인지 확인하세요.", 422);
  }
  if (sheets.length === 0) return bad("읽을 수 있는 시트가 없습니다.", 422);
  const si = Math.min(Math.max(Number(str(form.get("sheet")) || "0") || 0, 0), sheets.length - 1);
  const rows = sheets[si].rows;

  const hrIn = Number(str(form.get("headerRow")));
  let hr0: number, detected = false;
  if (Number.isInteger(hrIn) && hrIn >= 1) hr0 = hrIn - 1;
  else {
    const det = detectHeaderRow(rows, kind as SourceKind);
    if (det) { hr0 = det.headerRowIndex; detected = true; } else hr0 = Math.max(0, rows.findIndex((r) => r.some((c) => c.trim())));
  }
  const headers = rows[hr0] ?? [];
  if (headers.length === 0) return bad("머리글 행을 찾지 못했습니다. 머리글이 있는 행 번호를 직접 입력하세요.", 422);
  const sm = suggestMapping(headers, kind as SourceKind);

  if (step === "match") {
    if (kind !== "bank") return bad("호실 자동 매칭은 은행 입출금 파일에만 씁니다.");
    const mp = sm.mapping;
    if (mp.depositAmount == null || mp.txnDatetime == null) {
      return bad(`${mp.txnDatetime == null ? "거래일시" : "입금액"} 열을 찾지 못했습니다. 머리글에 '거래일시'·'입금액'(또는 '입금')이 있는 은행 내역 파일인지 확인하세요. 열 이름이 특이하면 '파일로 가져오기'에서 열을 직접 지정할 수 있습니다.`, 422);
    }
    const [uRes2, cRes, pRes, payRes] = await Promise.all([listUnits(buildingId), listContracts(buildingId), listParties(access.businessId), listPayments(buildingId)]);
    if (!uRes2.ok || !cRes.ok || !pRes.ok || !payRes.ok) return bad("호실·계약 정보를 불러오지 못했습니다.", 500);
    const mus = buildMatchUnits(uRes2.data, cRes.data, pRes.data);
    const known = new Set(payRes.data.map((x) => (x.external_key ?? "").toLowerCase()).filter(Boolean));
    const validated2 = validateRows(rows.slice(hr0 + 1), { sourceKind: "bank", mapping: mp, fieldConfidence: {}, confidence: 1, fingerprint: sm.fingerprint }, {});
    const seen = new Map<string, number>();
    const stats = { withdraw: 0, duplicateInFile: 0, noDate: 0, other: 0 };
    const out: BankMatchRow[] = [];
    for (const r of validated2) {
      const n = r.normalized;
      if (r.excluded) { if (Object.keys(n).length > 0) stats.duplicateInFile++; continue; }
      const amount = typeof n.depositAmount === "number" ? n.depositAmount : 0;
      if (amount <= 0) { if (typeof n.withdrawAmount === "number" && n.withdrawAmount > 0) stats.withdraw++; else stats.other++; continue; }
      const iso = typeof n.txnDatetime === "string" ? txnLocalToIso(n.txnDatetime, access.timezone) : null;
      if (!iso) { stats.noDate++; continue; }
      const payer = (r.values.depositor ?? "").trim(), memo = (r.values.memo ?? "").trim();
      const txnId = (r.values.txnId ?? "").trim();
      const base = txnId ? `bk:${buildingId.slice(0, 8)}:${txnId}` : `bk:${createHash("sha1").update([buildingId, iso, amount, payer].join("|")).digest("hex").slice(0, 24)}`;
      const nth = (seen.get(base) ?? 0) + 1; seen.set(base, nth);
      const key = (nth === 1 ? base : `${base}#${nth}`).toLowerCase();
      const mt = matchUnit({ depositor: payer, memo, amount }, mus);
      out.push({ row: sheetRowNo(hr0 + 1, r.rowIndex), paidAt: iso, amount, payer, memo, key, status: mt.status, unitIds: mt.unitIds, by: mt.by, existing: known.has(key) });
      if (out.length > 1000) return bad("한 번에 1,000건까지 처리할 수 있습니다. 기간을 나눠 올려 주세요.", 413);
    }
    return NextResponse.json({ fileName: file.name, rows: out, stats } satisfies BankMatchResult);
  }

  if (step === "analyze") {
    let mapping: Mapping = sm.mapping, template = false;
    const saved = await getImportMapping(buildingId, kind, sm.fingerprint);
    const sm2 = saved.ok && saved.data && typeof saved.data.mapping === "object" ? (saved.data.mapping as Mapping) : null;
    if (sm2) {
      const ok: Mapping = {};
      for (const [f, c] of Object.entries(sm2)) if (Number.isInteger(c) && c >= 0 && c < headers.length) ok[f] = c;
      if (Object.keys(ok).length > 0) { mapping = ok; template = true; }
    }
    const out: AnalyzeResult = {
      fileHash, fileName: file.name, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })), sheetIndex: si, headerRow: hr0 + 1, headers, detected, confidence: sm.confidence,
      mapping, fieldConfidence: sm.fieldConfidence, fingerprint: sm.fingerprint, template, preview: rows.slice(hr0, hr0 + 11), dataRows: Math.max(0, rows.length - hr0 - 1),
    };
    return NextResponse.json(out);
  }

  // validate / stage 공통
  let clientMap: Mapping;
  try { clientMap = JSON.parse(str(form.get("mapping")) || "{}") as Mapping; } catch { return bad("열 지정 값이 올바르지 않습니다."); }
  for (const [f, c] of Object.entries(clientMap)) if (!Number.isInteger(c) || c < 0 || c >= headers.length) delete clientMap[f];
  const period = str(form.get("period"));
  if (kind !== "bank" && !isPeriod(period)) return bad("청구월(YYYY-MM)을 입력하세요.");
  const meterKind = str(form.get("meterKind")), chargeTypeId = str(form.get("chargeTypeId"));
  if (kind === "meter") {
    if (!(METERS as readonly string[]).includes(meterKind)) return bad("검침 종류를 고르세요.");
    const f = resolveBuildingFeatures(access.settings);
    if (meterKind === "gas" && f.meter_gas !== "on") return bad("가스 검침 기능이 꺼져 있습니다. 선택 기능에서 켜세요.", 409);
    if ((meterKind === "heat" || meterKind === "hotwater") && f.meter_heat !== "on") return bad("난방·온수 검침 기능이 꺼져 있습니다. 선택 기능에서 켜세요.", 409);
  }
  if ((kind === "bill" || kind === "expense") && !chargeTypeId) return bad("비용을 넣을 항목을 고르세요.");

  const uRes = await listUnits(buildingId);
  if (!uRes.ok) return bad(uRes.message, 500);
  const labels = uRes.data.flatMap((u) => (u.dong ? [u.unit_no, `${u.dong}-${u.unit_no}`] : [u.unit_no]));
  const mapping: MappingResult = { sourceKind: kind as SourceKind, mapping: clientMap, fieldConfidence: {}, confidence: 1, fingerprint: fingerprint(headers) };
  const validated = validateRows(rows.slice(hr0 + 1), mapping, { units: labels, period: isPeriod(period) ? period : undefined });
  const expected = str(form.get("expectedTotal"));
  const totalField = TOTAL_FIELD[kind];
  const totalIssue: RowIssue | null = expected !== "" && totalField && Number.isInteger(Number(expected)) ? checkBatchTotal(validated, totalField, Number(expected)) : null;

  const kept = validated.filter((r) => !r.excluded);
  const level = (r: (typeof kept)[number]) => (r.issues.some((i) => i.level === "error") ? "error" : r.issues.length ? "warning" : "ok") as "ok" | "warning" | "error";
  const errorRows = kept.filter((r) => level(r) === "error").length;

  if (step === "validate") {
    const all = [...kept.flatMap((r) => r.issues), ...(totalIssue ? [totalIssue] : [])];
    const out: ValidateResult = {
      rows: kept.length, excluded: validated.length - kept.length, errorRows, warningRows: kept.filter((r) => level(r) === "warning").length,
      issues: all.slice(0, 300).map((i) => ({ row: i.rowIndex >= 0 ? sheetRowNo(hr0 + 1, i.rowIndex) : null, field: i.field ?? null, level: i.level, code: i.code, message: i.message })), issuesTruncated: all.length > 300,
      preview: kept.slice(0, 30).map((r) => ({ row: sheetRowNo(hr0 + 1, r.rowIndex), values: r.normalized, level: level(r) })),
    };
    return NextResponse.json(out);
  }

  // stage: 오류가 남은 파일은 저장하지 않는다(고친 파일로 다시).
  if (errorRows > 0) return bad(`오류 ${errorRows}행이 남아 있어 저장하지 않았습니다. 파일을 고쳐 다시 올리거나 열 지정을 바꾸세요.`, 422);
  if (kept.length === 0) return bad("가져올 행이 없습니다. 머리글 행과 열 지정을 확인하세요.", 422);
  const saveTemplate = str(form.get("saveTemplate")) === "1";
  const total = expected !== "" && Number.isInteger(Number(expected)) ? Number(expected) : null;
  const r = await stageImport(businessId, buildingId, {
    source_kind: kind, file_name: file.name, file_hash: fileHash, period: kind === "bank" ? (isPeriod(period) ? period : null) : period,
    mapping: { sourceKind: kind, mapping: clientMap, headerRow: hr0 + 1, sheetIndex: si, ...(saveTemplate ? { fingerprint: mapping.fingerprint } : {}) },
    // 은행 거래일시는 사업장 시간대의 벽시계로 읽어 UTC ISO 로 보낸다(서버가 timestamptz 로 받는다). 못 읽은 값은 null 이라 서버가 그 행을 건너뛴다.
    rows: toStagingRows(validated, mapping, isPeriod(period) ? period : null).map((row) => {
      const t = row.fields.txnDatetime;
      return kind === "bank" && typeof t === "string" ? { ...row, fields: { ...row.fields, txnDatetime: txnLocalToIso(t, access.timezone) } } : row;
    }),
    charge_type_id: chargeTypeId || null,
    meter_kind: kind === "meter" ? (meterKind as (typeof METERS)[number]) : null, total,
  });
  if (!r.ok) return bad(r.message, r.hint === "duplicate_import" ? 409 : 422, { hint: r.hint ?? null });
  return NextResponse.json(r.data);
}
