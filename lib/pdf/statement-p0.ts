/**
 * 관리비 명세서 국내 실무·법 기준 보강(2026-09-30 조사 D의 P0 7건)의 순수 함수 모음. DB·서버 호출 없음.
 * 금액은 서버가 준 값만 옮겨 담고 새로 계산하지 않는다(분류별 소계처럼 화면에 보이는 줄의 합은 예외).
 * 14항목 이름·순서 근거: 상가건물 임대차보호법 시행령 제8조의 14개 호(2026-05-12 시행, 이현 해설 블로그 기준 — 별표1 원문은 미확인).
 */
import type { LateFeeCalc, PartyRow, ReceivableRow, StdCategory, TaxTreatment, UnitRow, UnitUseKind } from "@/lib/domain/building-types";

export const won = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

/** 우리 표준 분류(STD_CATEGORIES) → 시행령 14개 호. 1:1 이다(hvac = 6호 냉난방비 및 급탕비). rent·other 는 14항목 밖. */
export const LAW14: readonly { no: number; cat: StdCategory; label: string }[] = [
  { no: 1, cat: "general", label: "일반관리비" }, { no: 2, cat: "cleaning", label: "청소비" }, { no: 3, cat: "security", label: "경비비" },
  { no: 4, cat: "disinfection", label: "소독비" }, { no: 5, cat: "elevator", label: "승강기유지비" }, { no: 6, cat: "hvac", label: "냉난방비 및 급탕비" },
  { no: 7, cat: "repair", label: "수선유지비" }, { no: 8, cat: "mgmt_fee", label: "위탁관리수수료" }, { no: 9, cat: "electric", label: "전기료" },
  { no: 10, cat: "water", label: "수도료" }, { no: 11, cat: "gas", label: "가스사용료" }, { no: 12, cat: "septic", label: "정화조 오물 처리 수수료" },
  { no: 13, cat: "waste", label: "폐기물 처리 수수료" }, { no: 14, cat: "insurance", label: "건물 전체 보험료" },
];
/** 월 관리비가 이 금액 미만이면 항목별 금액을 빼고 포함된 항목만 알려도 된다(시행령 제8조). */
export const LAW14_MIN_TOTAL = 100_000;

export interface Law14Row { no: number; label: string; amount: number; included: boolean }
export interface Law14Table {
  rows: Law14Row[];
  /** 14항목 밖 줄(기타·임대료). 있을 때만. */
  outside: { kind: "other" | "rent"; label: string; amount: number }[];
  /** 임대료를 뺀 월 관리비(이 줄들의 합). */
  monthlyFee: number;
  /** true 면 금액 칸 대신 "포함" 표시만 한다(월 관리비 10만 원 미만). */
  amountsHidden: boolean;
}
export function law14Table(lines: { std_category: StdCategory; amount: number }[]): Law14Table {
  const by = new Map<StdCategory, { sum: number; n: number }>();
  for (const l of lines) { const c = by.get(l.std_category) ?? { sum: 0, n: 0 }; c.sum += l.amount; c.n += 1; by.set(l.std_category, c); }
  const rows = LAW14.map((x) => ({ no: x.no, label: x.label, amount: by.get(x.cat)?.sum ?? 0, included: (by.get(x.cat)?.n ?? 0) > 0 }));
  const outside: Law14Table["outside"] = [];
  if (by.has("other")) outside.push({ kind: "other", label: "그 밖의 항목(14항목에 없음)", amount: by.get("other")!.sum });
  if (by.has("rent")) outside.push({ kind: "rent", label: "임대료(관리비 아님)", amount: by.get("rent")!.sum });
  const monthlyFee = rows.reduce((a, r) => a + r.amount, 0) + (by.get("other")?.sum ?? 0);
  return { rows, outside, monthlyFee, amountsHidden: monthlyFee > 0 && monthlyFee < LAW14_MIN_TOTAL };
}

export const TAX_LABEL: Record<TaxTreatment, string> = { taxable: "과세", exempt: "면세", non_taxable: "과세 대상 아님", pass_through: "대납(실비)" };
export const USE_LABEL: Record<UnitUseKind, string> = { retail: "상가", office: "사무실", residential: "주거", parking: "주차", common: "공용", other: "기타" };

