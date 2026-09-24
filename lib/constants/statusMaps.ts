import type { OrderStatus, KanbanColumn } from "@/types/order";

/**
 * 상태 → 배지 클래스명 (대시보드·고객조회·디테일 패널에서 사용).
 * 기존 SM 그대로.
 */
export const STATUS_BADGE: Record<OrderStatus, string> = {
  배송완료: "b-ok",
  배송예정: "b-info",
  생산중: "b-warn",
  재단중: "b-warn",
  봉제중: "b-warn",
  검수중: "b-warn",
  원단대기: "b-err",
  주문접수: "b-info",
  원단발주: "b-err",
};

/**
 * 상태 → 캘린더 이벤트 태그 클래스명 (기존 TM).
 */
export const STATUS_EVENT_TAG: Record<OrderStatus, string> = {
  배송예정: "tg-del",
  배송완료: "tg-ok",
  주문접수: "tg-ord",
  생산중: "tg-prod",
  재단중: "tg-prod",
  원단대기: "tg-ord",
  봉제중: "tg-prod",
  검수중: "tg-prod",
  원단발주: "tg-ord",
};

/**
 * 주문 상태 → 칸반 컬럼 매핑 (기존 ST2COL).
 * 9개 상태가 6개 컬럼으로 그룹핑된다.
 */
export const STATUS_TO_COLUMN: Partial<Record<OrderStatus, KanbanColumn>> = {
  주문접수: "주문접수",
  원단대기: "원단발주",
  원단발주: "원단발주",
  재단중: "재단중",
  생산중: "봉제중",
  봉제중: "봉제중",
  검수중: "검수중",
  배송예정: "배송예정",
  // 배송완료는 칸반에 표시하지 않음
};
