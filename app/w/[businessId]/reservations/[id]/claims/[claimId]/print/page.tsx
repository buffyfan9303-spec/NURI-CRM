/**
 * 손상·분실 청구서 인쇄(A4). 브라우저 인쇄 → "PDF로 저장"으로 PDF 를 만든다(별도 PDF 라이브러리 없음).
 * 금액은 revenue.read 없으면 서버가 null 로 내려보내고(masked), 화면은 "비공개"로 가린다.
 * 화면 테마가 dark 여도 종이는 항상 흰 배경·검정 글씨(#print-area 인라인 색 고정 + globals.css @media print).
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { accessMessage } from "@/lib/auth/access";
import { getClaimInvoice } from "@/lib/domain/rental";
import { formatKRW } from "@/lib/domain/money";
import { formatInTz } from "@/lib/utils/datetime";
import { CLAIM_KIND_LABEL, RESERVATION_STATUS_LABEL, type ReservationStatus } from "@/lib/domain/rental-types";
import { getAccess } from "../../../../../access";
import { BackLink, PrintButton, RetryButton } from "@/components/rental/listkit";

export default async function ClaimPrintPage({ params }: { params: { businessId: string; id: string; claimId: string } }) {
  const access = await getAccess(params.businessId, "view");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return null;
    const msg = accessMessage(access);
    return (
      <PageBody>
        <Card>{access.reason === "forbidden" ? <ForbiddenState title={msg.title} description={msg.detail} /> : <ErrorState title={msg.title} description={msg.detail} />}</Card>
      </PageBody>
    );
  }
  const inv = await getClaimInvoice(params.claimId);
  if (!inv.ok || inv.data.reservation.id !== params.id) {
    return (
      <PageBody>
        <Card>
          <ErrorState title="청구서를 불러오지 못했습니다." description={inv.ok ? "이 예약의 청구가 아닙니다." : inv.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }
  const c = inv.data;
  const tz = access.timezone;
  const money = (v: number | null) => (c.masked || v == null ? "비공개" : formatKRW(v));
  const D = "yyyy. M. d.";
  const rows: [string, string][] = [
    ["청구 금액", money(c.amount)],
    ["이 예약 청구 합계", money(c.claimsTotal)],
    ["보증금 차감액", money(c.depositApplied)],
    ["보증금 잔액", money(c.depositBalance)],
    ["미수금(추가 납부)", money(c.outstanding)],
  ];

  return (
    <PageBody>
      <div className="no-print">
        <BackLink href={`/w/${access.businessId}/reservations/${params.id}`}>예약 상세</BackLink>
        <PageHeader
          title={`청구서 ${c.claimNo}`}
          description="브라우저 인쇄 대화상자에서 대상을 'PDF로 저장'으로 바꾸면 PDF 파일로 남길 수 있습니다."
          actions={<PrintButton />}
        />
        {c.masked && (
          <p className="mb-4 rounded-[var(--r-md)] bg-wb px-3.5 py-2.5 text-[12.5px] text-wt">매출·정산 조회 권한(revenue.read)이 없어 금액이 &lsquo;비공개&rsquo;로 인쇄됩니다.</p>
        )}
      </div>

      <div
        id="print-area"
        className="mx-auto w-full max-w-[794px] rounded-[var(--r-lg)] border border-[var(--bd)] p-8 shadow-card sm:p-12"
        style={{ background: "#fff", color: "#111315" }}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-5" style={{ borderColor: "#111315" }}>
          <div>
            <p className="text-[12px] tracking-wide" style={{ color: "#5d646b" }}>손상·분실 청구서</p>
            <h1 className="mt-1 text-[24px] font-bold leading-tight">{c.business.name}</h1>
          </div>
          <dl className="text-right text-[12.5px]">
            <div><dt className="inline" style={{ color: "#5d646b" }}>청구번호 </dt><dd className="inline font-mono">{c.claimNo}</dd></div>
            <div><dt className="inline" style={{ color: "#5d646b" }}>발행일 </dt><dd className="inline tabular-nums">{formatInTz(c.issuedAt, tz, D)}</dd></div>
          </dl>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: "#5d646b" }}>고객</h2>
            <p className="text-[15px] font-semibold">{c.customer.name ?? "고객 미지정"}</p>
            <p className="text-[13px] tabular-nums" style={{ color: "#5d646b" }}>{c.customer.phone ?? "연락처 비공개"}</p>
          </div>
          <div>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: "#5d646b" }}>예약</h2>
            <p className="text-[13px]"><span className="font-mono">{c.reservation.no}</span> · {RESERVATION_STATUS_LABEL[c.reservation.status as ReservationStatus] ?? c.reservation.status}</p>
            <p className="text-[13px] tabular-nums" style={{ color: "#5d646b" }}>
              {formatInTz(c.reservation.periodStart, tz, D)} ~ {formatInTz(c.reservation.periodEnd, tz, D)}
            </p>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: "#5d646b" }}>청구 내역</h2>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "#111315" }}>
                <th className="py-2 text-left font-medium">구분</th>
                <th className="py-2 text-left font-medium">품목</th>
                <th className="py-2 text-left font-medium">내용</th>
                <th className="py-2 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b" style={{ borderColor: "#e3e6e8" }}>
                <td className="py-3 align-top">{CLAIM_KIND_LABEL[c.item.kind]}</td>
                <td className="py-3 align-top">{c.item.label ?? "-"}</td>
                <td className="py-3 align-top">
                  {c.item.description}
                  {c.item.reason && <span className="block text-[12px]" style={{ color: "#5d646b" }}>산정 근거: {c.item.reason}</span>}
                </td>
                <td className="py-3 text-right align-top tabular-nums font-semibold">{money(c.amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-[360px] text-[13px]">
            {rows.map(([k, v], i) => (
              <div key={k} className={"flex items-center justify-between py-1.5 " + (i === rows.length - 1 ? "mt-1 border-t-2 pt-2.5 text-[15px] font-bold" : "")} style={i === rows.length - 1 ? { borderColor: "#111315" } : undefined}>
                <dt style={{ color: i === rows.length - 1 ? "#111315" : "#5d646b" }}>{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-10 border-t pt-4 text-[11.5px]" style={{ borderColor: "#e3e6e8", color: "#5d646b" }}>
          <p>보증금은 대여료와 별도로 관리되며, 청구액은 보증금에서 먼저 차감됩니다. 미수금이 있으면 추가 납부가 필요합니다.</p>
          <p className="mt-1">문의: {c.business.name}</p>
        </footer>
      </div>

      <p className="no-print mt-4 text-center text-[12px] text-t3">
        <Link href={`/w/${access.businessId}/reservations/${params.id}`} className="underline underline-offset-2">예약 상세로 돌아가기</Link>
      </p>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } #print-area { border: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; } @page { size: A4; margin: 18mm; } }`}</style>
    </PageBody>
  );
}
