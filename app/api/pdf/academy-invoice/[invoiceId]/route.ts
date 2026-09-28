/**
 * 학원 수강료 청구서 PDF(월별·학생별). 수강료 화면(TuitionBoard)과 같은 revenue.read 게이트를 쓴다
 * — listInvoiceBalances 자체가 view라 계산은 여기서 하되 접근은 getAccess("revenue.read")로 막는다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { checkAccess as getAccess } from "@/lib/auth/access";
import { listInvoiceBalances, listEnrollments, listStudents, listClasses } from "@/lib/domain/academy";
import { formatKRW } from "@/lib/domain/money";
import { InvoiceDoc } from "@/lib/pdf/InvoiceDoc";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { invoiceId: string } }) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId 쿼리가 필요합니다." }, { status: 400 });

  const access = await getAccess(businessId, "revenue.read");
  if (!access.ok) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  }
  if (access.industry !== "academy") {
    return NextResponse.json({ error: "이 업종에는 수강료 청구서가 없습니다." }, { status: 404 });
  }

  const [invoicesRes, enrollmentsRes, studentsRes, classesRes] = await Promise.all([
    listInvoiceBalances(access.businessId),
    listEnrollments(access.businessId),
    listStudents(access.businessId, false),
    listClasses(access.businessId),
  ]);
  if (!invoicesRes.ok) return NextResponse.json({ error: invoicesRes.message }, { status: 500 });
  const inv = invoicesRes.data.find((i) => i.invoiceId === params.invoiceId);
  if (!inv) return NextResponse.json({ error: "청구서를 찾을 수 없습니다." }, { status: 404 });

  const enrollment = enrollmentsRes.ok ? enrollmentsRes.data.find((e) => e.id === inv.enrollmentId) : undefined;
  const student = enrollment && studentsRes.ok ? studentsRes.data.find((s) => s.id === enrollment.studentId) : undefined;
  const cls = enrollment && classesRes.ok ? classesRes.data.find((c) => c.id === enrollment.classId) : undefined;

  const doc = InvoiceDoc({
    kicker: "수강료 청구서",
    businessName: access.businessName,
    docNo: inv.invoiceId.slice(0, 8).toUpperCase(),
    issuedAtLabel: inv.dueDate,
    partyHead: "학생",
    partyName: student?.name ?? "학생",
    partySub: [student?.school, student?.grade].filter(Boolean).join(" · ") || "-",
    detailHead: "반 · 청구월",
    detailLine1: cls?.name ?? "-",
    detailLine2: `청구월 ${inv.period} · 납부기한 ${inv.dueDate}`,
    tableHeaders: ["청구월", "반", "상태", "청구 금액"],
    items: [
      {
        col1: inv.period,
        col2: cls?.name ?? "-",
        col3: inv.exempted ? "면제" : inv.status,
        amount: formatKRW(inv.amount),
      },
    ],
    totalRows: [
      ["청구 금액", formatKRW(inv.amount)],
      ["납부액", formatKRW(inv.paid)],
    ],
    grandLabel: "미수금",
    grandValue: formatKRW(inv.outstanding),
    footerLines: [
      "이 청구서는 수강 등록 단위로 발행되며, 납부는 목록의 '납부' 등록으로 반영됩니다.",
      `문의: ${access.businessName}`,
    ],
  });

  const buffer = await renderToBuffer(doc);
  // 파일명에 한글(학생 이름)이 들어가면 Content-Disposition은 ByteString이라 그대로 못 넣는다 —
  // ASCII 대체값 + filename*(RFC 5987 UTF-8 인코딩) 둘 다 준다.
  const rawName = `invoice-${inv.period}-${student?.name ?? inv.invoiceId.slice(0, 8)}.pdf`;
  const asciiName = `invoice-${inv.period}-${inv.invoiceId.slice(0, 8)}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
    },
  });
}
