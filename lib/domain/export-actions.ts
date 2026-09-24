/**
 * CSV 내보내기 서버 액션 — export 권한을 **서버에서** 강제한다(CLICK-PATH-222).
 * 지금은 화면이 받은 데이터를 브라우저에서 CSV 로 만든다(components/rental/SettlementList.tsx 등) —
 * 그 경로는 export cap 을 보지 않는다. 화면은 이 액션이 돌려주는 문자열을 Blob 으로 저장하면 된다.
 *
 * 각 내보내기는 export 와 그 데이터의 조회 cap 을 모두 요구한다(정산·매출 = revenue.read).
 */
"use server";

import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { listReservations, getReservationBalance } from "@/lib/domain/rental";
import { RESERVATION_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/domain/rental-types";
import { listSalesRecords } from "@/lib/domain/unmanned";

export type ExportResult = { ok: true; csv: string; fileName: string } | { ok: false; message: string };

async function requireAll(businessId: string, caps: Cap[]): Promise<string | null> {
  try {
    for (const c of caps) await requireCap(businessId, c);
    return null;
  } catch (e) {
    if (e instanceof AccessDenied) return accessMessage(e.detail).detail;
    throw e;
  }
}

function csvLine(values: (string | number | null | undefined)[]): string {
  return values.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
}

/** 렌탈 정산 CSV — SettlementList.toCsv 와 같은 열. */
export async function exportRentalSettlementCsv(businessId: string): Promise<ExportResult> {
  const denied = await requireAll(businessId, ["export", "revenue.read"]);
  if (denied) return { ok: false, message: denied };

  const res = await listReservations(businessId, { status: ["confirmed", "out", "partial_return", "returned", "closed"] });
  if (!res.ok) return { ok: false, message: res.message };
  const balances = await Promise.all(res.data.map((r) => getReservationBalance(r.id)));

  const lines = [csvLine(["예약번호", "고객", "상태", "결제상태", "대여매출", "연체료", "보증금잔액", "현금수납", "미수금"])];
  res.data.forEach((r, i) => {
    const b = balances[i];
    const flat = b.ok && !("masked" in b.data) ? b.data : null;
    lines.push(
      csvLine([
        `R-${r.id.slice(0, 8).toUpperCase()}`,
        r.customerName,
        RESERVATION_STATUS_LABEL[r.status],
        flat ? PAYMENT_STATUS_LABEL[flat.paymentStatus] : "",
        flat?.rentalRevenue,
        flat?.lateFee,
        flat?.depositBalance,
        flat?.cashReceived,
        flat?.outstanding,
      ])
    );
  });
  return { ok: true, csv: lines.join("\r\n"), fileName: `정산_${new Date().toISOString().slice(0, 10)}.csv` };
}

/** 무인매장 매출 기록 CSV. */
export async function exportUnmannedSalesCsv(businessId: string): Promise<ExportResult> {
  const denied = await requireAll(businessId, ["export", "revenue.read"]);
  if (denied) return { ok: false, message: denied };

  const res = await listSalesRecords(businessId, 1000);
  if (!res.ok) return { ok: false, message: res.message };

  const lines = [csvLine(["판매일", "상품ID", "원본SKU", "수량", "금액", "출처", "파일", "대사확정"])];
  for (const r of res.data) {
    lines.push(csvLine([r.soldAt, r.productId, r.rawSku, r.qty, r.amount, r.source, r.fileName, r.reconciled ? "Y" : "N"]));
  }
  return { ok: true, csv: lines.join("\r\n"), fileName: `매출_${new Date().toISOString().slice(0, 10)}.csv` };
}
