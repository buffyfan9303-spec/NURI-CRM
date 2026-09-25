"use client";

/**
 * 고객 상세 — 기본 정보 + "고객 신체 치수"(customer_measurements).
 * 개체 실측(rental_units.measurements, 카탈로그 화면 소관)과는 표시 위치·헤딩·데이터 출처가
 * 전부 다르다. 기준본이 이 둘을 혼동했던 지점이라 헤딩에 "고객"임을 명시한다.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Lock, Ruler } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { CardHead, Alert, BackLink, TABLE, THEAD, TH, TR_CLICK, TR, TD } from "./listkit";
import type { CustomerRow, CustomerMeasurementRow, ReservationStatus } from "@/lib/domain/rental-types";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_BADGE } from "@/lib/domain/rental-types";
import { addCustomerMeasurement } from "@/lib/domain/rental-actions";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import { formatKRW } from "@/lib/domain/money";
import type { CustomerMoneySummary } from "@/lib/domain/rental-money-types";

/** 결함 D7: 고객 상세에 예약 이력을 연결한다. confirmed=customer_ref로 확정 연결된 예약,
 *  guessed=customer_ref가 없는 레거시 예약 중 이름이 일치해 추정으로만 보여주는 예약
 *  (확정과 섞이지 않도록 화면에서 구분 표시한다). */
export interface ReservationHistoryRow {
  id: string;
  reservationNo: string;
  periodStart: string;
  periodEnd: string;
  status: ReservationStatus;
  /** revenue.read 없으면 null(0원이 아니라 아예 표시하지 않음). */
  amount: number | null;
  /** 0027: 예약별 잔액(revenue.read 없으면 null). */
  outstanding: number | null;
  depositBalance: number | null;
  linkKind: "confirmed" | "guessed";
}

const MEASURE_FIELDS: { key: string; label: string }[] = [
  { key: "neck", label: "목(cm)" },
  { key: "shoulder", label: "어깨(cm)" },
  { key: "chest", label: "가슴(cm)" },
  { key: "waist", label: "허리(cm)" },
  { key: "sleeve", label: "소매(cm)" },
  { key: "length", label: "총장(cm)" },
];

