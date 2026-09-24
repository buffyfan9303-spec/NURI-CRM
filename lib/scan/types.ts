/**
 * 스캔 도메인 공유 타입. 서버 계약은 ../../../supabase/migrations/0014_scan.sql 이다.
 *
 * crm.resolve_scan / crm.stage_scan_batch 가 돌려주는 kind 는 여기 ScanKind 와 1:1이다.
 * "not_found"는 오류가 아니라 정상적인 조회 결과(§H·계약 §5-5)이므로 별도 kind로 유지한다.
 */

export const SCAN_KINDS = [
  "rental_unit",
  "us_product",
  "material",
  "factory_order",
  "text",
  "not_found",
] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

export interface ResolvedScan {
  kind: ScanKind;
  id: string | null;
  label: string | null;
  status: string | null;
  extra: Record<string, unknown>;
}

/** crm.stage_scan_batch 의 반환값 — ResolvedScan + staged 플래그. */
export interface StagedScan extends ResolvedScan {
  staged?: boolean;
  /** 서버가 모드에 맞지 않아 담지 않은 경우(CP-230): "mode_mismatch". */
  rejected?: "mode_mismatch";
}

/** commitScanBatch 가 모드별로 돌려주는 후속 정보(CP-230). 재고·금액은 바뀌지 않는다 — 실사 수량 기록만 예외. */
export interface ScanCommitHandoff {
  /** unmanned_audit: 진행중 실사에 counted_qty 로 기록된 라인 수. 실사가 없으면 stockTakeId=null. */
  stockTakeId?: string | null;
  countedLines?: number;
  /** rental_checkout/return: 스캔 개체가 속한 예약과 항목 — 예약 상세로 넘겨 기존 출고/반납 RPC 로 확정한다. */
  reservations?: { reservationId: string; itemIds: string[]; unitIds: string[] }[];
}

/** crm.scan_batch_items 1행. */
export interface ScanBatchItem {
  id: string;
  kind: Exclude<ScanKind, "text" | "not_found">;
  targetId: string;
  label: string | null;
  qty: number;
  note: string | null;
  addedAt: string;
}

/** 담긴 항목이 현재 상태와 어긋날 때(이미 반납됨/비활성 등) 붙이는 경고. 서버 판정을 대체하지 않는다 — 표시용 힌트일 뿐. */
export interface ScanWarning {
  itemId: string;
  message: string;
}

/** 스캔 화면이 지원하는 업무 모드. 업종별로 다른 부분집합만 노출한다. */
export const SCAN_MODES = [
  "rental_checkout",
  "rental_return",
  "unmanned_audit",
  "factory_lookup",
  "generic",
] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

export const SCAN_MODE_LABEL: Record<ScanMode, string> = {
  rental_checkout: "출고 대조",
  rental_return: "반납 확인",
  unmanned_audit: "재고 실사",
  factory_lookup: "공정 조회",
  generic: "코드 조회",
};

export const KIND_LABEL: Record<ScanKind, string> = {
  rental_unit: "렌탈 개체",
  us_product: "무인매장 상품",
  material: "자재",
  factory_order: "공장 주문",
  text: "텍스트",
  not_found: "없는 코드",
};
