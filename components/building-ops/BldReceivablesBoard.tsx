"use client";

/**
 * 건물 미수금: 연령 30·60·90 구간 요약, 청구별 미수 표, 독촉 단계 기록, 연체료 미리보기.
 * 연체료는 계약에서 승인된 조건만 서버가 계산한다(승인 전이면 서버가 거부하고 그 문구를 그대로 보여 준다). 화면에는 이율·유예일 기본값이 없다.
 */
import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert, CardHead, SelectField, SummaryStrip, TABLE, THEAD, TH, TR, TD } from "@/components/rental/listkit";
import { previewLateFee, recordDunning } from "@/lib/domain/building-actions";
import { FW, FORM_ROW, FORM_ACTIONS } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { BUCKET_LABEL, bucketOf, type Bucket } from "./aging";
import { won } from "./format";

export interface RecLine {
  id: string; unitLabel: string; party: string | null; period: string; kind: "bill" | "late_fee" | "correction";
  due_date: string | null; outstanding: number; age: number;
  dunning: { stage: 1 | 2 | 3; channel: string; date: string; promise: string | null; count: number } | null;
}
export interface BldReceivablesProps {
  businessId: string; asof: string;
  buckets: Record<Bucket | "total" | "overdue_total", number>;
  topUnits: { unit_id: string; label: string; party: string | null; overdue_balance: number; not_due_balance: number; max_age: number; count: number }[];
  rows: RecLine[]; lateFeeOn: boolean; canWrite: boolean;
}

const CHANNEL: Record<string, string> = { print: "인쇄 통지", sms: "문자", email: "이메일", call: "전화", visit: "방문", alimtalk: "알림톡" };
const STAGE: Record<1 | 2 | 3, string> = { 1: "1번째 안내", 2: "2번째 재촉", 3: "3번째 마지막 알림" };
const KIND: Record<RecLine["kind"], string> = { bill: "관리비", late_fee: "연체료", correction: "고친 금액" };

