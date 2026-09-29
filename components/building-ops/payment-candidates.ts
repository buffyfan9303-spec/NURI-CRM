/** 미배정 입금 → 배정 후보 채권 추천. 표시용 제안이다: 실제 배정은 서버(bld_allocate_payment)가 잔액·건물·상태를 다시 검사한다. */
export interface OpenRec { id: string; unit_id: string; party_id: string | null; period: string; due_date: string | null; outstanding: number }
export type Cand<T extends OpenRec = OpenRec> = T & { score: number; why: string[] }

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s|\(주\)|주식회사|㈜/g, "").toLowerCase();

/** 점수: 같은 호실 4, 입금자명=입주자명 3, 잔액=입금 미배정액 2. 0점은 후보에서 뺀다. 오래된 납기 우선. */
export function candidatesFor<T extends OpenRec>(
  pay: { unit_id: string | null; payer_name: string | null; unallocated: number },
  recs: T[],
  partyName: (id: string | null) => string | null
): Cand<T>[] {
  const out: Cand<T>[] = [];
  for (const r of recs) {
    if (r.outstanding <= 0) continue;
    const why: string[] = []; let score = 0;
    if (pay.unit_id && r.unit_id === pay.unit_id) { score += 4; why.push("같은 호실"); }
    const pn = norm(pay.payer_name), tn = norm(partyName(r.party_id));
    if (pn && tn && (pn === tn || pn.includes(tn) || tn.includes(pn))) { score += 3; why.push("입금자명 일치"); }
    if (r.outstanding === pay.unallocated) { score += 2; why.push("금액 일치"); }
    if (score > 0) out.push({ ...r, score, why });
  }
  return out.sort((a, b) => b.score - a.score || (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 8);
}

/** 기본 배정액 = 미배정액과 채권 잔액 중 작은 값(부분납 지원). */
export const defaultAllocAmount = (unallocated: number, outstanding: number) => Math.max(0, Math.min(unallocated, outstanding));
