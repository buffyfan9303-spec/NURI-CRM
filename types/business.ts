/**
 * 거래처 유형 — 기존 STATE.businesses[].type 와 1:1 대응.
 */
export type BusinessType = "retailer" | "factory" | "fabric_store";

export interface Business {
  id: string;             // 예: 'BIZ-004'
  name: string;           // 예: '성동봉제'
  type: BusinessType;
  approved: boolean;      // 관리자 승인 여부
}

/**
 * 공장·원단매장의 추가 정보 (기존 FACTORY_EXTRA, VENDOR_EXTRA).
 * Business 와 1:N 으로 보일 수 있으나, 시드 데이터에서는 businessId 키로 1:1 조회한다.
 */
export interface FactoryExtra {
  capa: string;   // '월 40벌'
  items: string;  // '수트·재킷·팬츠'
}

export interface VendorExtra {
  phone: string;
  addr: string;
  rep: string;     // 담당자명
  since: string;   // '2018.03'
  ytd: string;     // '₩45,200,000'
}

/**
 * 한국어 라벨 매핑 — UI 출력용.
 */
export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  retailer: "소매점",
  factory: "공장",
  fabric_store: "원단매장",
};
