"use client";

/**
 * 렌탈 사업장 돈 규정 설정(0027): 연체료 기준(유예시간·일당·요율·손상 기본값) + 취소 위약금 단계표.
 * staff.manage 만 이 화면에 도달하고 서버 RPC 가 다시 검사한다. 연체료 저장은 새 버전 행이라 과거 예약 스냅샷은 불변.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "@/lib/icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert, CONTROL } from "./listkit";
import { formatKRW, parseKRW } from "@/lib/domain/money";
import { formatInTz, DEFAULT_TZ } from "@/lib/utils/datetime";
import type { CancelPolicy, CancelTier, FeePolicy } from "@/lib/domain/rental-money-types";
import { setFeePolicyAction, setCancelPolicyAction } from "@/lib/domain/rental-money-actions";
import { CONSUMER_DEFAULT_TIERS, BUSINESS_DEFAULT_TIERS, sortTiers, isDefaultPolicy } from "./cancel-tier";

export function RentalMoneySettings({ businessId, feePolicy, cancelPolicy }: { businessId: string; feePolicy: FeePolicy | null; cancelPolicy: CancelPolicy | null }) {
  return (
    <>
      <FeePolicyCard businessId={businessId} initial={feePolicy} />
      <CancelPolicyCard businessId={businessId} initial={cancelPolicy} />
    </>
  );
}

function FeePolicyCard({ businessId, initial }: { businessId: string; initial: FeePolicy | null }) {
  const router = useRouter();
  const [name, setName] = React.useState(initial?.name ?? "기본");
  const [graceHours, setGraceHours] = React.useState(String(initial?.graceHours ?? 0));
  const [perDay, setPerDay] = React.useState(initial ? String(initial.lateFeePerDay) : "");
  const [ratePct, setRatePct] = React.useState(initial?.lateFeeRate != null ? String(Math.round(initial.lateFeeRate * 1000) / 10) : "");
  const [damage, setDamage] = React.useState(initial ? String(initial.damageDefault) : "0");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<FeePolicy | null>(initial);

  const submit = async () => {
    const gh = Number(graceHours);
    if (!Number.isInteger(gh) || gh < 0) { setError("유예 시간은 0 이상 정수여야 합니다."); return; }
    const rate = ratePct.trim() === "" ? null : Number(ratePct) / 100;
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 1)) { setError("일 요율은 0~100% 사이여야 합니다."); return; }
    setBusy(true); setError(null);
    const r = await setFeePolicyAction(businessId, { name, graceHours: gh, lateFeePerDay: parseKRW(perDay || "0"), lateFeeRate: rate, damageDefault: parseKRW(damage || "0") });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setSaved(r.data);
    router.refresh();
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-[13.5px] font-semibold text-t">연체료 기준</h2>
      <p className="mb-3 text-[11.5px] text-t3">
        반납 예정 시각을 넘긴 예약의 연체료를 계산하는 기준입니다. 저장하면 새 버전이 생기고, 이미 확정된 예약은 확정 당시 기준을 그대로 씁니다.
        {saved && <span className="block">현재 적용: {saved.name} · {formatInTz(saved.effectiveFrom, DEFAULT_TZ, "yyyy. M. d. HH:mm")}부터 · 일 {formatKRW(saved.lateFeePerDay)}{saved.lateFeeRate != null ? ` · 요율 ${Math.round(saved.lateFeeRate * 1000) / 10}%` : ""} · 유예 {saved.graceHours}시간</span>}
        {!saved && <span className="block text-wt">아직 기준이 없습니다 — 연체료 계산이 0원으로 나옵니다.</span>}
      </p>
      {error && <Alert className="mb-3">{error}</Alert>}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Input label="기준 이름" required value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2026 기본" wrapperClassName="mb-3" />
        <Input label="유예 시간(시간)" value={graceHours} onChange={(e) => setGraceHours(e.target.value)} inputMode="numeric" hint="이 시간까지는 연체로 보지 않습니다. 예: 3" wrapperClassName="mb-3" />
        <Input label="일당 연체료(원)" value={perDay} onChange={(e) => setPerDay(e.target.value)} inputMode="numeric" placeholder="예: 20000" wrapperClassName="mb-3" />
        <Input label="일 요율(%, 선택)" value={ratePct} onChange={(e) => setRatePct(e.target.value)} inputMode="decimal" placeholder="예: 10 = 대여료의 10%/일" hint="비워 두면 일당 금액만 씁니다." wrapperClassName="mb-3" />
        <Input label="손상비 기본값(원)" value={damage} onChange={(e) => setDamage(e.target.value)} inputMode="numeric" hint="반납 검수에서 손상 청구를 만들 때 제안되는 금액" wrapperClassName="mb-3" />
        <div className="flex items-end pb-3"><Button type="submit" loading={busy}>{busy ? "저장 중…" : "새 버전으로 저장"}</Button></div>
      </form>
    </Card>
  );
}

const CONSUMER_DEFAULT = CONSUMER_DEFAULT_TIERS;
const BUSINESS_DEFAULT = BUSINESS_DEFAULT_TIERS;

interface TierDraft { key: string; unit: "days" | "months"; value: string; rate: string }
const toDraft = (t: CancelTier[]): TierDraft[] => sortTiers(t).map((x) => ({
  key: crypto.randomUUID(), unit: x.min_months != null ? "months" : "days", value: String(x.min_months ?? x.min_days ?? 0), rate: String(x.rate),
}));

function CancelPolicyCard({ businessId, initial }: { businessId: string; initial: CancelPolicy | null }) {
  const router = useRouter();
  const [customer, setCustomer] = React.useState<TierDraft[]>(() => toDraft(initial?.customerTiers?.length ? initial.customerTiers : CONSUMER_DEFAULT));
  const [business, setBusiness] = React.useState<TierDraft[]>(() => toDraft(initial?.businessTiers?.length ? initial.businessTiers : BUSINESS_DEFAULT));
  const [grace, setGrace] = React.useState(String(initial?.contractGraceHours ?? 24));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // 결함 D8: 서버 is_default 는 한 번 저장하면 false 지만, 저장 내용이 기본표와 같으면 "기본 기준과 동일"로 보여 준다(화면 비교).
  const [saved, setSaved] = React.useState<CancelPolicy | null>(initial);
  const isDefault = isDefaultPolicy(saved);
  const sameAsDefault = !saved?.isDefault && isDefault;

  const parse = (rows: TierDraft[], label: string): CancelTier[] | string => {
    const out: CancelTier[] = [];
    for (const r of rows) {
      const d = Number(r.value), p = Number(r.rate);
      if (!Number.isFinite(p) || p < 0 || p > 100) return `${label} 단계표: 비율은 0~100 사이여야 합니다.`;
      if (r.unit === "months") {
        if (!Number.isInteger(d) || d < 1) return `${label} 단계표: 개월은 1 이상 정수여야 합니다.`;
        out.push({ min_months: d, rate: p });
      } else {
        if (!Number.isInteger(d) || d < 0) return `${label} 단계표: 남은 일수는 0 이상 정수여야 합니다.`;
        out.push({ min_days: d, rate: p });
      }
    }
    if (!out.some((t) => t.min_days === 0)) return `${label} 단계표에 '당일(0일)' 단계가 있어야 합니다.`;
    return out;
  };
  const submit = async () => {
    const c = parse(customer, "소비자"), b = parse(business, "사업자");
    if (typeof c === "string") { setError(c); return; }
    if (typeof b === "string") { setError(b); return; }
    const gh = Number(grace);
    if (!Number.isInteger(gh) || gh < 0) { setError("계약 후 무료 취소 시간은 0 이상 정수여야 합니다."); return; }
    setBusy(true); setError(null);
    const r = await setCancelPolicyAction(businessId, { customerTiers: c, businessTiers: b, contractGraceHours: gh });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setSaved(r.data);
    router.refresh();
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-[13.5px] font-semibold text-t">취소 위약금 단계표</h2>
      <p className="mb-3 text-[11.5px] text-t3">
        확정 예약을 취소할 때 남은 일수에 따라 대여료의 몇 %를 위약금(손님 사정)·배상금(매장 사정)으로 할지 정합니다.
        기본값은 공정위 소비자분쟁해결기준(단기 물품대여서비스업)입니다. {sameAsDefault ? "저장된 규정이 공정위 기본 기준과 동일합니다." : isDefault ? "지금은 기본값을 쓰고 있습니다." : "사업장 규정이 적용 중입니다."}
      </p>
      {error && <Alert className="mb-3">{error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TierEditor title="손님 사정(소비자 귀책) 위약금" rows={customer} setRows={setCustomer} onReset={() => setCustomer(toDraft(CONSUMER_DEFAULT))} />
        <TierEditor title="매장 사정(사업자 귀책) 배상" rows={business} setRows={setBusiness} onReset={() => setBusiness(toDraft(BUSINESS_DEFAULT))} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Input label="계약 후 무료 취소 시간(시간)" value={grace} onChange={(e) => setGrace(e.target.value)} inputMode="numeric" hint="확정(계약) 후 이 시간 안의 취소는 위약금 0%. 공정위 기준 24시간." wrapperClassName="mb-3" />
        <div className="flex items-end pb-3"><Button onClick={submit} loading={busy}>{busy ? "저장 중…" : "단계표 저장"}</Button></div>
      </div>
    </Card>
  );
}

function TierEditor({ title, rows, setRows, onReset }: { title: string; rows: TierDraft[]; setRows: React.Dispatch<React.SetStateAction<TierDraft[]>>; onReset: () => void }) {
  const update = (key: string, patch: Partial<TierDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--bd)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold text-t">{title}</h3>
        <button type="button" onClick={onReset} className="inline-flex h-[32px] items-center rounded-[var(--r-sm)] px-2 text-[12px] font-medium text-[var(--accent-ink)] hover:bg-sf2 [@media(pointer:coarse)]:h-[44px]">공정위 기본값</button>
      </div>
      <div className="mb-1 grid grid-cols-[1fr_84px_1fr_40px] gap-2 text-[11px] text-t3"><span>남은 기간(이상)</span><span>단위</span><span>대여료의 %</span><span /></div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_84px_1fr_40px] gap-2">
            <input value={r.value} onChange={(e) => update(r.key, { value: e.target.value })} inputMode="numeric" aria-label="남은 기간" placeholder={r.unit === "months" ? "1" : "0=당일"} className={CONTROL} />
            <select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value as TierDraft["unit"] })} aria-label="단위" className={CONTROL}>
              <option value="days">일</option>
              <option value="months">개월</option>
            </select>
            <input value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} inputMode="numeric" aria-label="비율(%)" className={CONTROL} />
            <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="단계 삭제" disabled={rows.length <= 1} className="flex h-[40px] items-center justify-center rounded-[var(--r-md)] border border-[var(--bd2)] text-et hover:bg-eb disabled:opacity-40 [@media(pointer:coarse)]:h-[44px]">
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), unit: "days", value: "", rate: "" }])}>
        <Plus size={13} aria-hidden />단계 추가
      </Button>
    </div>
  );
}
