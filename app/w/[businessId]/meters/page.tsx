/** 검침 입력(building 전용). 전월 지침은 지난달 이번 지침으로 제안한다. 쓰기는 upsertMeterReading(서버 cap 재검사). */
import { PageBody } from "@/components/ui/PageHeader";
import { BuildingHeader, ReadFail, buildingGate, isLockedStatus, type SearchParams } from "@/components/building-ops/gate";
import { MeterGrid, type MeterLine } from "@/components/building-ops/MeterGrid";
import { unitLabel } from "@/components/building-ops/format";
import { addMonths } from "@/components/building/period";
import { getPeriod, listMeterReadings, listMeters, listUnits } from "@/lib/domain/building";

export default async function MetersPage({ params, searchParams }: { params: { businessId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "write", searchParams, "계량기 숫자 입력");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const [uRes, mRes, curRes, prevRes, pRes] = await Promise.all([
    listUnits(ctx.building.id),
    listMeters(ctx.building.id),
    listMeterReadings(ctx.businessId, ctx.period),
    listMeterReadings(ctx.businessId, addMonths(ctx.period, -1)),
    getPeriod(ctx.building.id, ctx.period),
  ]);
  const fail = [uRes, mRes, curRes, prevRes, pRes].find((r) => !r.ok);
  if (fail && !fail.ok) {
    return (
      <PageBody>
        <BuildingHeader ctx={ctx} title="계량기 숫자 입력" />
        <ReadFail title="계량기 숫자를 불러오지 못했습니다." message={fail.message} />
      </PageBody>
    );
  }
  if (!uRes.ok || !mRes.ok || !curRes.ok || !prevRes.ok || !pRes.ok) return null;
  const units = new Map(uRes.data.map((u) => [u.id, u]));
  const cur = new Map(curRes.data.map((r) => [r.meter_id, r]));
  const prev = new Map(prevRes.data.map((r) => [r.meter_id, r]));
  const lines: MeterLine[] = mRes.data
    .filter((m) => units.has(m.unit_id))
    .map((m) => {
      const c = cur.get(m.id);
      const p = prev.get(m.id);
      const u = units.get(m.unit_id)!;
      return {
        meterId: m.id,
        unitLabel: unitLabel(u),
        kind: m.kind,
        serial: m.serial,
        multiplier: Number(m.multiplier),
        unitText: m.unit_label ?? "",
        maxReading: m.max_reading === null ? null : Number(m.max_reading),
        prev: c ? Number(c.prev_reading) : p ? Number(p.curr_reading) : 0,
        saved: c ? { curr: Number(c.curr_reading), reason: c.reason, usageOverride: c.usage_override === null ? null : Number(c.usage_override) } : null,
      };
    })
    .sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, "ko", { numeric: true }) || a.kind.localeCompare(b.kind));
  const key = `${ctx.building.id}:${ctx.period}:${lines.map((l) => `${l.meterId}=${l.saved?.curr ?? ""}/${l.saved?.reason ?? ""}/${l.saved?.usageOverride ?? ""}`).join("|")}`;
  return (
    <PageBody wide>
      <BuildingHeader ctx={ctx} title="계량기 숫자 입력" description="호실마다 계량기에 보이는 이번 달 숫자를 적습니다." />
      <MeterGrid
        key={key}
        businessId={ctx.businessId}
        buildingId={ctx.building.id}
        period={ctx.period}
        lines={lines}
        locked={isLockedStatus(pRes.data?.status)}
        units={uRes.data.map((u) => ({ id: u.id, label: unitLabel(u) }))}
      />
    </PageBody>
  );
}
