/**
 * 사업자등록번호 형식·체크섬 — 순수 함수(클라이언트·서버 공용, 비밀 없음).
 * DB 가 권위다(crm.biz_reg_no_valid, 0030). 여기서는 같은 식을 미리 보여줄 뿐이다.
 * 국세청 검증: 앞 9자리 × 가중치(1,3,7,1,3,7,1,3,5) 합 + ⌊9번째×5/10⌋ → (10 − 합%10)%10 = 10번째.
 */
const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5] as const;

/** 숫자만 남긴다("124-81-00998" → "1248100998"). */
export function normalizeBizRegNo(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidBizRegNo(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * WEIGHTS[i];
  sum += Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

/** "1248100998" → "124-81-00998". 10자리가 아니면 그대로 돌려준다. */
export function formatBizRegNo(digits: string): string {
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : digits;
}
