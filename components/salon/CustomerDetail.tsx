"use client";

/**
 * 미용실 고객 상세 — 기본정보 + 시술 이력(salon_appointments) + 수납·미수(revenue.read 게이팅).
 * app/w/[businessId]/customers/[id]/page.tsx가 access.industry === "salon"일 때 이 컴포넌트로
 * 분기한다(새 라우트를 만들지 않는다). rental/CustomerDetail.tsx와 같은 구조를 따른다.
 *
 * 레퍼런스: Fresha 고객 이력 — 예약(전체/완료 필터) · 메모 · 시술 사진은 예약(시술 기록) 단위.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock, Ruler, History, Banknote } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableOrCards, MobileCard } from "@/components/ui/ResponsiveTable";
import { BackLink, StatusTab, FilterRow, CardHead, Alert, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import type { CustomerRow, CustomerMeasurementRow } from "@/lib/domain/rental-types";
import { addCustomerMeasurement } from "@/lib/domain/rental-actions";
import type { TreatmentHistoryRow } from "@/lib/domain/salon";
import { TreatmentHistoryPanel } from "./TreatmentHistoryPanel";
import { PayModal, type PayTarget } from "./PayModal";
import { SALON_STATUS_KIND } from "./BookingBoard";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";

/** amount/outstanding은 revenue.read 없으면 서버(page.tsx)가 애초에 null로 채운다 — 0원과 구분. */
export interface SalonApptHistoryRow {
  id: string;
  startAt: string;
  serviceName: string | null;
  staffName: string;
  resourceName: string | null;
  status: string;
  amount: number | null;
  outstanding: number | null;
}

const MEASURE_FIELDS: { key: string; label: string }[] = [
  { key: "neck", label: "목(cm)" },
  { key: "shoulder", label: "어깨(cm)" },
  { key: "chest", label: "가슴(cm)" },
  { key: "waist", label: "허리(cm)" },
  { key: "sleeve", label: "소매(cm)" },
  { key: "length", label: "총장(cm)" },
];

const PRIVATE = <span className="inline-flex items-center gap-1 text-t3"><Lock size={11} aria-hidden /> 비공개(권한 필요)</span>;

