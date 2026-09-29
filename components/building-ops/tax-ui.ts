/** 세금계산서 발행 화면의 순수 보조: 파일 개수, 상태 집계, 승인번호 형식 안내. 서버가 최종 검사한다(승인번호는 비어 있으면만 서버가 거부). */
import type { TaxIssueStatus } from "@/lib/domain/building-types";

export const FILE_ROWS = 100;
export const fileCount = (n: number) => (n <= 0 ? 0 : Math.ceil(n / FILE_ROWS));

export function tally(rows: { issue_status: TaxIssueStatus }[]): Record<TaxIssueStatus, number> {
  const out: Record<TaxIssueStatus, number> = { blocked: 0, ready: 0, file_generated: 0, issued: 0, failed: 0 };
  for (const r of rows) out[r.issue_status]++;
  return out;
}

/** 국세청 승인번호는 숫자 24자리(하이픈 표기 가능). 형식이 다르면 안내만 하고 막지는 않는다. */
export function approvalNoNote(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "승인번호를 입력하세요.";
  const digits = t.replace(/[-\s]/g, "");
  return /^\d{24}$/.test(digits) ? null : "국세청 승인번호는 보통 숫자 24자리입니다. 저장은 영문·숫자·하이픈 20~32자만 됩니다. 홈택스에 표시된 번호와 같은지 확인하세요.";
}
