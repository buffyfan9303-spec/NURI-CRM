"use client";

/**
 * 검침 입력 표. Enter=아래 칸, Tab=옆 칸, 엑셀 열 붙여넣기(아래로 채움). 저장은 변경한 줄만 서버(upsertMeterReading)로 보낸다.
 * 역전(이번 < 전월)은 사유와 사용량을 넣어야 저장 버튼이 켜진다. 사용량 숫자는 표시용이고 최종 검증은 서버·DB 제약이다.
 * 저장 뒤 서버 값으로 다시 그리도록 page.tsx 가 저장값 요약을 key 로 준다(remount).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { Alert, CONTROL_SM, TABLE, THEAD, TH, TR, TD, PILL, SelectField, CardHead } from "@/components/rental/listkit";
import { upsertMeterReading, createMeter } from "@/lib/domain/building-actions";
import type { MeterKind, ReadingReason } from "@/lib/domain/building-types";
import { FW, FORM_ROW, FORM_ACTIONS, MONEY_INPUT } from "@/components/building/FieldWidths";
import { useRunAction } from "./client-common";
import { METER_KIND_LABEL, num } from "./format";
import { parsePasteColumn, readingState, suggestOverride, usageOf } from "./meter-calc";

export interface MeterLine {
  meterId: string;
  unitLabel: string;
  kind: MeterKind;
  serial: string | null;
  multiplier: number;
  unitText: string;
  maxReading: number | null;
  /** 전월 지침: 저장된 값이 있으면 그 값, 없으면 지난달 이번 지침, 그것도 없으면 0 */
  prev: number;
  saved: { curr: number; reason: ReadingReason | null; usageOverride: number | null } | null;
}
const REASON_LABEL: Record<ReadingReason, string> = { replaced: "계량기를 새로 바꿈", typo: "지난달 숫자를 잘못 적음", estimated: "직접 못 보고 어림함", rollover: "숫자가 한 바퀴 돌아 0부터" };

/** 저장 뒤 서버 값으로 다시 그릴 때(remount) 저장하지 못한 역전 줄 입력이 사라지지 않게 잠시 들고 있는다. */
const carry = new Map<string, { val: string; reason: ReadingReason | ""; override: string }>();

