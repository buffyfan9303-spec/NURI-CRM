"use client";

/**
 * 미용실 정산 — 결함 #1 수정. 이전에는 화면 자체가 없어(업종 분기 없이 렌탈 데이터만
 * 조회) 미용실에서는 항상 "정산 대상 예약이 없습니다."만 보였다.
 * 완료된 예약만이 아니라 취소·노쇼를 뺀 전체 예약(예약/확정/완료)을 보여준다 —
 * 수납은 서비스 완료 전(예약금)에도 들어올 수 있기 때문이다(rental SettlementList와
 * 같은 원칙: 상태와 결제는 별개 축).
 *
 * 레퍼런스: 토스 매출 장부의 "합계 → 목록" 순서. 상단 합계 3칸(예약금액·수납액·미수) 다음 표(PC 7열)/카드.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";
import { StatusTab, FilterRow, CardHead, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { formatKRW } from "@/lib/domain/money";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import type { SalonAppointment } from "@/lib/domain/salon";
import { PayModal, type PayTarget } from "./PayModal";
import { SALON_STATUS_KIND } from "./BookingBoard";

export type SalonBalance = { price: number; paid: number; outstanding: number } | null;

export function SalonSettlementBoard({
  businessId,
  appointments,
  balances,
  canWrite,
}: {
  businessId: string;
  appointments: SalonAppointment[];
  balances: SalonBalance[];
  /** write 없으면 수납 버튼을 그리지 않는다(recordSalonPayment 가 write 를 요구). */
  canWrite: boolean;
}) {
  const router = useRouter();
  const [payTarget, setPayTarget] = React.useState<PayTarget | null>(null);
  const [filter, setFilter] = React.useState<"all" | "due">("all");

  // 표와 카드가 같은 값·같은 동작을 쓰도록 한 곳에서 계산한다.
  const all = appointments.map((a, idx) => ({ a, bal: balances[idx] }));
  const rows = filter === "due" ? all.filter(({ bal }) => bal && bal.outstanding > 0) : all;
  const sum = all.reduce(
    (s, { a, bal }) => ({ price: s.price + (bal ? bal.price : a.price), paid: s.paid + (bal?.paid ?? 0), outstanding: s.outstanding + (bal?.outstanding ?? 0) }),
    { price: 0, paid: 0, outstanding: 0 }
  );
  const dueCount = all.filter(({ bal }) => bal && bal.outstanding > 0).length;

  const rowView = (a: SalonAppointment, bal: SalonBalance) => ({
    when: formatInTz(a.startAt, DEFAULT_TZ, "M. d. (EEE) HH:mm"),
    customer: a.customerName ?? "-",
    service: a.serviceName ?? "-",
    price: bal ? formatKRW(bal.price) : formatKRW(a.price),
    paid: bal ? formatKRW(bal.paid) : "-",
    outstanding: bal ? formatKRW(bal.outstanding) : "-",
    due: !!bal && bal.outstanding > 0,
  });
  const payButton = (a: SalonAppointment, bal: SalonBalance) =>
    canWrite && bal ? (
      <Button size="sm" variant={bal.outstanding > 0 ? "secondary" : "ghost"} onClick={() => setPayTarget({ appointmentId: a.id, customerId: a.customerId, customerName: a.customerName, serviceName: a.serviceName, suggested: bal.outstanding > 0 ? bal.outstanding : bal.price, outstanding: bal.outstanding })}>
        <Banknote size={13} aria-hidden />수납
      </Button>
    ) : null;

  return (
    <>
      <PageHeader title="수납·정산" description="예약별 예약금액·수납액·미수 잔액. 취소·노쇼는 제외됩니다.">
        <FilterRow>
          <StatusTab active={filter === "all"} onClick={() => setFilter("all")} count={all.length}>전체</StatusTab>
          <StatusTab active={filter === "due"} onClick={() => setFilter("due")} count={dueCount}>미수만</StatusTab>
        </FilterRow>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3.5">
        {[
          ["예약금액 합계", sum.price, "text-t"],
          ["수납액 합계", sum.paid, "text-okt"],
          ["미수 잔액", sum.outstanding, sum.outstanding > 0 ? "text-et" : "text-t"],
        ].map(([label, v, cls]) => (
          <Card key={label as string} className="px-4 py-3.5 sm:px-5">
            <p className="text-[12px] text-t2">{label}</p>
            <p className={`mt-1.5 whitespace-nowrap text-[24px] font-bold leading-none tabular-nums ${cls}`}>{formatKRW(v as number)}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <CardHead title={filter === "due" ? "미수 예약" : "정산 대상 예약"} description={`${rows.length}건 · 최근순`} />
        {rows.length === 0 ? (
          <EmptyState title={filter === "due" ? "미수가 없습니다." : "정산 대상 예약이 없습니다."} description={filter === "due" ? "잔액이 남은 예약이 없습니다." : "예약이 생성되면 여기 표시됩니다."} />
        ) : (
          <TableOrCards
            rows={rows}
            keyOf={({ a }) => a.id}
            table={
              <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className={`${TABLE} min-w-[820px]`}>
                  <thead>
                    <tr className={THEAD}>
                      <th className={TH}>일시</th>
                      <th className={TH}>고객</th>
                      <th className={TH}>시술</th>
                      <th className={TH}>상태</th>
                      <th className={`${TH} text-right`}>예약금액</th>
                      <th className={`${TH} text-right`}>수납액</th>
                      <th className={`${TH} text-right`}>미수</th>
                      {canWrite && <th className={`${TH} text-right`}>동작</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ a, bal }) => {
                      const v = rowView(a, bal);
                      return (
                        <tr key={a.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{v.when}</td>
                          <td className={TD}><CellName max={140}>{v.customer}</CellName></td>
                          <td className={`${TD} text-t2`}><span className="block max-w-[200px] truncate" title={v.service}>{v.service}</span></td>
                          <td className={TD}><Badge kind={SALON_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge></td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>{v.price}</td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t2`}>{v.paid}</td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums ${v.due ? "font-semibold text-et" : "text-t3"}`}>{v.outstanding}</td>
                          {canWrite && <td className={`${TD} text-right`}>{payButton(a, bal)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            }
            card={({ a, bal }) => {
              const v = rowView(a, bal);
              return (
                <MobileCard
                  title={v.customer}
                  sub={<><span title={v.service}>{v.service}</span><span>· {v.when}</span></>}
                  badge={<Badge kind={SALON_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge>}
                  fields={[
                    ["예약금액", v.price],
                    ["수납액", v.paid],
                    ["미수", <span key="o" className={v.due ? "font-semibold text-et" : undefined}>{v.outstanding}</span>],
                  ]}
                  actions={payButton(a, bal)}
                />
              );
            }}
          />
        )}
      </Card>

      <PayModal businessId={businessId} target={payTarget} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); router.refresh(); }} />
    </>
  );
}
