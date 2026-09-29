/**
 * 홈택스 일괄발급 엑셀(.xls) 내려받기. GET ?businessId&run&kind=tax_invoice|invoice_exempt&i=<0부터 파일 순번>
 * tax.issue 권한 + 선택 기능 tax_invoice 켜짐 + 승인된 계산의 발행 대상만. 100건씩 나눈 파일 중 i번째를 돌려준다.
 * 이 GET 은 파일만 만든다(상태를 바꾸지 않는다). 화면이 내려받기 성공 뒤 markTaxFileGenerated 를 부르며,
 * 그때 쓸 대상 id 와 파일명은 응답 헤더로 함께 준다(파일 내용과 정확히 같은 목록).
 * 파일 생성은 발행이 아니다. 발행은 사용자가 홈택스에서 하고 승인번호를 따로 기록한다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/lib/auth/access";
import { listTaxTargets, resolveBuildingFeatures, taxTargetsToHometaxRows } from "@/lib/domain/building";
import { buildHometaxWorkbook, HOMETAX_MAX_ROWS_PER_FILE } from "@/lib/domain/building-hometax";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const businessId = sp.get("businessId");
  const runId = sp.get("run");
  const kind = sp.get("kind");
  const idx = Number(sp.get("i") ?? "0");
  if (!businessId || !runId || (kind !== "tax_invoice" && kind !== "invoice_exempt") || !Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "businessId, run, kind, i 쿼리가 올바르지 않습니다." }, { status: 400 });
  }
  const access = await checkAccess(businessId, "tax.issue");
  if (!access.ok) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  if (access.industry !== "building") return NextResponse.json({ error: "이 업종에는 홈택스 발행 파일이 없습니다." }, { status: 404 });
  if (resolveBuildingFeatures(access.settings).tax_invoice !== "on") return NextResponse.json({ error: "세금계산서 발행 도움 기능이 꺼져 있습니다. 선택 기능 설정에서 켜세요." }, { status: 409 });

  const tRes = await listTaxTargets(runId);
  if (!tRes.ok) return NextResponse.json({ error: tRes.message }, { status: 500 });
  const mine = tRes.data.filter((t) => t.business_id === access.businessId);
  const { ids, rows } = await taxTargetsToHometaxRows(mine, kind);
  if (rows.length === 0) return NextResponse.json({ error: "파일로 만들 발행 대상이 없습니다. 차단 사유를 먼저 해결하세요." }, { status: 404 });

  const built = await buildHometaxWorkbook(rows, kind);
  if (!built.ok) {
    return NextResponse.json({ error: "홈택스 양식 검사에서 오류가 나왔습니다. 파일은 만들지 않았습니다.", errors: built.errors.map((e) => ({ ...e, targetId: e.row >= 0 ? ids[e.row] ?? null : null })) }, { status: 422 });
  }
  const file = built.files[idx];
  if (!file) return NextResponse.json({ error: `파일 순번이 범위를 벗어났습니다. 전체 ${built.files.length}개입니다.` }, { status: 404 });
  const from = idx * HOMETAX_MAX_ROWS_PER_FILE;
  const fileIds = ids.slice(from, from + file.count);
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "no-store",
      "X-Tax-File-Name": encodeURIComponent(file.fileName),
      "X-Tax-Target-Ids": fileIds.join(","),
      "X-Tax-File-Total": String(built.files.length),
      "Access-Control-Expose-Headers": "X-Tax-File-Name, X-Tax-Target-Ids, X-Tax-File-Total",
    },
  });
}
