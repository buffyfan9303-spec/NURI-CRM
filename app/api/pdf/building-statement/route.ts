/**
 * 건물 관리비 명세서 PDF. `?businessId=&bill=<id>` 한 장 또는 `?businessId=&bills=<id,id,…>` 여러 장(한 문서, 인쇄용).
 * revenue.read 게이트(명세서 화면과 같다). 승인 여부는 화면이 안내하고 여기서는 미리보기를 위해 초안도 그린다(문서 No. 에 "초안" 표시).
 * 선택 구역은 features(statement_notice·statement_chart·statement_stub·late_fee)에 따른다. QR(statement_qr)은 PDF 인코더가 없어 계좌 문자열로 대체(§미해결).
 */
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { checkAccess } from "@/lib/auth/access";
import { getBill, getBuilding, getLatestRun, getPeriod, listBills, listChargeTypes, listMeterReadings, listMeters, listParties, listUnitHistory, listUnits, resolveBuildingFeatures } from "@/lib/domain/building";
import { STD_CATEGORY_LABEL, type BillRow, type BillTraceLine } from "@/lib/domain/building-types";
import { StatementDoc, type StatementData, type StatementMeter } from "@/lib/pdf/StatementDoc";
import { addMonths, periodLabel } from "@/components/building/period";

export const runtime = "nodejs";

const METER_LABEL: Record<string, string> = { electric: "전기", water: "수도", gas: "가스", heat: "난방", hotwater: "온수" };
const METHOD: Record<string, string> = { fixed: "정액", area: "면적", share: "지분", weight: "가중치", equal: "균등", meter_usage: "검침", direct: "직접" };
const qty = (v: unknown) => (typeof v === "number" ? v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(v ?? ""));

