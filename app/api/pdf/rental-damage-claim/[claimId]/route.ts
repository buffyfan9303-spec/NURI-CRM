/**
 * 손상·분실 청구서 PDF. 인쇄 페이지(app/w/.../claims/[claimId]/print)와 같은 데이터·같은 마스킹을 쓴다.
 * revenue.read 가 없으면 getClaimInvoice가 masked=true·금액 null을 돌려주고, 여기서도 "비공개"로 찍는다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { checkAccess as getAccess } from "@/lib/auth/access";
import { getClaimInvoice } from "@/lib/domain/rental";
import { formatKRW } from "@/lib/domain/money";
import { formatInTz } from "@/lib/utils/datetime";
import { CLAIM_KIND_LABEL, RESERVATION_STATUS_LABEL, type ReservationStatus } from "@/lib/domain/rental-types";
import { InvoiceDoc } from "@/lib/pdf/InvoiceDoc";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { claimId: string } }) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId 쿼리가 필요합니다." }, { status: 400 });

  const access = await getAccess(businessId, "view");
  if (!access.ok) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  }

  const inv = await getClaimInvoice(params.claimId);
  if (!inv.ok) return NextResponse.json({ error: inv.message }, { status: 404 });
  const c = inv.data;
  const tz = access.timezone;
  const D = "yyyy. M. d.";
  const money = (v: number | null) => (c.masked || v == null ? "비공개" : formatKRW(v));

  const doc = InvoiceDoc({
    kicker: "손상·분실 청구서",
    businessName: c.business.name,
    docNo: c.claimNo,
    issuedAtLabel: formatInTz(c.issuedAt, tz, D),
    partyHead: "고객",
    partyName: c.customer.name ?? "고객 미지정",
    partySub: c.customer.phone ?? "연락처 비공개",
    detailHead: "예약",
    detailLine1: `${c.reservation.no} · ${RESERVATION_STATUS_LABEL[c.reservation.status as ReservationStatus] ?? c.reservation.status}`,
    detailLine2: `${formatInTz(c.reservation.periodStart, tz, D)} ~ ${formatInTz(c.reservation.periodEnd, tz, D)}`,
    tableHeaders: ["구분", "품목", "내용", "금액"],
    items: [
      {
        col1: CLAIM_KIND_LABEL[c.item.kind],
        col2: c.item.label ?? "-",
        col3: c.item.reason ? `${c.item.description} (산정 근거: ${c.item.reason})` : c.item.description,
        amount: money(c.amount),
      },
    ],
    totalRows: [
      ["이 예약 청구 합계", money(c.claimsTotal)],
      ["보증금 차감액", money(c.depositApplied)],
      ["보증금 잔액", money(c.depositBalance)],
    ],
    grandLabel: "미수금(추가 납부)",
    grandValue: money(c.outstanding),
    footerLines: [
      "보증금은 대여료와 별도로 관리되며, 청구액은 보증금에서 먼저 차감됩니다. 미수금이 있으면 추가 납부가 필요합니다.",
      `문의: ${c.business.name}`,
    ],
  });

  const buffer = await renderToBuffer(doc);
  // claimNo는 보통 ASCII지만 한글이 섞여도 깨지지 않게 filename*(RFC 5987)까지 같이 준다.
  const rawName = `claim-${c.claimNo}.pdf`;
  const asciiName = `claim-${params.claimId.slice(0, 8)}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
    },
  });
}
