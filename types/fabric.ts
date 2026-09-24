/**
 * 원단 재고 상태 — 기존 STATE.fabrics[].status 값.
 */
export type FabricStatus = "여유" | "부족" | "매진";

export interface Fabric {
  id: string;          // 'FAB-001'
  name: string;        // '울 100% 네이비'
  businessId: string;  // 'BIZ-007' (원단매장)
  qty: number;         // 미터 단위
  price: number;       // 단가 (원/m)
  color: string;       // '네이비'
  status: FabricStatus;
}