export function SalonCustomerDetail({
  businessId,
  customer,
  canReadPii,
  canWrite,
  canRevenue,
  measurements,
  measurementsError,
  appointments,
  treatmentHistory,
}: {
  businessId: string;
  customer: CustomerRow;
  canReadPii: boolean;
  canWrite: boolean;
  canRevenue: boolean;
  measurements: CustomerMeasurementRow[];
  measurementsError: string | null;
  appointments: SalonApptHistoryRow[];
  treatmentHistory: TreatmentHistoryRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [payTarget, setPayTarget] = React.useState<PayTarget | null>(null);
  const [filter, setFilter] = React.useState<"all" | "done">("all");
  const latest = measurements[0];
  const newApptHref = `/w/${businessId}/services?customerId=${customer.id}`;
  // S4: 이 고객의 전체 시술 이력(appointments)에서 노쇼만 센다 — 새 서버 쿼리 없이 기존 조회 결과로 계산.
  const noShowCount = appointments.filter((a) => a.status === "노쇼").length;
  const visits = appointments.filter((a) => a.status === "완료").length;
  const lastVisit = appointments.find((a) => a.status === "완료");
  const totalOutstanding = appointments.reduce((s, a) => s + (a.outstanding ?? 0), 0);
  const rows = filter === "done" ? appointments.filter((a) => a.status === "완료") : appointments;
  const showPayCol = canWrite && canRevenue && rows.some((a) => a.outstanding !== null && a.outstanding > 0);

  const newApptButton = (size: "sm" | "md") => (
    <Button
      size={size}
      onClick={() => router.push(newApptHref)}
      disabled={!canWrite}
      title={canWrite ? undefined : "예약 등록 권한(write)이 없습니다. 사업장 관리자에게 요청하세요."}
    >
      <Plus size={14} aria-hidden />예약 등록
    </Button>
  );

  const payButton = (a: SalonApptHistoryRow) =>
    canWrite && canRevenue && a.outstanding !== null && a.outstanding > 0 ? (
      <Button variant="secondary" size="sm" onClick={() => setPayTarget({ appointmentId: a.id, customerId: customer.id, customerName: customer.name, serviceName: a.serviceName, suggested: a.outstanding ?? 0, outstanding: a.outstanding })}>
        <Banknote size={13} aria-hidden />수납
      </Button>
    ) : null;

  return (
    <>
      <BackLink href={`/w/${businessId}/customers`}>고객 목록</BackLink>
      <PageHeader
        title={customer.name}
        description={`등록 ${formatInTz(customer.createdAt, DEFAULT_TZ, "yyyy.MM.dd")}${customer.tags.length ? ` · ${customer.tags.join(", ")}` : ""}`}
        meta={noShowCount > 0 ? <Badge kind="error">노쇼 {noShowCount}회</Badge> : undefined}
        actions={newApptButton("md")}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
        {[
          ["방문(완료)", `${visits}회`],
          ["최근 방문", lastVisit ? formatInTz(lastVisit.startAt, DEFAULT_TZ, "yyyy.MM.dd") : "—"],
          ["연락처", customer.phone ? customer.phone : customer.hasPhone === false ? "등록 없음" : PRIVATE],
          canRevenue ? ["미수 잔액", <span key="o" className={totalOutstanding > 0 ? "text-et" : undefined}>{formatKRW(totalOutstanding)}</span>] : ["이메일", customer.email ? customer.email : customer.hasEmail === false ? "등록 없음" : PRIVATE],
        ].map(([label, v]) => (
          <Card key={label as string} className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-t2">{label}</p>
            <p className="mt-1.5 truncate text-[18px] font-bold leading-tight tabular-nums text-t">{v}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-4 sm:p-5">
          <CardHead
            title="시술 이력"
            description="예약 단위. 사진과 메모는 아래 시술 기록에 남깁니다."
            action={
              <FilterRow className="pb-0">
                <StatusTab active={filter === "all"} onClick={() => setFilter("all")} count={appointments.length}>전체</StatusTab>
                <StatusTab active={filter === "done"} onClick={() => setFilter("done")} count={visits}>완료</StatusTab>
              </FilterRow>
            }
          />
          {rows.length === 0 ? (
            <EmptyState
              title={filter === "done" ? "완료된 시술이 없습니다." : "시술 이력이 없습니다."}
              description={filter === "done" ? undefined : "이 고객으로 진행된 예약이 아직 없습니다."}
              action={filter === "all" ? newApptButton("sm") : undefined}
            />
          ) : (
            <TableOrCards
              rows={rows}
              keyOf={(a) => a.id}
              table={
                <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                  <table className={`${TABLE} min-w-[640px]`}>
                    <thead>
                      <tr className={THEAD}>
                        <th className={TH}>일시</th>
                        <th className={TH}>시술</th>
                        <th className={TH}>담당 · 좌석</th>
                        <th className={TH}>상태</th>
                        <th className={`${TH} text-right`}>금액</th>
                        {showPayCol && <th className={`${TH} text-right`}>동작</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id} className={`${TR} h-[52px] hover:bg-sf2`}>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>{formatInTz(a.startAt, DEFAULT_TZ, "yyyy.MM.dd HH:mm")}</td>
                          <td className={`${TD} font-medium text-t`}>{a.serviceName ?? "-"}</td>
                          <td className={`${TD} text-t2`}>{a.staffName}{a.resourceName ? ` · ${a.resourceName}` : ""}</td>
                          <td className={TD}><Badge kind={SALON_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge></td>
                          <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>
                            {a.amount === null ? <span className="text-t3">—</span> : (
                              <>
                                {formatKRW(a.amount)}
                                {a.outstanding !== null && a.outstanding > 0 && <span className="block text-[11px] font-medium text-et">미수 {formatKRW(a.outstanding)}</span>}
                              </>
                            )}
                          </td>
                          {showPayCol && <td className={`${TD} text-right`}>{payButton(a)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
              card={(a) => (
                <MobileCard
                  title={a.serviceName ?? "-"}
                  sub={<><span>{formatInTz(a.startAt, DEFAULT_TZ, "yyyy.MM.dd HH:mm")}</span><span>· {a.staffName}{a.resourceName ? ` · ${a.resourceName}` : ""}</span></>}
                  badge={<Badge kind={SALON_STATUS_KIND[a.status] ?? "info"}>{a.status}</Badge>}
                  fields={a.amount === null ? undefined : [["금액", formatKRW(a.amount)], ...(a.outstanding !== null && a.outstanding > 0 ? ([["미수", <span key="o" className="font-semibold text-et">{formatKRW(a.outstanding)}</span>]] as [string, React.ReactNode][]) : [])]}
                  actions={payButton(a)}
                />
              )}
            />
          )}
        </Card>

        <TreatmentHistoryPanel businessId={businessId} canWrite={canWrite} history={treatmentHistory} />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <CardHead title="기본 정보" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
              <dt className="text-t3">전화번호</dt>
              <dd className="min-w-0 truncate text-t">{customer.phone ? customer.phone : customer.hasPhone === false ? <span className="text-t3">등록 없음</span> : PRIVATE}</dd>
              <dt className="text-t3">이메일</dt>
              <dd className="min-w-0 truncate text-t">{customer.email ? customer.email : customer.hasEmail === false ? <span className="text-t3">등록 없음</span> : PRIVATE}</dd>
              <dt className="text-t3">태그</dt>
              <dd className="text-t">{customer.tags.join(", ") || "—"}</dd>
              <dt className="text-t3">등록일</dt>
              <dd className="tabular-nums text-t">{formatInTz(customer.createdAt, DEFAULT_TZ, "yyyy.MM.dd")}</dd>
              {customer.memo && (
                <>
                  <dt className="text-t3">메모</dt>
                  <dd className="whitespace-pre-wrap text-t">{customer.memo}</dd>
                </>
              )}
            </dl>
          </Card>

          {canReadPii ? (
            <Card className="p-4 sm:p-5">
              <CardHead title="신체 치수" description="맞춤 시술·가운 준비용" action={canWrite ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Ruler size={13} aria-hidden />치수 기록</Button> : undefined} />
              {measurementsError ? (
                <Alert>치수 기록을 불러오지 못했습니다: {measurementsError}</Alert>
              ) : measurements.length === 0 ? (
                <p className="text-[12.5px] text-t3">기록된 신체 치수가 없습니다.</p>
              ) : (
                <div className="rounded-[var(--r-md)] bg-[var(--accent-soft)] p-3.5">
                  <p className="mb-2 text-[11.5px] font-semibold text-[var(--accent-ink)]">최신 기록 · {formatInTz(latest.measuredAt, DEFAULT_TZ, "yyyy.MM.dd HH:mm")}</p>
                  <MeasurementValues values={latest.values} />
                  {latest.note && <p className="mt-2 text-[12px] text-t2">메모: {latest.note}</p>}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4 sm:p-5">
              <CardHead title="신체 치수" />
              <p className="flex items-center gap-1.5 text-[12.5px] text-t3"><Lock size={13} aria-hidden /> 고객 개인정보 조회(pii.read) 권한이 없어 표시되지 않습니다.</p>
            </Card>
          )}
        </div>
      </div>

      <PayModal businessId={businessId} target={payTarget} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); router.refresh(); }} />

      <NewMeasurementModal
        businessId={businessId}
        customerId={customer.id}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => { setOpen(false); router.refresh(); }}
      />
    </>
  );
}

function MeasurementValues({ values }: { values: Record<string, number | string> }) {
  const entries = MEASURE_FIELDS.filter((f) => values[f.key] != null);
  if (entries.length === 0) return <span className="text-t3">—</span>;
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-[12.5px]">
      {entries.map((f) => (
        <div key={f.key}>
          <dt className="text-[11px] text-t3">{f.label.replace("(cm)", "")}</dt>
          <dd className="font-semibold tabular-nums text-t">{values[f.key]}<span className="ml-0.5 text-[11px] font-normal text-t3">cm</span></dd>
        </div>
      ))}
    </dl>
  );
}

function NewMeasurementModal({ businessId, customerId, open, onClose, onCreated }: { businessId: string; customerId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setValues({}); setNote(""); setError(null); } }, [open]);

  const submit = async () => {
    const numeric: Record<string, number> = {};
    for (const f of MEASURE_FIELDS) {
      const v = values[f.key];
      if (v && v.trim()) {
        const n = Number(v);
        if (Number.isNaN(n)) { setError(`${f.label} 값이 숫자가 아닙니다.`); return; }
        numeric[f.key] = n;
      }
    }
    if (Object.keys(numeric).length === 0) { setError("최소 한 항목은 입력하세요."); return; }
    setBusy(true); setError(null);
    const r = await addCustomerMeasurement(businessId, customerId, numeric, note.trim() || undefined);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onCreated();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="신체 치수 기록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>기록</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {error && <Alert className="mb-4">{error}</Alert>}
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
          {MEASURE_FIELDS.map((f) => (
            <Input key={f.key} label={f.label} inputMode="decimal" value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
          ))}
        </div>
        <Input label="메모(선택)" value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}
