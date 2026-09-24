/**
 * 주문 상태 자연 진행 매핑.
 * QR 스캔 시 "다음 단계로 이동" 자동 제안에 사용.
 *
 * 사용자는 다른 상태로도 임의 전환 가능 — 다만 기본값을 next 로 둔다.
 */
import type { OrderStatus } from "@/types/order";

export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  주문접수: "원단대기",
  원단대기: "원단발주",
  원단발주: "재단중",
  재단중: "봉제중",
  봉제중: "검수중",
  생산중: "검수중",
  검수중: "배송예정",
  배송예정: "배송완료",
  배송완료: null,
};

/** 상태 → 사람이 읽는 짧은 설명. 스캐너에서 안내문에 사용. */
export const STATUS_DESCRIPTION: Record<OrderStatus, string> = {
  주문접수: "주문이 접수됨",
  원단대기: "원단 입고 대기",
  원단발주: "원단 발주 완료",
  재단중: "원단 재단 중",
  봉제중: "재봉 작업 중",
  생산중: "생산 진행 중",
  검수중: "최종 검수 중",
  배송예정: "출고 준비 완료",
  배송완료: "고객 인수 완료",
};
