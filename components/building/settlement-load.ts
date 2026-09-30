/**
 * 월별 정산 데이터 읽기(서버 전용). 보고서 화면과 엑셀 내려받기가 같은 확정본 청구로 같은 표를 만들게 한 곳에 둔다.
 */
import { unitLabel } from "@/components/building-ops/format";
import { addMonths } from "@/components/building/period";
import { buildSettlement, type Settlement } from "@/components/building/settlement";
import { getLatestRun, getPeriod, listBills, listCorrectionRuns, listParties, listReceivables, listUnits } from "@/lib/domain/building";
import type { BillRow } from "@/lib/domain/building-types";

type ReadR<T> = { ok: true; data: T } | { ok: false; message: string };

/** 그 달 확정본 청구(정기 + 확정된 고침). 확정 전이면 null. */
export async function approvedBills(buildingId: string, period: string): Promise<ReadR<BillRow[] | null>> {
  const p = await getPeriod(buildingId, period);
  if (!p.ok) return p;
  if (!p.data) return { ok: true, data: null };
  const r = await getLatestRun(p.data.id);
  if (!r.ok) return r;
  if (!r.data || r.data.status !== "approved") return { ok: true, data: null };
  const [b, cr] = await Promise.all([listBills(r.data.id), listCorrectionRuns(p.data.id)]);
  if (!b.ok) return b;
  if (!cr.ok) return cr;
  const cb = await Promise.all(cr.data.filter((x) => x.status === "approved").map((x) => listBills(x.id)));
  const bad = cb.find((x) => !x.ok);
  if (bad && !bad.ok) return bad;
  return { ok: true, data: [...b.data.filter((x) => x.bill_kind === "regular"), ...cb.flatMap((x) => (x.ok ? x.data : []))] };
}

/** 이 달이 확정 전이면 data = null. hasPrev = 지난달 확정본이 있는가. */
export async function loadSettlement(businessId: string, buildingId: string, period: string): Promise<ReadR<{ s: Settlement; hasPrev: boolean } | null>> {
  const [cur, prev, uRes, pRes, rRes] = await Promise.all([
    approvedBills(buildingId, period), approvedBills(buildingId, addMonths(period, -1)),
    listUnits(buildingId, { includeInactive: true }), listParties(businessId),
    listReceivables(buildingId, { openOnly: false }),
  ]);
  for (const x of [cur, prev, uRes, pRes, rRes]) if (!x.ok) return x;
  if (!cur.ok || !prev.ok || !uRes.ok || !pRes.ok || !rRes.ok) return { ok: false, message: "보고서를 불러오지 못했습니다." };
  if (!cur.data) return { ok: true, data: null };
  const units = new Map(uRes.data.map((u) => [u.id, unitLabel(u)]));
  const parties = new Map(pRes.data.map((p) => [p.id, p.name]));
  const s = buildSettlement({
    period, bills: cur.data, prevBills: prev.data ?? [], receivables: rRes.data,
    unitLabel: (id) => units.get(id) ?? "(호실)", partyName: (id) => (id ? parties.get(id) ?? "—" : "내는 분 없음"),
  });
  return { ok: true, data: { s, hasPrev: !!prev.data } };
}