function basisText(l: BillTraceLine): string {
  const b = l.basis ?? {};
  const m = typeof b.method === "string" ? METHOD[b.method] ?? b.method : "";
  if (b.numerator != null && b.denominator != null) return `${m} ${qty(b.numerator)}/${qty(b.denominator)}`;
  if (b.rate != null && b.basis != null) return `${qty(b.basis)} × ${qty(b.rate)}원`;
  if (b.rate != null) return `${m} ${qty(b.rate)}원`;
  return m;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const businessId = sp.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId 쿼리가 필요합니다." }, { status: 400 });
  const access = await checkAccess(businessId, "revenue.read");
  if (!access.ok) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  if (access.industry !== "building") return NextResponse.json({ error: "이 업종에는 관리비 명세서가 없습니다." }, { status: 404 });

  const ids = (sp.get("bill") ? [sp.get("bill")!] : (sp.get("bills") ?? "").split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ error: "bill 또는 bills 쿼리가 필요합니다." }, { status: 400 });

  const billRes = await Promise.all(ids.map((id) => getBill(id)));
  const bills: BillRow[] = [];
  for (const r of billRes) {
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: 500 });
    if (r.data && r.data.bill.business_id === access.businessId) bills.push(r.data.bill);
  }
  if (bills.length === 0) return NextResponse.json({ error: "청구를 찾을 수 없습니다." }, { status: 404 });
  const buildingId = bills[0].building_id;
  const period = bills[0].period;

  const features = resolveBuildingFeatures(access.settings);
  const [building, periodRow, units, parties, chargeTypes, meters, readings] = await Promise.all([
    getBuilding(buildingId), getPeriod(buildingId, period), listUnits(buildingId, { includeInactive: true }), listParties(access.businessId), listChargeTypes(buildingId, { includeInactive: true }), listMeters(buildingId), listMeterReadings(access.businessId, period),
  ]);
  if (!building.ok || !building.data) return NextResponse.json({ error: "건물을 찾을 수 없습니다." }, { status: 404 });
  const b = building.data;
  const unitNo = new Map(units.ok ? units.data.map((u) => [u.id, u.unit_no]) : []);
  const partyName = new Map(parties.ok ? parties.data.map((p) => [p.id, p.name]) : []);
  const ctMeterKind = new Map(chargeTypes.ok ? chargeTypes.data.map((c) => [c.id, c.meter_kind]) : []);
  const readingByMeter = new Map(readings.ok ? readings.data.map((r) => [r.meter_id, r]) : []);
  const pr = periodRow.ok ? periodRow.data : null;
  // 전월 승인본의 항목별 금액(전월·증감 열) — 전월 청구가 있을 때만.
  const prevLines = new Map<string, Map<string, number>>();
  const prevPeriod = await getPeriod(buildingId, addMonths(period, -1));
  if (prevPeriod.ok && prevPeriod.data) {
    const prun = await getLatestRun(prevPeriod.data.id);
    if (prun.ok && prun.data?.status === "approved") {
      const pb = await listBills(prun.data.id);
      if (pb.ok) for (const x of pb.data) if (x.bill_kind === "regular" && x.trace) prevLines.set(x.unit_id, new Map(x.trace.lines.map((l) => [l.charge_type_id, l.amount])));
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const bank = b.bank_name && b.bank_account ? `${b.bank_name} ${b.bank_account}${b.bank_holder ? ` (${b.bank_holder})` : ""}` : null;
  const office = [b.office_name, b.office_phone, b.office_hours].filter(Boolean).join(" · ") || null;

  const items: StatementData[] = [];
  for (const bill of bills) {
    const t = bill.trace;
    const prev = prevLines.get(bill.unit_id);
    const lines = (t?.lines ?? []).map((l) => ({ name: l.name, category: STD_CATEGORY_LABEL[l.std_category], amount: l.amount, prev: prev ? prev.get(l.charge_type_id) ?? null : null, basis: basisText(l) }));
    const meterRows: StatementMeter[] = [];
    if (meters.ok) {
      for (const m of meters.data.filter((m) => m.unit_id === bill.unit_id)) {
        const r = readingByMeter.get(m.id);
        if (!r) continue;
        const usage = r.usage_override ?? Math.max(0, (r.curr_reading - r.prev_reading) * (m.multiplier || 1));
        const amount = (t?.lines ?? []).filter((l) => ctMeterKind.get(l.charge_type_id) === m.kind).reduce((a, l) => a + l.amount, 0);
        meterRows.push({ label: `${METER_LABEL[m.kind] ?? m.kind}${m.serial ? ` ${m.serial}` : ""}`, prev: r.prev_reading, curr: r.curr_reading, usage, unit: m.unit_label, amount: amount || null, note: r.reason === "replaced" ? "* 계량기 교체" : r.reason === "estimated" ? "* 추정" : r.reason === "typo" ? "* 정정" : r.reason === "rollover" ? "* 지침 순환" : undefined });
      }
    }
    let chart: StatementData["chart"] = null;
    if (features.statement_chart === "on") {
      const h = await listUnitHistory(bill.unit_id, 12);
      if (h.ok && h.data.length >= 2) chart = h.data.map((x) => ({ label: `${Number(x.period.slice(5))}월`, amount: x.current_charge ?? 0 }));
    }
    items.push({
      buildingName: b.name,
      periodLabel: periodLabel(period),
      docNo: `${period.replace("-", "")}-${unitNo.get(bill.unit_id) ?? "?"}-r${bill.revision}${bill.bill_kind === "correction" ? " 정정" : ""}`,
      issuedAt: today,
      unitNo: unitNo.get(bill.unit_id) ?? "—",
      payerName: bill.bill_to_party_id ? partyName.get(bill.bill_to_party_id) ?? "—" : "—",
      usageRange: pr?.usage_from && pr?.usage_to ? `${pr.usage_from} ~ ${pr.usage_to}` : null,
      dueDate: pr?.due_date ?? null,
      bank: bank ? (features.statement_qr === "on" ? `${bank} · 계좌 QR 은 준비 중` : bank) : null,
      amountDue: bill.amount_due ?? 0,
      currentCharge: bill.current_charge ?? 0,
      priorUnpaid: bill.prior_unpaid ?? 0,
      lateFee: features.late_fee === "on" ? bill.late_fee ?? 0 : null,
      credit: bill.credit ?? 0,
      supply: bill.supply ?? 0,
      vat: bill.vat ?? 0,
      exempt: bill.exempt ?? 0,
      lines,
      meters: meterRows,
      notice: features.statement_notice === "on" ? pr?.notice ?? null : null,
      chart,
      stub: features.statement_stub === "on",
      office,
      commercial: b.kind === "commercial",
    });
  }

  const buffer = await renderToBuffer(StatementDoc({ items }));
  const name = `statement-${period}-${items.length === 1 ? items[0].unitNo : `${items.length}units`}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("download") ? "attachment" : "inline"}; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
