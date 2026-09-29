/** 호실 상세(building 전용): 기본 / 계약 / 청구 / 세무 / 계량기 / 이력 6탭. 탭은 ?tab= 로 서버가 그린다. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { PageBody } from "@/components/ui/PageHeader";
import { BackLink, CardHead } from "@/components/rental/listkit";
import { TABLE, THEAD, TH, TR, TD } from "@/components/building/table-kit";
import { BuildingHeader, ReadFail, buildingGate, type BuildingCtx, type SearchParams } from "@/components/building-ops/gate";
import { ContractCard, ContractCreate, PartyForm, UnitBasicForm } from "@/components/building-ops/UnitForms";
import { parseRange } from "@/components/building-ops/unit-parse";
import { METER_KIND_LABEL, num, unitLabel, won } from "@/components/building-ops/format";
import { periodLabel } from "@/components/building/period";
import { getPeriod, listContracts, listCredits, listMeterReadings, listMeters, listParties, listReceivables, listUnitHistory, listUnits } from "@/lib/domain/building";

const TABS = [["basic", "기본"], ["contract", "계약"], ["billing", "낼 돈·낸 돈"], ["tax", "세금계산서"], ["meters", "계량기"], ["history", "지난 기록"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function UnitDetailPage({ params, searchParams }: { params: { businessId: string; unitId: string }; searchParams: SearchParams }) {
  const g = await buildingGate(params.businessId, "view", searchParams, "호실 상세");
  if (!g.ctx) return g.node;
  const { ctx } = g;
  const uRes = await listUnits(ctx.building.id, { includeInactive: true });
  if (!uRes.ok) return <PageBody><BuildingHeader ctx={ctx} title="호실 상세" /><ReadFail title="호실을 불러오지 못했습니다." message={uRes.message} /></PageBody>;
  const unit = uRes.data.find((u) => u.id === params.unitId);
  if (!unit) notFound();
  const tabParam = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
  const tab: Tab = TABS.find(([k]) => k === tabParam)?.[0] ?? "basic";
  const q = `b=${ctx.building.id}&p=${ctx.period}`;
  const base = `/w/${ctx.businessId}/units/${unit.id}`;
  const canWrite = ctx.can("write");
  const canMoney = ctx.can("revenue.read");

  return (
    <PageBody wide>
      <BackLink href={`/w/${ctx.businessId}/units?${q}`}>호실 목록</BackLink>
      <BuildingHeader ctx={ctx} title={`${unitLabel(unit)} 호실`} description={unit.active ? undefined : "종료된 호실입니다."} showPeriod={tab === "meters"} />
      <nav aria-label="호실 상세 탭" className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--bd)]">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?${q}&tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={`inline-flex min-h-[44px] shrink-0 items-center border-b-2 px-4 text-[length:var(--fs-body)] font-medium ${tab === k ? "border-[var(--accent)] text-t" : "border-transparent text-t2 hover:text-t"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "basic" && <UnitBasicForm businessId={ctx.businessId} unit={unit} canWrite={canWrite} />}
      {tab === "contract" && <ContractTab ctx={ctx} unitId={unit.id} canWrite={canWrite} />}
      {tab === "billing" && (canMoney ? <BillingTab buildingId={ctx.building.id} unitId={unit.id} /> : <NoMoney what="낼 돈·낸 돈 기록" />)}
      {tab === "tax" && <TaxTab ctx={ctx} unitId={unit.id} canWrite={canWrite} />}
      {tab === "meters" && <MetersTab ctx={ctx} unitId={unit.id} />}
      {tab === "history" && (canMoney ? <HistoryTab unitId={unit.id} /> : <NoMoney what="달마다 관리비 기록" />)}
    </PageBody>
  );
}

function NoMoney({ what }: { what: string }) {
  return <Card><ForbiddenState title="매출을 볼 권한이 필요합니다." description={`${what}은 매출을 볼 권한이 있는 계정만 볼 수 있습니다.`} /></Card>;
}

async function ContractTab({ ctx, unitId, canWrite }: { ctx: BuildingCtx; unitId: string; canWrite: boolean }) {
  const [cRes, pRes] = await Promise.all([listContracts(ctx.building.id, { unitId, activeOnly: false }), listParties(ctx.businessId)]);
  if (!cRes.ok || !pRes.ok) return <ReadFail title="계약을 불러오지 못했습니다." message={!cRes.ok ? cRes.message : !pRes.ok ? pRes.message : ""} />;
  const names = new Map(pRes.data.map((p) => [p.id, p.name]));
  const active = cRes.data.filter((c) => c.status === "active");
  const ended = cRes.data.filter((c) => c.status !== "active");
  const lateFeeOn = ctx.features.late_fee === "on";
  return (
    <div className="space-y-4">
      {active.length === 0 && <Card><EmptyState title="진행 중인 계약이 없습니다(공실)." description={canWrite ? "아래에서 입주 계약을 등록하세요." : "계약 등록은 쓰기 권한이 있는 담당자가 합니다."} /></Card>}
      {active.map((c) => (
        <ContractCard key={c.id} businessId={ctx.businessId} contract={c} tenantName={names.get(c.tenant_party_id) ?? "입주자"} canWrite={canWrite} canApprove={ctx.can("billing.approve")} lateFeeOn={lateFeeOn} />
      ))}
      <ContractCreate businessId={ctx.businessId} buildingId={ctx.building.id} unitId={unitId} parties={pRes.data.map((p) => ({ id: p.id, name: p.name }))} canWrite={canWrite} lateFeeOn={lateFeeOn} />
      {ended.length > 0 && (
        <Card className="p-4 sm:p-5">
          <CardHead title="지난 계약" />
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>입주자</th><th className={TH}>기간</th><th className={`${TH} text-right`}>월 임대료</th><th className={`${TH} text-right`}>보증금</th></tr></thead>
              <tbody>
                {ended.map((c) => {
                  const r = parseRange(c.period);
                  return (
                    <tr key={c.id} className={TR}>
                      <td className={TD}>{names.get(c.tenant_party_id) ?? "-"}</td>
                      <td className={`${TD} tabular-nums`}>{r.from} ~ {r.to ?? "-"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{won(c.rent)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{won(c.deposit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

async function BillingTab({ buildingId, unitId }: { buildingId: string; unitId: string }) {
  const [rRes, cRes] = await Promise.all([listReceivables(buildingId, { openOnly: false, unitId }), listCredits(unitId)]);
  if (!rRes.ok || !cRes.ok) return <ReadFail title="청구 내역을 불러오지 못했습니다." message={!rRes.ok ? rRes.message : !cRes.ok ? cRes.message : ""} />;
  const KIND = { bill: "관리비", late_fee: "연체료", correction: "고친 금액" } as const;
  const credit = cRes.data.reduce((s, c) => s + (c.remaining ?? 0), 0);
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="낼 돈·낸 돈 기록" action={credit > 0 ? <Badge kind="info">{`미리 낸 돈 ${won(credit)}`}</Badge> : undefined} />
      {rRes.data.length === 0 ? (
        <EmptyState title="아직 기록이 없습니다." description="관리비 금액을 확정하면 여기에 쌓입니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>관리비 달</th><th className={TH}>구분</th><th className={`${TH} text-right`}>낼 돈</th><th className={`${TH} text-right`}>낸 돈</th><th className={`${TH} text-right`}>남은 돈</th><th className={TH}>상태</th></tr></thead>
            <tbody>
              {rRes.data.map((r) => {
                const left = (r.amount ?? 0) - (r.paid ?? 0) - (r.credit_applied ?? 0);
                return (
                  <tr key={r.id} className={TR}>
                    <td className={`${TD} tabular-nums`}>{r.period}</td>
                    <td className={TD}>{KIND[r.kind]}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(r.amount)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(r.paid)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(left)}</td>
                    <td className={TD}>{r.status === "paid" ? <Badge kind="success">다 냄</Badge> : r.status === "void" ? <Badge kind="info">취소됨</Badge> : <Badge kind="warning">덜 냄</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function TaxTab({ ctx, unitId, canWrite }: { ctx: BuildingCtx; unitId: string; canWrite: boolean }) {
  const [cRes, pRes] = await Promise.all([listContracts(ctx.building.id, { unitId }), listParties(ctx.businessId)]);
  if (!cRes.ok || !pRes.ok) return <ReadFail title="세무 정보를 불러오지 못했습니다." message={!cRes.ok ? cRes.message : !pRes.ok ? pRes.message : ""} />;
  const c = cRes.data[0];
  if (!c) return <Card><EmptyState title="진행 중인 계약이 없습니다." description="계약 탭에서 입주 계약을 먼저 등록하세요." /></Card>;
  const taxParty = pRes.data.find((p) => p.id === (c.tax_to_party_id ?? c.tenant_party_id));
  if (!taxParty) return <Card><EmptyState title="세금계산서 상대 정보를 찾을 수 없습니다." /></Card>;
  // pii.read 가 없으면 서버가 세 값을 null 로 가린다. 가려진 것을 "빠진 정보"로 오판하지 않는다(0034 S-02).
  const canPii = ctx.can("pii.read");
  const missing = canPii ? [!taxParty.biz_reg_no && "사업자등록번호", !taxParty.ceo_name && "대표자", !taxParty.address && "주소"].filter(Boolean) : [];
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title={`세금계산서 받는 곳: ${taxParty.name}`}
        description="이 정보가 홈택스에 올릴 세금계산서 파일에 들어갑니다. 비어 있으면 세금계산서를 만들 수 없습니다."
        action={!canPii ? <Badge kind="info">사업자번호·대표자·주소: 권한 없음</Badge> : missing.length ? <Badge kind="warning">{`빠진 정보: ${missing.join(", ")}`}</Badge> : <Badge kind="success">필수 정보 있음</Badge>}
      />
      <PartyForm businessId={ctx.businessId} party={taxParty} canWrite={canWrite} canPii={canPii} />
    </Card>
  );
}

async function MetersTab({ ctx, unitId }: { ctx: BuildingCtx; unitId: string }) {
  const [mRes, rRes, pRes] = await Promise.all([listMeters(ctx.building.id), listMeterReadings(ctx.businessId, ctx.period), getPeriod(ctx.building.id, ctx.period)]);
  if (!mRes.ok || !rRes.ok || !pRes.ok) return <ReadFail title="계량기를 불러오지 못했습니다." message={!mRes.ok ? mRes.message : !rRes.ok ? rRes.message : !pRes.ok ? pRes.message : ""} />;
  const mine = mRes.data.filter((m) => m.unit_id === unitId);
  const reads = new Map(rRes.data.map((r) => [r.meter_id, r]));
  return (
    <Card className="p-4 sm:p-5">
      <CardHead
        title={`${periodLabel(ctx.period)} 계량기 숫자`}
        action={<Link href={`/w/${ctx.businessId}/meters?b=${ctx.building.id}&p=${ctx.period}`} className="inline-flex min-h-[44px] items-center text-[length:var(--fs-body)] font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline">계량기 숫자 적으러 가기</Link>}
      />
      {mine.length === 0 ? (
        <EmptyState title="이 호실에 등록된 계량기가 없습니다." description="계량기 숫자 입력 화면 아래쪽에서 계량기를 등록하세요." />
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>종류</th><th className={TH}>번호</th><th className={`${TH} text-right`}>지난달 숫자</th><th className={`${TH} text-right`}>이번 달 숫자</th><th className={TH}>상태</th></tr></thead>
            <tbody>
              {mine.map((m) => {
                const r = reads.get(m.id);
                return (
                  <tr key={m.id} className={TR}>
                    <td className={TD}>{METER_KIND_LABEL[m.kind]}</td>
                    <td className={TD}>{m.serial ?? "-"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r ? num(r.prev_reading) : "-"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r ? num(r.curr_reading) : "-"}</td>
                    <td className={TD}>{r ? <Badge kind="success">적음</Badge> : <Badge kind="warning">안 적음</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function HistoryTab({ unitId }: { unitId: string }) {
  const hRes = await listUnitHistory(unitId, 12);
  if (!hRes.ok) return <ReadFail title="이력을 불러오지 못했습니다." message={hRes.message} />;
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="최근 12개월 관리비" description="금액을 확정한 달만 보입니다." />
      {hRes.data.length === 0 ? (
        <EmptyState title="금액을 확정한 달이 아직 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}><tr><th className={TH}>관리비 달</th><th className={`${TH} text-right`}>이번 달 관리비</th><th className={`${TH} text-right`}>낼 돈(밀린 돈 포함)</th></tr></thead>
            <tbody>
              {[...hRes.data].reverse().map((h) => (
                <tr key={h.period} className={TR}>
                  <td className={`${TD} tabular-nums`}>{h.period}</td>
                  <td className={`${TD} text-right tabular-nums`}>{won(h.current_charge)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{won(h.amount_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
