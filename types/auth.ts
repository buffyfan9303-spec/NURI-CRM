/**
 * 사용자 역할 — 기존 NURI-CRM.html 의 CURRENT_USER.role 값과 1:1 대응.
 *   - admin       : 전체 권한
 *   - retailer    : 소매점 (고객·주문 CRUD, 가격 노출)
 *   - factory     : 공장 (이름/번호 마스킹, 수정 불가)
 *   - fabric_store: 원단매장 (자기 원단만 조회·수정)
 */
export type Role = "admin" | "retailer" | "factory" | "fabric_store";

export interface CurrentUser {
  role: Role;
  businessId: string | null;
  businessName: string;
}

/**
 * 권한 헬퍼 — 역할별 가능 동작을 한 곳에서 관리.
 * Phase 1.4 의 RoleGuard 컴포넌트에서 이 함수들을 호출한다.
 */
export const permissions = {
  canEditCustomer: (role: Role) => role === "admin" || role === "retailer",
  canDeleteOrder: (role: Role) => role === "admin" || role === "retailer",
  canPrintMTM: (role: Role) => role !== "factory",
  canAccessAdmin: (role: Role) => role === "admin",
  canAccessAccount: (role: Role) => role === "admin" || role === "retailer",
  canAccessFabVendor: (role: Role) => role === "admin" || role === "retailer",
  canAccessFabric: (role: Role) => role !== "retailer",
  shouldMaskPII: (role: Role) => role === "factory",
} as const;
