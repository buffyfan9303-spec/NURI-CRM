/** 호실별 따로 넣는 금액(감면·일회성) 화면의 순수 함수. 서버(upsertDirectCharge)도 같은 규칙을 다시 검사한다. */

const MAX_ABS = 9_999_999_999; // 100억 미만 — 건물 한 호실의 한 달 금액으로 충분하고 bigint·부동소수 모두 안전

export type SignedWon = { ok: true; value: number } | { ok: false; message: string };

/** "-10,000" · "−10000"(유니코드 마이너스) · "+5,000" → 정수 원. 0·소수점·글자는 거절한다. */
export function parseSignedWon(text: string): SignedWon {
  const t = text.trim().replace(/[−‒–－]/g, "-").replace(/[,\s원]/g, "");
  if (t === "") return { ok: false, message: "금액을 적으세요." };
  if (!/^[+-]?\d+$/.test(t)) return { ok: false, message: "숫자만 적으세요. 감면이면 앞에 −를 붙이세요(소수점 없이)." };
  const n = Number(t);
  if (n === 0) return { ok: false, message: "0원은 넣을 수 없습니다." };
  if (Math.abs(n) > MAX_ABS) return { ok: false, message: "금액이 너무 큽니다." };
  return { ok: true, value: n };
}

/** 잠긴 달에 직접 입력을 막는 안내 문장(서버 문장을 그대로 노출하지 않는다). */
export const DIRECT_LOCKED_NOTE = "이 달은 관리비가 이미 확정돼 호실별 금액을 바꿀 수 없습니다. 고칠 일이 있으면 '관리비 계산·확정' 화면의 '금액 정정'으로 하세요.";

/** 서버 오류 힌트 → 쉬운 말(없으면 서버 문장 그대로). */
export function directErrorText(hint: string | undefined, message: string): string {
  return hint === "period_locked" ? DIRECT_LOCKED_NOTE : message;
}
