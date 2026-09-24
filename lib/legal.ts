/**
 * 약관·개인정보처리방침 공통 값.
 * 운영자(사업자) 정보는 사용자 확인 전이라 비워 둔다 — 없는 정보를 지어내지 않는다.
 * 확정되면 여기만 채우면 두 문서에 함께 반영된다.
 */
export const LEGAL = {
  effectiveDate: "2026년 9월 25일",
  serviceName: "NURI CRM",
  /** 상호·대표자·사업자등록번호·주소. null 이면 "등록 예정"으로 표시한다. */
  operator: null as null | { company: string; ceo: string; bizNo: string; address: string },
  /** 개인정보 보호책임자 연락처(이메일). null 이면 "등록 예정". */
  privacyContact: null as null | { name: string; email: string },
} as const;