export function BldReceivablesBoard(p: BldReceivablesProps) {
  const [tab, setTab] = React.useState<Bucket | "all">("all");
  const [open, setOpen] = React.useState<{ id: string; mode: "dun" | "fee" } | null>(null);
  const [onlyFee, setOnlyFee] = React.useState(false);
  const fees = p.rows.filter((r) => r.kind === "late_fee");
  const rows = p.rows.filter((r) => (tab === "all" || bucketOf(r.age) === tab) && (!onlyFee || r.kind === "late_fee"));
  const keys: Bucket[] = ["not_due", "d0_30", "d31_60", "d61_90", "d90p"];
  return (
    <div className="space-y-4">
      <SummaryStrip
        items={[
          ...keys.map((k) => ({ label: BUCKET_LABEL[k], value: won(p.buckets[k]), tone: (k === "d61_90" || k === "d90p") && p.buckets[k] > 0 ? ("danger" as const) : ("default" as const) })),
          { label: "못 받은 돈 합계", value: won(p.buckets.total), tone: p.buckets.total > 0 ? "danger" : "success", hint: `이 중 납기 지난 돈 ${won(p.buckets.overdue_total)}` },
        ]}
      />
      <p className="text-[length:var(--fs-meta)] text-t3">기준일 {p.asof}. 날수는 납부기한 다음 날부터 센 날입니다.{fees.length > 0 && ` 연체료는 관리비와 따로 쌓이며 위 합계에 들어 있습니다(연체료 ${fees.length}건, ${won(fees.reduce((s, r) => s + r.outstanding, 0))}).`}</p>

      {p.topUnits.length > 0 && (
        <Card className="p-4 sm:p-5">
          <CardHead title="오래 못 받은 호실" description="납부기한이 지난 돈이 있는 호실을 가장 오래 밀린 순서로 5곳까지 보여 줍니다." />
          <div className="relative overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}><tr><th className={TH}>호실</th><th className={TH}>입주자</th><th className={`${TH} text-right`}>기한 지난 돈</th><th className={`${TH} text-right`}>기한 전</th><th className={`${TH} text-right`}>가장 오래 밀린 날수</th><th className={`${TH} text-right`}>건수</th></tr></thead>
              <tbody>
                {p.topUnits.map((u) => (
                  <tr key={u.unit_id} className={TR}>
                    <td className={TD}>{u.label}</td><td className={TD}>{u.party ?? "-"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{won(u.overdue_balance)}</td><td className={`${TD} text-right tabular-nums`}>{won(u.not_due_balance ?? 0)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{u.max_age}일 {u.max_age > 60 && <Badge kind="error">오래 밀림</Badge>}</td>
                    <td className={`${TD} text-right tabular-nums`}>{u.count}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <CardHead
          title="달마다 못 받은 돈"
          action={
            <div className="flex flex-wrap gap-1" role="group" aria-label="밀린 날수로 거르기">
              <Button type="button" size="sm" variant={tab === "all" ? "primary" : "secondary"} aria-pressed={tab === "all"} onClick={() => setTab("all")}>전체 {p.rows.length}</Button>
              {keys.map((k) => (
                <Button key={k} type="button" size="sm" variant={tab === k ? "primary" : "secondary"} aria-pressed={tab === k} onClick={() => setTab(k)}>{BUCKET_LABEL[k]} {p.rows.filter((r) => bucketOf(r.age) === k).length}</Button>
              ))}
              {fees.length > 0 && <Button type="button" size="sm" variant={onlyFee ? "primary" : "secondary"} aria-pressed={onlyFee} onClick={() => setOnlyFee((v) => !v)}>연체료만 {fees.length}</Button>}
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title={p.rows.length === 0 ? "못 받은 돈이 없습니다." : "이 구간에 못 받은 돈이 없습니다."} description={p.rows.length === 0 ? "확정된 관리비를 모두 받았습니다." : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr><th className={TH}>호실</th><th className={TH}>입주자</th><th className={TH}>관리비 달</th><th className={TH}>구분</th><th className={TH}>납부기한</th><th className={`${TH} text-right`}>남은 돈</th><th className={`${TH} text-right`}>밀린 날수</th><th className={TH}>재촉 기록</th><th className={TH}><span className="sr-only">작업</span></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = open?.id === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={TR}>
                        <td className={TD}>{r.unitLabel}</td><td className={TD}>{r.party ?? "-"}</td>
                        <td className={`${TD} tabular-nums`}>{r.period}</td><td className={TD}>{r.kind === "late_fee" ? <Badge kind="warning">{KIND[r.kind]}</Badge> : KIND[r.kind]}</td>
                        <td className={`${TD} tabular-nums`}>{r.due_date ?? "-"}</td>
                        <td className={`${TD} text-right tabular-nums`}>{won(r.outstanding)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{r.age > 0 ? <Badge kind={r.age > 60 ? "error" : r.age > 30 ? "warning" : "info"}>{`${r.age}일 지남`}</Badge> : <Badge kind="info">기한 내</Badge>}</td>
                        <td className={TD}>{r.dunning ? <span className="tabular-nums">{STAGE[r.dunning.stage]} · {r.dunning.date}{r.dunning.count > 1 ? ` (${r.dunning.count}회)` : ""}</span> : <span className="text-t3">없음</span>}</td>
                        <td className={`${TD} whitespace-nowrap text-right`}>
                          {p.lateFeeOn && r.kind === "bill" && <Button type="button" size="sm" variant="ghost" aria-expanded={isOpen && open?.mode === "fee"} onClick={() => setOpen(isOpen && open?.mode === "fee" ? null : { id: r.id, mode: "fee" })}>연체료</Button>}{" "}
                          {p.canWrite && <Button type="button" size="sm" variant="secondary" aria-expanded={isOpen && open?.mode === "dun"} onClick={() => setOpen(isOpen && open?.mode === "dun" ? null : { id: r.id, mode: "dun" })}>재촉 기록</Button>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-[var(--bd)] bg-sf2/40">
                          <td colSpan={9} className="px-3 py-4">
                            {open?.mode === "fee" ? <FeePanel businessId={p.businessId} rec={r} onDone={() => setOpen(null)} /> : <DunningPanel businessId={p.businessId} rec={r} onDone={() => setOpen(null)} />}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FeePanel({ businessId, rec, onDone }: { businessId: string; rec: RecLine; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [res, setRes] = React.useState<{ amount: number; days: number } | null>(null);
  return (
    <div className="sticky left-0 max-w-[calc(100vw-64px)] sm:max-w-[560px]">
      <p className="mb-2 text-[length:var(--fs-body)] text-t">계약에서 확정한 연체료 조건으로만 계산합니다. 여기서는 보기만 하고 저장하거나 청구하지 않습니다.</p>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      {res && <Alert kind="success" className="mb-3"><span className="tabular-nums">{res.days}일 늦어서 연체료 {won(res.amount)}</span></Alert>}
      <div className="flex gap-2">
        <Button type="button" loading={pending} onClick={async () => { setRes(null); const r = await run(() => previewLateFee(businessId, rec.id), { refresh: false }); if (r.ok) setRes(r.data); }}>연체료 얼마인지 보기</Button>
        <Button type="button" variant="ghost" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}

function DunningPanel({ businessId, rec, onDone }: { businessId: string; rec: RecLine; onDone: () => void }) {
  const { run, pending, error } = useRunAction();
  const [stage, setStage] = React.useState<1 | 2 | 3>(((rec.dunning?.stage ?? 0) + 1 > 3 ? 3 : (rec.dunning?.stage ?? 0) + 1) as 1 | 2 | 3);
  const [channel, setChannel] = React.useState("print");
  const [note, setNote] = React.useState("");
  const [promise, setPromise] = React.useState("");
  return (
    <div className="sticky left-0 max-w-[calc(100vw-64px)] sm:max-w-none">
      <p className="mb-2 text-[length:var(--fs-body)] text-t">입주자에게 실제로 연락한 뒤 적으세요. 여기 적는다고 문자가 가지는 않습니다.</p>
      <div className={`${FORM_ROW} mb-3`}>
        <SelectField label="몇 번째" wrapperClassName={FW.select} value={stage} onChange={(e) => setStage(Number(e.target.value) as 1 | 2 | 3)}>
          {([1, 2, 3] as const).map((s) => <option key={s} value={s}>{STAGE[s]}</option>)}
        </SelectField>
        <SelectField label="방법" wrapperClassName={FW.select} value={channel} onChange={(e) => setChannel(e.target.value)}>
          {Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectField>
        <Input label="내겠다고 한 날(선택)" type="date" value={promise} onChange={(e) => setPromise(e.target.value)} className="tabular-nums" wrapperClassName={FW.date} />
        <Input label="메모" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} wrapperClassName={FW.memo} />
      </div>
      {error && <Alert kind="error" className="mb-3">{error}</Alert>}
      <div className={FORM_ACTIONS}>
        <Button type="button" loading={pending} onClick={async () => { const r = await run(() => recordDunning(businessId, rec.id, { stage, channel: channel as "print", note: note.trim() || undefined, promise_date: promise || undefined }), { success: "재촉 기록을 저장했습니다." }); if (r.ok) onDone(); }}>기록 저장</Button>
        <Button type="button" variant="ghost" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}