export function CustomerDetail({
  businessId,
  customer,
  canReadPii,
  canWrite,
  measurements,
  measurementsError,
  reservationHistory,
  money = null,
}: {
  businessId: string;
  customer: CustomerRow;
  canReadPii: boolean;
  canWrite: boolean;
  measurements: CustomerMeasurementRow[];
  measurementsError: string | null;
  reservationHistory: ReservationHistoryRow[];
  /** 0027: 미수·보관 보증금 요약(렌탈만). revenue.read 없으면 masked 로 여부만 온다. */
  money?: CustomerMoneySummary | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const latest = measurements[0];
  const newReservationHref = `/w/${businessId}/reservations/new?customerId=${customer.id}`;

  return (
    <>
      <BackLink href={`/w/${businessId}/customers`}>고객 목록</BackLink>
      <PageHeader
        title={customer.name}
        description={`등록일 ${formatInTz(customer.createdAt, DEFAULT_TZ, "yyyy. M. d.")}${reservationHistory.length ? ` · 예약 ${reservationHistory.length}건` : ""}`}
        meta={customer.tags.length > 0 ? customer.tags.map((t) => <span key={t} className="rounded-[6px] bg-sf2 px-2 py-0.5 text-[11.5px] font-medium text-t2">{t}</span>) : undefined}
        actions={
          canWrite ? (
            <Link href={newReservationHref}>
              <Button className="w-full">
                <Plus size={15} aria-hidden />새 예약
              </Button>
            </Link>
          ) : undefined
        }
      />
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
    <div className="flex flex-col gap-4 lg:col-span-8">
      <Card className="p-4 sm:p-5">
        <CardHead title="예약 이력" description="확정 연결된 예약과 이름으로 추정 연결된 예약을 함께 보여줍니다." />
        {reservationHistory.length === 0 ? (
          <EmptyState
            title="예약 이력이 없습니다."
            description="이 고객으로 진행된 예약이 아직 없습니다."
            action={
              canWrite && (
                <Link href={newReservationHref}>
                  <Button size="sm"><Plus size={14} aria-hidden />새 예약</Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="relative -mx-4 overflow-x-auto px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:-mx-5 sm:px-5" tabIndex={0} role="region" aria-label="예약 이력 표(가로 스크롤)">
            <table className={`${TABLE} min-w-[720px]`}>
              <thead>
                <tr className={THEAD}>
                  <th className={TH}>예약번호</th>
                  <th className={TH}>대여기간</th>
                  <th className={TH}>상태</th>
                  <th className={`${TH} text-right`}>금액</th>
                  <th className={`${TH} text-right`}>잔액(미수)</th>
                  <th className={`${TH} text-right`}>보관 보증금</th>
                </tr>
              </thead>
              <tbody>
                {reservationHistory.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/w/${businessId}/reservations/${r.id}`)}
                    className={`${TR_CLICK} h-[48px]`}
                  >
                    <td className={`${TD} font-mono text-[11.5px] text-t3`}>
                      {r.reservationNo}
                      {r.linkKind === "guessed" && (
                        <span className="ml-1.5 rounded-[4px] bg-sf3 px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-t3">
                          이름으로 추정 연결됨
                        </span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums text-t2`}>
                      {formatInTz(r.periodStart, DEFAULT_TZ, "yyyy.MM.dd")} ~ {formatInTz(r.periodEnd, DEFAULT_TZ, "yyyy.MM.dd")}
                    </td>
                    <td className={TD}>
                      <Badge kind={RESERVATION_STATUS_BADGE[r.status]}>{RESERVATION_STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t`}>
                      {r.amount === null ? <span className="text-t3">-</span> : formatKRW(r.amount)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums ` + ((r.outstanding ?? 0) > 0 ? "font-semibold text-et" : "text-t2")}>
                      {r.outstanding === null ? <span className="text-t3">-</span> : formatKRW(r.outstanding)}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums text-t2`}>
                      {r.depositBalance === null ? <span className="text-t3">-</span> : formatKRW(r.depositBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canReadPii ? (
        <Card className="p-4 sm:p-5">
          <CardHead
            title="고객 신체 치수"
            description="이 고객의 몸 치수 기록입니다. 대여 의류의 실측(개체 실측)은 상품·개체 화면에서 따로 관리합니다."
            action={
              canWrite ? (
                <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                  <Plus size={13} aria-hidden />
                  치수 기록
                </Button>
              ) : undefined
            }
          />

          {measurementsError ? (
            <Alert>치수 기록을 불러오지 못했습니다: {measurementsError}</Alert>
          ) : measurements.length === 0 ? (
            <EmptyState title="기록된 신체 치수가 없습니다." description="치수 기록 버튼으로 첫 기록을 남기세요." />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)] p-3.5">
                {/* ponytail: toLocaleString("ko-KR") → formatInTz(ICU 오전/오후 불일치로 인한 hydration 오류 방지). */}
                <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--accent-ink)]"><Ruler size={13} aria-hidden />최신 기록 · {formatInTz(latest.measuredAt, DEFAULT_TZ, "yyyy. M. d. HH:mm")}</p>
                <MeasurementValues values={latest.values} />
                {latest.note && <p className="mt-1.5 text-[12px] text-t2">메모: {latest.note}</p>}
              </div>

              {measurements.length > 1 && (
                <div className="relative -mx-4 overflow-x-auto px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:-mx-5 sm:px-5" tabIndex={0} role="region" aria-label="측정 기록 표(가로 스크롤)">
                  <table className={`${TABLE} min-w-[480px]`}>
                    <thead>
                      <tr className={THEAD}>
                        <th className={TH}>측정일</th>
                        <th className={TH}>값</th>
                        <th className={TH}>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.slice(1).map((m) => (
                        <tr key={m.id} className={TR}>
                          <td className={`${TD} whitespace-nowrap tabular-nums text-t3`}>{formatInTz(m.measuredAt, DEFAULT_TZ, "yyyy. M. d. HH:mm")}</td>
                          <td className={`${TD} text-t2`}><MeasurementValues values={m.values} inline /></td>
                          <td className={`${TD} text-t3`}>{m.note ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <p className="flex items-center gap-1.5 text-[12.5px] text-t3">
            <Lock size={13} aria-hidden /> 고객 개인정보 조회(pii.read) 권한이 없어 신체 치수 기록이 표시되지 않습니다.
          </p>
        </Card>
      )}
    </div>

    <div className="flex flex-col gap-4 lg:col-span-4">
      {money && (
        <Card className={"p-4 sm:p-5 " + (money.hasOutstanding ? "border-[var(--et)]" : "")}>
          <CardHead title="미수·보증금" description={money.masked ? "금액은 매출·정산 조회 권한이 있어야 보입니다." : `진행 중 예약 ${money.openReservations}건`} />
          {money.masked ? (
            <div className="flex flex-wrap gap-1.5">
              {money.hasOutstanding ? <Badge kind="warning">미수 있음</Badge> : <Badge kind="success">미수 없음</Badge>}
              {money.hasDeposit && <Badge kind="info">보증금 보관 중</Badge>}
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[11.5px] text-t3">미수금 합계</dt>
                <dd className={"mt-0.5 text-[16px] font-semibold tabular-nums " + (money.hasOutstanding ? "text-et" : "text-t")}>{formatKRW(money.outstandingTotal)}</dd>
                <dd className="text-[11px] text-t3">{money.reservationsWithOutstanding}건</dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-t3">보관 보증금</dt>
                <dd className="mt-0.5 text-[16px] font-semibold tabular-nums text-t">{formatKRW(money.depositHeldTotal)}</dd>
              </div>
            </dl>
          )}
          {money.hasOutstanding && (
            <Link href={`/w/${businessId}/receivables`} className="mt-2 inline-flex h-[32px] items-center text-[12.5px] font-medium text-[var(--accent-ink)] hover:underline [@media(pointer:coarse)]:h-[44px]">미수금 보드에서 독촉·수납 →</Link>
          )}
        </Card>
      )}
      <Card className="p-4 sm:p-5">
        <CardHead title="기본 정보" />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <dt className="text-[11.5px] text-t3">전화번호</dt>
            <dd className="mt-0.5 tabular-nums text-t">
              {customer.phone ? customer.phone : customer.hasPhone === false ? <span className="text-t3">등록 없음</span> : <span className="inline-flex items-center gap-1 text-t3"><Lock size={11} aria-hidden /> 비공개(권한 필요)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11.5px] text-t3">이메일</dt>
            <dd className="mt-0.5 break-all text-t">
              {customer.email ? customer.email : customer.hasEmail === false ? <span className="text-t3">등록 없음</span> : <span className="inline-flex items-center gap-1 text-t3"><Lock size={11} aria-hidden /> 비공개(권한 필요)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11.5px] text-t3">태그</dt>
            <dd className="mt-0.5 text-t">{customer.tags.join(", ") || <span className="text-t3">없음</span>}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] text-t3">등록일</dt>
            <dd className="mt-0.5 tabular-nums text-t">{formatInTz(customer.createdAt, DEFAULT_TZ, "yyyy. M. d.")}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <dt className="text-[11.5px] text-t3">메모</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-t">{customer.memo || <span className="text-t3">없음</span>}</dd>
          </div>
        </dl>
      </Card>

    </div>
    </div>

      <NewMeasurementModal
        businessId={businessId}
        customerId={customer.id}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

function MeasurementValues({ values, inline }: { values: Record<string, number | string>; inline?: boolean }) {
  const entries = MEASURE_FIELDS.filter((f) => values[f.key] != null).map((f) => `${f.label.replace("(cm)", "")} ${values[f.key]}`);
  if (entries.length === 0) return <span className="text-t3">-</span>;
  return inline ? (
    <span>{entries.join(" · ")}</span>
  ) : (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-t">
      {entries.map((e) => (
        <span key={e}>{e}</span>
      ))}
    </div>
  );
}

function NewMeasurementModal({
  businessId,
  customerId,
  open,
  onClose,
  onCreated,
}: {
  businessId: string;
  customerId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // CLICK-PATH-212: 취소 후 다시 열면 이전 입력이 남지 않게 open 전환 시 초기화.
  React.useEffect(() => {
    if (open) { setValues({}); setNote(""); setError(null); }
  }, [open]);

  const submit = async () => {
    const numeric: Record<string, number> = {};
    for (const f of MEASURE_FIELDS) {
      const v = values[f.key];
      if (v && v.trim()) {
        const n = Number(v);
        if (Number.isNaN(n)) {
          setError(`${f.label} 값이 숫자가 아닙니다.`);
          return;
        }
        numeric[f.key] = n;
      }
    }
    if (Object.keys(numeric).length === 0) {
      setError("최소 한 항목은 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await addCustomerMeasurement(businessId, customerId, numeric, note.trim() || undefined);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setValues({});
    setNote("");
    onCreated();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="고객 신체 치수 기록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>취소</Button>
          <Button onClick={submit} loading={busy}>{busy ? "저장 중…" : "기록"}</Button>
        </>
      }
    >
      {error && <Alert className="mb-3">{error}</Alert>}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid grid-cols-2 gap-x-3">
          {MEASURE_FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              inputMode="decimal"
              wrapperClassName="mb-3"
            />
          ))}
        </div>
        <Input label="메모(선택)" value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="mb-0" />
      </form>
    </Modal>
  );
}