export function MeterGrid({
  businessId, buildingId, period, lines, locked, units,
}: {
  businessId: string; buildingId: string; period: string; lines: MeterLine[]; locked: boolean; units: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [vals, setVals] = React.useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.meterId, carry.get(l.meterId)?.val ?? (l.saved ? String(l.saved.curr) : "")])));
  const [reasons, setReasons] = React.useState<Record<string, ReadingReason | "">>(() => Object.fromEntries(lines.map((l) => [l.meterId, carry.get(l.meterId)?.reason ?? l.saved?.reason ?? ""])));
  const [overrides, setOverrides] = React.useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.meterId, carry.get(l.meterId)?.override ?? (l.saved?.usageOverride != null ? String(l.saved.usageOverride) : "")])));
  const [rowErr, setRowErr] = React.useState<Record<string, string>>({});
  const refs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const [kindFilter, setKindFilter] = React.useState<MeterKind | "all">("all");
  const shown = lines.filter((l) => kindFilter === "all" || l.kind === kindFilter);
  const kinds = Array.from(new Set(lines.map((l) => l.kind)));

  const currOf = (l: MeterLine) => Number((vals[l.meterId] ?? "").replace(/,/g, ""));
  const dirty = (l: MeterLine) => {
    const t = (vals[l.meterId] ?? "").trim();
    if (t === "") return false;
    if (!l.saved) return true;
    return String(l.saved.curr) !== t || (l.saved.reason ?? "") !== (reasons[l.meterId] ?? "") || String(l.saved.usageOverride ?? "") !== (overrides[l.meterId] ?? "");
  };
  const blocked = (l: MeterLine) => {
    const st = readingState(l.prev, vals[l.meterId] ?? "", l.maxReading);
    if (st === "invalid" || st === "over_max") return true;
    if (st === "reversed") {
      const o = Number(overrides[l.meterId]);
      return !reasons[l.meterId] || (overrides[l.meterId] ?? "").trim() === "" || !Number.isFinite(o) || o < 0;
    }
    return false;
  };
  const saveable = lines.filter((l) => dirty(l) && !blocked(l));
  const held = lines.filter((l) => dirty(l) && blocked(l) && readingState(l.prev, vals[l.meterId] ?? "", l.maxReading) === "reversed");

  function focusRow(i: number) {
    const l = shown[i];
    if (l) refs.current[l.meterId]?.focus();
  }
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, i: number) {
    const text = e.clipboardData.getData("text");
    if (!/\n/.test(text.trim())) return; // 한 칸 값이면 기본 동작
    e.preventDefault();
    const cells = parsePasteColumn(text);
    setVals((prev) => {
      const next = { ...prev };
      cells.forEach((c, k) => {
        const l = shown[i + k];
        if (l && c !== "") next[l.meterId] = c;
      });
      return next;
    });
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    const errs: Record<string, string> = {};
    let ok = 0;
    try {
      for (const l of saveable) {
        const st = readingState(l.prev, vals[l.meterId] ?? "", l.maxReading);
        const reversed = st === "reversed";
        const r = await upsertMeterReading(businessId, {
          meter_id: l.meterId, period, prev_reading: l.prev, curr_reading: currOf(l),
          reason: reversed ? (reasons[l.meterId] as ReadingReason) : null,
          usage_override: reversed ? Number(overrides[l.meterId]) : null,
        });
        if (r.ok) ok++;
        else errs[l.meterId] = r.message;
      }
    } catch {
      setError("요청을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.");
    }
    setRowErr(errs);
    setSaving(false);
    carry.clear();
    for (const l of held) carry.set(l.meterId, { val: vals[l.meterId] ?? "", reason: reasons[l.meterId] ?? "", override: overrides[l.meterId] ?? "" });
    if (ok > 0) {
      toast.success(held.length > 0 ? `${ok}건 저장했습니다. 지난달보다 숫자가 작은 ${held.length}건은 이유와 사용량을 적어야 저장돼 그대로 남겨 두었습니다.` : `${ok}건 저장했습니다.`);
      router.refresh();
    }
    if (Object.keys(errs).length > 0) setError(`${Object.keys(errs).length}건은 저장하지 못했습니다. 줄마다 표시된 사유를 확인하세요.`);
  }

  return (
    <div className="space-y-4">
      {locked && <Alert kind="warning">이 달 금액은 이미 확정돼 계량기 숫자를 바꿀 수 없습니다. 고쳐야 하면 관리비 계산 화면에서 "금액 고치기"를 쓰세요.</Alert>}
      <Card className="p-4 sm:p-5">
        <CardHead
          title="계량기 숫자 입력"
          description="계량기에 보이는 이번 달 숫자를 적고 Enter 를 누르면 아래 칸으로 갑니다. 엑셀 한 열을 복사해 붙여 넣어도 됩니다."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className={PILL}>적음 {lines.filter((l) => (vals[l.meterId] ?? "").trim()).length} / {lines.length}건</span>
              <Button type="button" onClick={saveAll} loading={saving} disabled={locked || saveable.length === 0}>
                변경한 {saveable.length}건 저장
              </Button>
            </div>
          }
        />
        {kinds.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="계량기 종류">
            {(["all", ...kinds] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}
                className={`min-h-[44px] rounded-[var(--r-sm)] border px-3 text-[length:var(--fs-meta)] ${kindFilter === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--bd)] bg-sf text-t2"}`}>
                {k === "all" ? "전체" : METER_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        {error && <Alert kind="error" className="mb-3">{error}</Alert>}
        {lines.length === 0 ? (
          <EmptyState title="등록된 계량기가 없습니다." description="아래에서 호실마다 계량기를 먼저 등록하세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>호실</th><th className={TH}>종류</th>
                  <th className={`${TH} text-right`}>지난달 숫자</th><th className={`${TH} text-right`}>이번 달 숫자</th>
                  <th className={`${TH} text-right`}>사용량</th><th className={TH}>상태</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l, i) => {
                  const st = readingState(l.prev, vals[l.meterId] ?? "", l.maxReading);
                  const reason = reasons[l.meterId] ?? "";
                  return (
                    <tr key={l.meterId} className={TR}>
                      <td className={`${TD} font-medium`}>{l.unitLabel}</td>
                      <td className={TD}>{METER_KIND_LABEL[l.kind]}{l.serial ? <span className="ml-1 text-t3">#{l.serial}</span> : null}</td>
                      <td className={`${TD} text-right tabular-nums`}>{num(l.prev)}</td>
                      <td className={`${TD} text-right`}>
                        <input
                          ref={(el) => { refs.current[l.meterId] = el; }}
                          inputMode="decimal"
                          aria-label={`${l.unitLabel} ${METER_KIND_LABEL[l.kind]} 이번 달 숫자`}
                          className={`${CONTROL_SM} w-[130px] text-right tabular-nums`}
                          value={vals[l.meterId] ?? ""}
                          disabled={locked}
                          onChange={(e) => setVals((p) => ({ ...p, [l.meterId]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusRow(i + 1); } }}
                          onPaste={(e) => onPaste(e, i)}
                        />
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {st === "ok"
                          ? `${num(usageOf(l.prev, currOf(l), l.multiplier))}${l.unitText ? ` ${l.unitText}` : ""}`
                          : st === "reversed"
                            ? <input
                                inputMode="decimal"
                                aria-label={`${l.unitLabel} 사용량 직접 입력`}
                                className={`${CONTROL_SM} w-[110px] text-right tabular-nums`}
                                value={overrides[l.meterId] ?? ""}
                                disabled={locked}
                                placeholder="사용량 입력"
                                onChange={(e) => setOverrides((p) => ({ ...p, [l.meterId]: e.target.value }))}
                              />
                            : "-"}
                      </td>
                      <td className={TD}>
                        {st === "reversed" ? (
                          <div className="flex flex-col gap-1">
                            {l.saved && !dirty(l) ? <Badge kind="success">저장됨(지난달보다 작음)</Badge> : <Badge kind="warning">지난달보다 작음 - 이유 필요</Badge>}
                            <select
                              aria-label={`${l.unitLabel} 숫자가 작은 이유`}
                              className={CONTROL_SM}
                              value={reason}
                              disabled={locked}
                              onChange={(e) => {
                                const r = e.target.value as ReadingReason | "";
                                setReasons((p) => ({ ...p, [l.meterId]: r }));
                                setOverrides((p) => ({ ...p, [l.meterId]: suggestOverride(r, l.prev, currOf(l), l.multiplier, l.maxReading) }));
                              }}
                            >
                              <option value="">이유 고르기</option>
                              {(Object.keys(REASON_LABEL) as ReadingReason[]).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                            </select>
                          </div>
                        ) : st === "invalid" ? <Badge kind="error">숫자가 아님</Badge>
                          : st === "over_max" ? <Badge kind="error">계량기 최대 숫자보다 큼</Badge>
                          : l.saved && !dirty(l) ? <Badge kind="success">저장됨</Badge>
                          : st === "ok" ? <Badge kind="info">저장 전</Badge> : <span className="text-t3">안 적음</span>}
                        {rowErr[l.meterId] && <p role="alert" className="mt-1 text-[length:var(--fs-meta)] text-et">{rowErr[l.meterId]}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <NewMeter businessId={businessId} buildingId={buildingId} units={units} disabled={locked} />
    </div>
  );
}

function NewMeter({ businessId, buildingId, units, disabled }: { businessId: string; buildingId: string; units: { id: string; label: string }[]; disabled: boolean }) {
  const { run, pending, error } = useRunAction();
  const [unit, setUnit] = React.useState("");
  const [kind, setKind] = React.useState<MeterKind>("electric");
  const [serial, setSerial] = React.useState("");
  const [mult, setMult] = React.useState("1");
  return (
    <Card className="p-4 sm:p-5">
      <CardHead title="계량기 등록" description="호실마다 전기·수도 계량기를 등록하면 위 표에 한 줄씩 생깁니다." />
      <form className={FORM_ROW} onSubmit={(e) => { e.preventDefault(); void run(() => createMeter(businessId, buildingId, { unit_id: unit, kind, serial: serial.trim() || undefined, multiplier: Number(mult) || 1 }), { success: "계량기를 등록했습니다." }); }}>
        <SelectField label="호실" required value={unit} onChange={(e) => setUnit(e.target.value)} disabled={disabled} wrapperClassName={FW.select}>
          <option value="">선택</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </SelectField>
        <SelectField label="종류" value={kind} onChange={(e) => setKind(e.target.value as MeterKind)} disabled={disabled} wrapperClassName={FW.select}>
          {(Object.keys(METER_KIND_LABEL) as MeterKind[]).map((k) => <option key={k} value={k}>{METER_KIND_LABEL[k]}</option>)}
        </SelectField>
        <Input label="계량기 번호" hint="계량기에 붙은 번호(선택)" value={serial} onChange={(e) => setSerial(e.target.value)} disabled={disabled} maxLength={40} wrapperClassName={FW.doc} />
        <Input label="곱하는 수(배율)" hint="보통 1" type="number" min={0.001} step="any" value={mult} onChange={(e) => setMult(e.target.value)} disabled={disabled} className={MONEY_INPUT} wrapperClassName={FW.short} />
        <div className={FORM_ACTIONS}>
          {error && <Alert kind="error" className="w-full">{error}</Alert>}
          <Button type="submit" variant="secondary" loading={pending} disabled={disabled || !unit}>계량기 등록</Button>
        </div>
      </form>
    </Card>
  );
}
