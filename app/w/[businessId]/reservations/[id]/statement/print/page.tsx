/**
 * 거래명세서/영수증 인쇄(A4, 0027 §11). 청구·수납·보증금·정정 내역·취소 규정 요약을 한 장에.
 * 청구서 인쇄(claims/[claimId]/print)와 같은 규칙: 브라우저 인쇄 → PDF 저장, 종이는 항상 흰 배경·검정 글씨.
 * revenue.read 없으면 서버가 {masked:true} 를 주고 화면은 권한 안내만 보여준다(0원으로 보이게 하지 않는다).
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";
import { accessMessage } from "@/lib/auth/access";
import { getStatement } from "@/lib/domain/rental-money";
import { LEDGER_ENTRY_LABEL, PAY_METHOD_LABEL, PAY_STAGE_LABEL, COLLECTION_CHANNEL_LABEL, type PayMethod, type PayStage } from "@/lib/domain/rental-money-types";
import { formatKRW } from "@/lib/domain/money";
import { formatInTz } from "@/lib/utils/datetime";
import { RESERVATION_STATUS_LABEL, ITEM_STATUS_LABEL, type ReservationStatus, type ItemStatus } from "@/lib/domain/rental-types";
import { getAccess } from "../../../../access";
import { BackLink, PrintButton, RetryButton } from "@/components/rental/listkit";
import { discountAbs } from "@/components/rental/money-view";
import { tierLabel, sortTiers, isDefaultPolicy } from "@/components/rental/cancel-tier";

const INK = "#111315", MUTED = "#5d646b", LINE = "#e3e6e8";

export default async function StatementPrintPage({ params }: { params: { businessId: string; id: string } }) {
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
  const back = `/w/${access.businessId}/reservations/${params.id}`;
  const res = await getStatement(params.id);
  if (!res.ok) {
    return (
      <PageBody>
        <BackLink href={back}>예약 상세</BackLink>
        <Card>
          <ErrorState title="거래명세서를 불러오지 못했습니다." description={res.message} />
          <div className="flex justify-center pb-6"><RetryButton /></div>
        </Card>
      </PageBody>
    );
  }
  if ("masked" in res.data) {
    // 서버는 '이 사용자에게 revenue.read 가 없다'(42501)로만 알려 준다. 이 사업장에서 그 권한을 가진 사용자라면
    // 다른 사업장 예약 id(또는 없는 id)를 연 것이므로 권한 안내 대신 그 사실을 말한다(결함 D9).
    const otherBusiness = access.caps.includes("revenue.read");
    return (
      <PageBody>
        <BackLink href={`/w/${access.businessId}/reservations`}>예약 목록</BackLink>
        <Card>
          {otherBusiness
            ? <ErrorState title="이 사업장의 예약이 아니거나 찾을 수 없습니다." description="예약 목록에서 다시 열어 주세요. 다른 사업장의 예약은 여기서 볼 수 없습니다." />
            : <ForbiddenState title="매출·정산 조회 권한이 필요합니다." description="거래명세서는 금액이 포함되므로 revenue.read 권한이 있는 계정만 인쇄할 수 있습니다." />}
        </Card>
      </PageBody>
    );
  }
  const s = res.data;
  if (s.business.id !== access.businessId) {
    return (
      <PageBody>
        <BackLink href={`/w/${access.businessId}/reservations`}>예약 목록</BackLink>
        <Card><ErrorState title="이 사업장의 예약이 아닙니다." description="예약 목록에서 다시 열어 주세요." /></Card>
      </PageBody>
    );
  }
  const tz = access.timezone;
  // 예약번호 표기는 예약 상세와 같은 R-XXXXXXXX(결함 D10). 서버 no = id 앞 8자리 대문자.
  const no = `R-${s.reservation.no}`;
  const policyIsDefault = isDefaultPolicy(s.cancelPolicy);
  const D = "yyyy. M. d.", DT = "yyyy. M. d. HH:mm";
  const b = s.balance;
  const n = (k: string) => Number(b[k] ?? 0);
  const disc = discountAbs(n("discount")); // 뷰의 discount 는 음수 — 표시는 절댓값, 합계에서는 뺀다
  const charged = n("rental_revenue") + n("late_fee") + n("damage_charge") + n("cancel_penalty") - disc - n("compensation");
  const summary: [string, string, boolean?][] = [
    ["대여료", formatKRW(n("rental_revenue"))],
    ["할인", disc > 0 ? `−${formatKRW(disc)}` : formatKRW(0)],
    ...(n("late_fee") > 0 ? [["연체료", formatKRW(n("late_fee"))] as [string, string]] : []),
    ...(n("damage_charge") > 0 ? [["손상·분실비", formatKRW(n("damage_charge"))] as [string, string]] : []),
    ...(n("cancel_penalty") > 0 ? [["취소 위약금", formatKRW(n("cancel_penalty"))] as [string, string]] : []),
    ...(n("compensation") > 0 ? [["취소 배상(매장 지급)", `−${formatKRW(n("compensation"))}`] as [string, string]] : []),
    ["청구 합계", formatKRW(charged), true],
    ["받은 돈(보증금 제외)", formatKRW(n("cash_received") - n("deposit_balance"))],
    ...(n("written_off") > 0 ? [["대손 처리", `−${formatKRW(n("written_off"))}`] as [string, string]] : []),
    ["잔금(미수)", formatKRW(n("outstanding")), true],
    ["보증금 보관 잔액(별도)", formatKRW(n("deposit_balance"))],
    ...(n("deposit_forfeited") > 0 ? [["보증금 몰수", formatKRW(n("deposit_forfeited"))] as [string, string]] : []),
  ];
  const reversedIds = new Set(s.entries.map((e) => e.reversesId).filter(Boolean) as string[]);
  const tiers = sortTiers(s.cancelPolicy.customerTiers);

  return (
    <PageBody>
      <div className="no-print">
        <BackLink href={back}>예약 상세</BackLink>
        <PageHeader
          title={`거래명세서 ${no}`}
          description="브라우저 인쇄 대화상자에서 대상을 'PDF로 저장'으로 바꾸면 PDF 파일로 남길 수 있습니다. 영수증 겸용입니다."
          actions={<PrintButton />}
        />
      </div>

      <div id="print-area" className="mx-auto w-full max-w-[794px] rounded-[var(--r-lg)] border border-[var(--bd)] p-8 shadow-card sm:p-12" style={{ background: "#fff", color: INK }}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-5" style={{ borderColor: INK }}>
          <div>
            <p className="text-[12px] tracking-wide" style={{ color: MUTED }}>거래명세서 · 영수증</p>
            {/* 페이지 h1 은 위 PageHeader 하나뿐(결함 D4) — 인쇄 영역 사업장명은 제목 크기의 p 로 둔다. */}
            <p className="mt-1 text-[24px] font-bold leading-tight">{s.business.name}</p>
          </div>
          <dl className="text-right text-[12.5px]">
            <div><dt className="inline" style={{ color: MUTED }}>예약번호 </dt><dd className="inline font-mono">{no}</dd></div>
            <div><dt className="inline" style={{ color: MUTED }}>발행일 </dt><dd className="inline tabular-nums">{formatInTz(s.issuedAt, tz, D)}</dd></div>
          </dl>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>고객</h2>
            <p className="text-[15px] font-semibold">{s.customer.name ?? "고객 미지정"}</p>
            <p className="text-[13px] tabular-nums" style={{ color: MUTED }}>{s.customer.phone ?? "연락처 비공개"}</p>
          </div>
          <div>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>대여</h2>
            <p className="text-[13px]">{RESERVATION_STATUS_LABEL[s.reservation.status as ReservationStatus] ?? s.reservation.status}{s.reservation.confirmedAt ? ` · 확정 ${formatInTz(s.reservation.confirmedAt, tz, D)}` : ""}</p>
            <p className="text-[13px] tabular-nums" style={{ color: MUTED }}>{formatInTz(s.reservation.periodStart, tz, DT)} ~ {formatInTz(s.reservation.periodEnd, tz, DT)}</p>
            {s.reservation.fittingAt && <p className="text-[12px] tabular-nums" style={{ color: MUTED }}>피팅 {formatInTz(s.reservation.fittingAt, tz, DT)}</p>}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>대여 품목</h2>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: INK }}>
                <th className="py-2 text-left font-medium">상품</th>
                <th className="py-2 text-left font-medium">색상/사이즈</th>
                <th className="py-2 text-right font-medium">수량</th>
                <th className="py-2 text-right font-medium">대여료</th>
                <th className="py-2 text-right font-medium">할인</th>
                <th className="py-2 text-right font-medium">보증금</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((i) => (
                <tr key={i.itemId} className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-2 align-top">{i.productName}<span className="block text-[11.5px]" style={{ color: MUTED }}>{i.productCode}{i.unitCode ? ` · ${i.unitCode}` : ""} · {ITEM_STATUS_LABEL[i.itemStatus as ItemStatus] ?? i.itemStatus}</span></td>
                  <td className="py-2 align-top">{i.color && i.size ? `${i.color}/${i.size}` : "-"}</td>
                  <td className="py-2 text-right align-top tabular-nums">{i.qty}</td>
                  <td className="py-2 text-right align-top tabular-nums">{formatKRW(i.fee)}</td>
                  <td className="py-2 text-right align-top tabular-nums">{i.discount > 0 ? `−${formatKRW(i.discount)}` : "-"}</td>
                  <td className="py-2 text-right align-top tabular-nums">{formatKRW(i.depositAmount * i.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-[380px] text-[13px]">
            {summary.map(([k, v, strong]) => (
              <div key={k} className={"flex items-center justify-between py-1.5 " + (strong ? "mt-1 border-t pt-2 text-[14px] font-bold" : "")} style={strong ? { borderColor: INK } : undefined}>
                <dt style={{ color: strong ? INK : MUTED }}>{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>수납·정산 내역</h2>
          {s.entries.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: MUTED }}>기록된 내역이 없습니다.</p>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b" style={{ borderColor: INK }}>
                  <th className="py-1.5 text-left font-medium">일시</th>
                  <th className="py-1.5 text-left font-medium">구분</th>
                  <th className="py-1.5 text-left font-medium">단계·수단</th>
                  <th className="py-1.5 text-left font-medium">비고</th>
                  <th className="py-1.5 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {s.entries.map((e) => {
                  const struck = reversedIds.has(e.id) || !!e.reversesId || !!e.reversedBy;
                  return (
                    <tr key={e.id} className={"border-b " + (struck ? "line-through" : "")} style={{ borderColor: LINE, color: struck ? MUTED : INK }}>
                      <td className="py-1.5 tabular-nums">{formatInTz(e.occurredAt, tz, "M. d. HH:mm")}</td>
                      <td className="py-1.5">{LEDGER_ENTRY_LABEL[e.entryType] ?? e.entryType}{e.reversesId ? " (정정)" : ""}</td>
                      <td className="py-1.5">
                        {[e.stage ? PAY_STAGE_LABEL[e.stage as PayStage] ?? e.stage : null, e.method ? PAY_METHOD_LABEL[e.method as PayMethod] ?? e.method : null].filter(Boolean).join(" · ")}
                        {e.approvalNo ? ` · 승인 ${e.approvalNo}` : ""}{e.cashReceipt ? " · 현금영수증" : ""}
                      </td>
                      <td className="py-1.5">{e.reason ?? ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.direction === "out" ? "−" : "+"}{formatKRW(e.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {s.claims.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>손상·분실 청구</h2>
            <ul className="text-[12.5px]">
              {s.claims.map((c) => (
                <li key={c.claimId} className="flex justify-between border-b py-1.5" style={{ borderColor: LINE }}>
                  <span>{c.description}<span className="ml-1" style={{ color: MUTED }}>({formatInTz(c.createdAt, tz, D)})</span></span>
                  <span className="tabular-nums">{formatKRW(c.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.collectionLogs.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>연락 기록</h2>
            <ul className="text-[12px]" style={{ color: MUTED }}>
              {s.collectionLogs.map((g) => (
                <li key={g.id}>{formatInTz(g.contactedAt, tz, D)} {COLLECTION_CHANNEL_LABEL[g.channel]}{g.promisedPayDate ? ` · 입금 약속 ${formatInTz(g.promisedPayDate, tz, D)}` : ""}{g.note ? ` · ${g.note}` : ""}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold tracking-wide" style={{ color: MUTED }}>취소 규정 요약{policyIsDefault ? " (공정위 소비자분쟁해결기준 · 단기 물품대여)" : " (매장 규정)"}</h2>
          <p className="text-[12px]" style={{ color: MUTED }}>
            사용 예정일 기준 {tiers.map((t) => `${tierLabel(t, "customer")} ${t.rate}%`).join(" · ")}. 계약 후 {s.cancelPolicy.contractGraceHours}시간 이내 취소는 위약금이 없습니다. 위약금은 대여료(할인 후) 기준이며 보증금은 전액 반환됩니다.
            {s.cancelQuoteNow && !s.cancelQuoteNow.masked && ` 지금 취소 시(손님 사정) 위약금 ${formatKRW(s.cancelQuoteNow.effectiveAmount)} · 환급 ${formatKRW(s.cancelQuoteNow.totalPayout)}.`}
          </p>
        </section>

        <footer className="mt-10 border-t pt-4 text-[11.5px]" style={{ borderColor: LINE, color: MUTED }}>
          <p>보증금은 대여료와 별도로 보관되며 반납·검수 후 손상·연체·미수를 차감하고 돌려드립니다. 취소선 항목은 정정된 기록입니다.</p>
          <p className="mt-1">문의: {s.business.name}</p>
        </footer>
      </div>

      <p className="no-print mt-4 text-center text-[12px] text-t3">
        <Link href={back} className="inline-flex min-h-[44px] items-center px-3 underline underline-offset-2">예약 상세로 돌아가기</Link>
      </p>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } #print-area { border: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; } @page { size: A4; margin: 18mm; } }`}</style>
    </PageBody>
  );
}
