/**
 * 입주자 명세서 PDF `/tenant/pdf/<billId>[?download=1]` — 입주자 세션 쿠키(nuri_tp)로만 열린다.
 * 소속·확정 여부 판정과 열람 기록(action=pdf)은 getPortalStatement → crm.portal_bill 이 한다.
 * 렌더는 관리자 명세서(app/api/pdf/building-statement/route.ts)와 같은 StatementDoc + renderToBuffer.
 * `/tenant` 아래여야 middleware 가 로그인 없이 통과시킨다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { StatementDoc } from "@/lib/pdf/StatementDoc";
import { getPortalStatement } from "@/lib/domain/building-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Partial<Record<string, number>> = { session_invalid: 401, portal_off: 403, bill_not_found: 404 };

export async function GET(req: NextRequest, { params }: { params: { billId: string } }) {
  const r = await getPortalStatement(params.billId);
  if (!r.ok) {
    return new NextResponse(r.message, { status: STATUS[r.hint] ?? 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  const buffer = await renderToBuffer(StatementDoc({ items: [r.data] }));
  const name = `statement-${r.data.docNo.replace(/[^0-9A-Za-z-]/g, "")}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${req.nextUrl.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
