"use client";

/**
 * 재고 화면 부속(0023 U2·U4·U): 추정 손실(도난) 리포트, 보충 발주 추천, 유통기한 임박 요약.
 * 세 카드 모두 "문구" 버튼 → 모달의 MessageActions 로 복사/공유한다. 금액은 서버가 권한별로 null 로 내려준다.
 */
import * as React from "react";
import { MessageSquare } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageActions } from "@/components/common/MessageActions";
import type { LossReport, ReorderSuggestion, UsLot } from "@/lib/domain/unmanned";
import { unmannedExpirySummary } from "@/lib/domain/messages";
import { formatKRW } from "@/lib/domain/money";
import { CardHead, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { TableOrCards, MobileCard, CellName } from "@/components/ui/ResponsiveTable";

const DOW = ["", "월", "화", "수", "목", "금", "토", "일"];

function MessageButton({ text, title, label = "문구 복사" }: { text: string; title: string; label?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <MessageSquare size={13} aria-hidden />{label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} footer={<Button variant="secondary" onClick={() => setOpen(false)}>닫기</Button>}>
        <MessageActions text={text} title="문구(수정 가능)" />
      </Modal>
    </>
  );
}

export function LossReportCard({ report, businessName }: { report: LossReport | null; businessName: string }) {
  if (!report) return null;
  const money = (v: number | null) => (v == null ? "비공개" : formatKRW(v));
  const summary = [
    `[${businessName}] 추정 손실 ${report.from} ~ ${report.to}`,
    `총 ${report.totalQty}개${report.costAmount != null ? ` · 원가 ${formatKRW(report.costAmount)}` : ""}${report.saleAmount != null ? ` · 판매가 ${formatKRW(report.saleAmount)}` : ""}`,
    ...report.byProduct.slice(0, 10).map((p) => `· ${p.name} (${p.sku}) ${p.lossQty}개${p.saleAmount != null ? ` · ${formatKRW(p.saleAmount)}` : ""}`),
    ...(report.byWeekday.length ? [`요일별: ${report.byWeekday.map((w) => `${DOW[w.isodow] ?? w.isodow} ${w.lossQty}`).join(", ")}`] : []),
  ].join("\n");
  const peak = report.byWeekday.reduce<typeof report.byWeekday[number] | null>((m, w) => (m == null || w.lossQty > m.lossQty ? w : m), null);
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="추정 손실(도난) 리포트"
        description={`${report.from} ~ ${report.to} · 실사 차이 중 판매·조정으로 설명되지 않는 감소분${peak && peak.lossQty > 0 ? ` · 가장 많은 요일 ${DOW[peak.isodow]}` : ""}`}
        action={report.totalQty > 0 ? <MessageButton text={summary} title="손실 요약 문구" label="요약 복사" /> : undefined}
      />
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Tile label="손실 수량" value={`${report.totalQty}개`} tone={report.totalQty > 0 ? "alert" : "neutral"} />
        <Tile label="원가 기준" value={money(report.costAmount)} />
        <Tile label="판매가 기준" value={money(report.saleAmount)} />
      </div>
      {report.byProduct.length === 0 ? (
        <EmptyState title="기간 내 추정 손실이 없습니다." description="실사를 완료하면 차이가 여기에 집계됩니다." />
      ) : (
        <TableOrCards
          rows={report.byProduct}
          keyOf={(p) => p.productId}
          table={
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className={`${TABLE} min-w-[520px]`}>
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>상품</th>
                    <th className={`${TH} text-right`}>손실 수량</th>
                    <th className={`${TH} text-right`}>원가</th>
                    <th className={`${TH} text-right`}>판매가</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byProduct.map((p) => (
                    <tr key={p.productId} className={`${TR} h-[44px]`}>
                      <td className={TD}><CellName max={280}>{p.name}</CellName><span className="font-mono text-[11px] text-t3">{p.sku}</span></td>
                      <td className={`${TD} text-right tabular-nums font-semibold text-et`}>{p.lossQty}</td>
                      <td className={`${TD} text-right tabular-nums text-t2`}>{money(p.costAmount)}</td>
                      <td className={`${TD} text-right tabular-nums text-t2`}>{money(p.saleAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
          card={(p) => (
            <MobileCard title={p.name} sub={<span className="font-mono">{p.sku}</span>} badge={<span className="text-[12.5px] font-semibold tabular-nums text-et">−{p.lossQty}</span>} fields={[["원가", money(p.costAmount)], ["판매가", money(p.saleAmount)]]} />
          )}
        />
      )}
    </Card>
  );
}

/** reorderText 는 서버(page.tsx)가 lib/domain/unmanned.reorderMessage 로 만든다 — 그 모듈은 next/headers 를 끌고 와 클라이언트에서 import 할 수 없다. */
export function ReorderCard({ rows, reorderText }: { rows: ReorderSuggestion[] | null; reorderText: string }) {
  if (!rows) return null;
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="보충 발주 추천"
        description="최근 14일 판매 속도 × 다음 방문(7일)까지 + 저재고 임계 − 현재고"
        action={rows.length > 0 ? <MessageButton text={reorderText} title="발주 문구" label="발주 문구 복사" /> : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState title="발주가 필요한 품목이 없습니다." description="판매 속도가 잡히고 재고가 임계 아래로 내려가면 여기 표시됩니다." />
      ) : (
        <TableOrCards
          rows={rows}
          keyOf={(r) => r.productId}
          table={
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className={`${TABLE} min-w-[640px]`}>
                <thead>
                  <tr className={THEAD}>
                    <th className={TH}>상품</th>
                    <th className={`${TH} text-right`}>현재고</th>
                    <th className={`${TH} text-right`}>14일 판매</th>
                    <th className={`${TH} text-right`}>일 평균</th>
                    <th className={`${TH} text-right`}>추천 수량</th>
                    <th className={TH}>도매처 메모</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.productId} className={`${TR} h-[44px]`}>
                      <td className={TD}><CellName max={240}>{r.name}</CellName><span className="font-mono text-[11px] text-t3">{r.sku}</span></td>
                      <td className={`${TD} text-right tabular-nums text-t2`}>{r.onHand}{r.unit}</td>
                      <td className={`${TD} text-right tabular-nums text-t2`}>{r.soldQty}{r.unit}</td>
                      <td className={`${TD} text-right tabular-nums text-t2`}>{r.dailyRate.toFixed(1)}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold text-t`}>{r.suggestedQty}{r.unit}</td>
                      <td className={`${TD} text-t2`}><span className="block max-w-[200px] truncate" title={r.supplierNote ?? undefined}>{r.supplierNote ?? <span className="text-t3">-</span>}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
          card={(r) => (
            <MobileCard
              title={r.name}
              sub={<span className="font-mono">{r.sku}</span>}
              badge={<span className="text-[12.5px] font-semibold tabular-nums text-t">추천 {r.suggestedQty}{r.unit}</span>}
              fields={[["현재고", `${r.onHand}${r.unit}`], ["14일 판매", `${r.soldQty}${r.unit}`], ["일 평균", r.dailyRate.toFixed(1)], ["도매처 메모", r.supplierNote ?? "-"]]}
            />
          )}
        />
      )}
    </Card>
  );
}

export function ExpirySummaryCard({ lots, businessName, todayKey }: { lots: (UsLot & { productName: string })[]; businessName: string; todayKey: string }) {
  const text = unmannedExpirySummary({
    businessName,
    dateKey: todayKey,
    lots: lots.filter((l) => l.expiryDate).map((l) => ({ productName: l.productName, expiryDate: l.expiryDate as string, qty: l.qtyCurrent })),
  });
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title="유통기한 임박(7일)"
        description={`${lots.length}건 · 할인 표시 또는 폐기 처리가 필요한 로트`}
        action={lots.length > 0 ? <MessageButton text={text} title="유통기한 임박 요약 문구" label="요약 복사" /> : undefined}
      />
      {lots.length === 0 ? (
        <p className="text-[12.5px] text-t3">7일 이내 유통기한이 도래하는 로트가 없습니다.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bd)]">
          {lots.slice(0, 12).map((l) => (
            <li key={l.id} className="flex min-h-[40px] items-center justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate"><span className="font-medium text-t">{l.productName}</span> <span className="font-mono text-[11px] text-t3">{l.lotNo}</span> · {l.qtyCurrent}개</span>
              <span className="shrink-0 tabular-nums font-medium text-wt">{l.expiryDate?.slice(5).replace("-", ".")}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Tile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "alert" }) {
  return (
    <div className="rounded-[var(--r-md)] bg-sf2 px-3 py-2.5">
      <p className="text-[11.5px] text-t3">{label}</p>
      <p className={"mt-0.5 text-[16px] font-bold tabular-nums " + (tone === "alert" ? "text-et" : "text-t")}>{value}</p>
    </div>
  );
}
