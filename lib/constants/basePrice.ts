/**
 * 품목명 키워드 → 기본 단가 매핑 (기존 BASE_PRICE).
 * calculateTotalPrice() 가 ord-item 입력 문자열에서 키워드를 검색해 가격 산출.
 *
 * 관리자 설정에서 SYS_CONFIG 로 수트/재킷/팬츠/코트/조끼 가격을 덮어쓸 수 있다.
 */
export const BASE_PRICE_DEFAULTS: Record<string, number> = {
  "싱글 수트": 500000,
  "더블 수트": 580000,
  "수트": 500000,
  "쓰리피스": 650000,
  "스리피스": 650000,
  "재킷": 350000,
  "재켓": 350000,
  "자켓": 350000,
  "팬츠": 150000,
  "바지": 150000,
  "트라우저": 150000,
  "조끼": 120000,
  "베스트": 120000,
  "코트": 680000,
  "오버코트": 680000,
};

export const DEFAULT_FABRIC_M = 3;

/**
 * 관리자 설정 가격 키 — Phase 1.8 admin 뷰에서 사용.
 */
export interface SysConfig {
  base_single_suit: number;
  base_double_suit: number;
  base_three_piece: number;
  base_jacket: number;
  base_pants: number;
  base_coat: number;
  base_vest: number;
}

export const SYS_CONFIG_DEFAULTS: SysConfig = {
  base_single_suit: 500000,
  base_double_suit: 580000,
  base_three_piece: 650000,
  base_jacket: 350000,
  base_pants: 150000,
  base_coat: 680000,
  base_vest: 120000,
};