/** 관리주체(세금계산서 보내는 곳) 머리 줄. 값이 없는 조각은 줄에서 뺀다. 전부 없으면 빈 배열. */
export function supplierLines(p: Pick<PartyRow, "name" | "biz_reg_no" | "ceo_name" | "address"> | null | undefined): string[] {
  if (!p) return [];
  const digits = (p.biz_reg_no ?? "").replace(/\D/g, "");
  const bizNo = digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : (p.biz_reg_no ?? "").trim();
  const l1 = [p.name && `관리주체 ${p.name}`, bizNo && `사업자번호 ${bizNo}`, p.ceo_name && `대표 ${p.ceo_name}`].filter(Boolean).join(" · ");
  return [l1, p.address ? `주소 ${p.address}` : ""].filter(Boolean);
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
/** 호실 정보 한 줄: 동·층·용도·전용/공용 면적. 비어 있거나 0 인 값은 뺀다. */
export function unitInfoLine(u: Pick<UnitRow, "dong" | "floor" | "use_kind" | "area_exclusive" | "area_common"> | null | undefined): string {
  if (!u) return "";
  const dong = u.dong?.trim(), floor = u.floor?.trim();
  return [
    dong && (/동$/.test(dong) ? dong : `${dong}동`),
    floor && (/[0-9]$/.test(floor) ? `${floor}층` : floor),
    USE_LABEL[u.use_kind],
    u.area_exclusive > 0 && `전용 ${num(u.area_exclusive)}㎡`,
    u.area_common > 0 && `공용 ${num(u.area_common)}㎡`,
  ].filter(Boolean).join(" · ");
}

export interface PriorUnpaidRow { period: string; label: string; dueDate: string | null; amount: number }
const monthLabel = (p: string) => `${Number(p.slice(0, 4))}년 ${Number(p.slice(5, 7))}월분`;
const KIND_LABEL: Record<ReceivableRow["kind"], string> = { bill: "관리비", late_fee: "연체료", correction: "정정 금액" };
/**
 * 미납액을 달별로 나눈다. 서버가 "전월까지 미납액"(prior_unpaid)을 만들 때 쓴 조건과 같다:
 * 열린 미수금 중 이 청구월 이전, 이 청구를 받는 분(bill_to) 것, 남은 금액 = 금액 − 수납액 − 선납 반영.
 */
export function priorUnpaidRows(bill: { period: string; bill_to_party_id: string | null }, recs: ReceivableRow[]): { rows: PriorUnpaidRow[]; sum: number } {
  const rows = recs
    .filter((r) => r.status === "open" && r.period < bill.period && (r.party_id ?? null) === (bill.bill_to_party_id ?? null))
    .map((r) => ({ r, amount: (r.amount ?? 0) - (r.paid ?? 0) - (r.credit_applied ?? 0) }))
    .filter((x) => x.amount !== 0)
    .sort((a, b) => a.r.period.localeCompare(b.r.period) || (a.r.due_date ?? "").localeCompare(b.r.due_date ?? "") || a.r.kind.localeCompare(b.r.kind))
    .map((x) => ({ period: x.r.period, label: `${monthLabel(x.r.period)} ${KIND_LABEL[x.r.kind]}`, dueDate: x.r.due_date, amount: x.amount }));
  return { rows, sum: rows.reduce((a, r) => a + r.amount, 0) };
}

const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const RATE_UNIT: Record<string, string> = { annual: "연", monthly: "월", daily: "하루" };
const METHOD_LABEL: Record<string, string> = { simple: "단리", compound_monthly: "월 복리" };
/** 연체료 산식 한 줄(기준액·이율·기간·일수·금액). trace.late_fee.items 에 있는 값만 쓴다. 줄이 많으면 앞 max 건만 보이고 나머지는 건수·합계로. */
export function lateFeeFormulaLines(items: LateFeeCalc[] | null | undefined, max = 3): { lines: string[]; more: { count: number; amount: number } | null } {
  const list = (items ?? []).filter((i) => i.amount > 0);
  const line = (i: LateFeeCalc) => {
    const parts = [
      `${i.period ? `${monthLabel(i.period)} ` : ""}미납액${i.principal != null ? ` ${won(i.principal)}` : ""}`,
      i.rate != null ? `${RATE_UNIT[i.unit ?? ""] ?? ""} ${num(i.rate)}%${i.method ? `(${METHOD_LABEL[i.method] ?? i.method})` : ""}`.trim() : null,
      i.from && i.to ? `${md(i.from)}~${md(i.to)} ${i.days}일` : `${i.days}일`,
    ].filter(Boolean);
    const extra = [i.grace_days ? `납기 뒤 ${i.grace_days}일은 유예` : null, i.cap_pct != null ? `최대 ${num(i.cap_pct)}%` : null].filter(Boolean);
    return `${parts.join(" × ")} = ${won(i.amount)}${extra.length ? ` (${extra.join(", ")})` : ""}`;
  };
  const shown = list.slice(0, max), rest = list.slice(max);
  return { lines: shown.map(line), more: rest.length ? { count: rest.length, amount: rest.reduce((a, i) => a + i.amount, 0) } : null };
}

/** 이의·문의 안내(항상 표시). office 는 명세서에 이미 나가던 관리사무소 연락처 문자열(새 개인정보 아님). */
export function disputeNotice(office: string | null): { text: string; office: string | null } {
  return {
    text: "금액이 다르거나 궁금한 점이 있으면 관리사무소에 알려 주세요. '입주자 문의·이의'로 접수하고 답을 드립니다. 확정된 명세서는 덮어쓰지 않고, 정정한 명세서를 새로 드립니다.",
    office: office && office.trim() ? office : null,
  };
}

/**
 * A4 한 장에 맞추기 위한 표 글자 단계. 세로로 차지하는 줄 수를 어림해 0(보통)·1(줄임)·2(더 줄임)를 돌려준다.
 * 2 로도 넘치면 2쪽으로 흐른다(허용).
 */
export function statementDensity(x: { lines: number; law14: boolean; prior: number; late: number; meters: number; notice: boolean; chart: boolean; stub: boolean; supplier: number }): 0 | 1 | 2 {
  const rows = x.lines + (x.law14 ? 9 : 0) + (x.prior ? x.prior + 2 : 0) + (x.late ? x.late + 1 : 0) + (x.meters ? x.meters + 2 : 0) + (x.notice ? 3 : 0) + (x.chart ? 5 : 0) + (x.stub ? 3 : 0) + x.supplier;
  return rows <= 12 ? 0 : rows <= 20 ? 1 : 2;
}
