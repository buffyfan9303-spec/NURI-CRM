/**
 * 건물 관리비 보고서 Excel. `?businessId=&b=<건물>&p=<YYYY-MM>&kind=report|ledger`.
 * report = 분류별 집계(revenue.read). ledger = 집계 + 월 원장 9시트(revenue.read + export, 서버 RPC 도 같은 권한을 다시 검사).
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { getBuilding, getCategoryReport, getLedgerRows } from "@/lib/domain/building";
import { buildReportWorkbook } from "@/components/building-ops/report-xlsx";
import { isPeriod } from "@/components/building/period";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const businessId = sp.get("businessId"), buildingId = sp.get("b"), period = sp.get("p"), kind = sp.get("kind") === "ledger" ? "ledger" : "report";
  if (!businessId || !buildingId || !period || !isPeriod(period)) return NextResponse.json({ error: "businessId, b, p(YYYY-MM) 쿼리가 필요합니다." }, { status: 400 });
  const access = await checkAccess(businessId, kind === "ledger" ? "export" : "revenue.read");
  if (!access.ok) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  if (access.industry !== "building") return NextResponse.json({ error: "건물 관리비 업종 전용입니다." }, { status: 404 });
  if (kind === "ledger" && !access.caps.includes("revenue.read")) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });

  const b = await getBuilding(buildingId);
  if (!b.ok || !b.data || b.data.business_id !== access.businessId) return NextResponse.json({ error: "건물을 찾을 수 없습니다." }, { status: 404 });
  const [rep, led] = await Promise.all([getCategoryReport(buildingId, period), kind === "ledger" ? getLedgerRows(buildingId, period) : Promise.resolve(null)]);
  if (!rep.ok) return NextResponse.json({ error: rep.message }, { status: 500 });
  if (led && !led.ok) return NextResponse.json({ error: led.message }, { status: 500 });

  const buf = await buildReportWorkbook({ buildingName: b.data.name, period, report: rep.data, ledger: led?.ok ? led.data : null });
  const name = `${b.data.name}_${period}_${kind === "ledger" ? "월원장" : "분류별집계"}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
