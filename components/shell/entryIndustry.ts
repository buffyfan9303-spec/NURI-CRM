/**
 * 로그인 화면의 업종 선택은 "진입 의도"일 뿐이다(계약 §1).
 * /select 에서 그 업종의 사업장을 상단에 정렬하는 용도로만 쓰고,
 * 세션스토리지에 담되 권한 판정에는 절대 쓰지 않는다.
 */
export const ENTRY_INDUSTRY_KEY = "nuri_crm_entry_industry";

export function readEntryIndustryHint(): string | null {
  try {
    return window.sessionStorage.getItem(ENTRY_INDUSTRY_KEY);
  } catch {
    return null;
  }
}
