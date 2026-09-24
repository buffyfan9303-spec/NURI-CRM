/**
 * 주문 생명주기 9단계 — 기존 ord-st <select> 옵션과 1:1.
 * 칸반 컬럼은 이를 6단계로 묶어 표시 (ST2COL 참조).
 */
export type OrderStatus =
  | "주문접수"
  | "원단대기"
  | "원단발주"
  | "재단중"
  | "봉제중"
  | "생산중"
  | "검수중"
  | "배송예정"
  | "배송완료";

export const ORDER_STATUSES: OrderStatus[] = [
  "주문접수",
  "원단대기",
  "원단발주",
  "재단중",
  "봉제중",
  "생산중",
  "검수중",
  "배송예정",
  "배송완료",
];

/**
 * 주문에 묶인 원단 1건.
 * 기존 saveOrder() 의 fabrics 배열 항목 그대로.
 */
export interface OrderFabric {
  fabricBizId: string;   // 'BIZ-007'
  fabricId: string;      // 'FAB-001' (공란 가능 — 업체만 지정)
  fabricName?: string;
  m: number;             // 사용 미터 (기본 3)
}

/**
 * 주문 1건 — 고객(name)에 종속.
 * 가격은 자동산출되지만 문자열로 보존 ('1,850,000' 형식).
 */
export interface Order {
  no: string;            // 'ORD-2026-001'
  item: string;          // '웨딩 수트 (상하의)'
  ord: string;           // '2026.05.01' (주문일)
  del: string;           // '2026.05.20' (배송예정일)
  fac: string;           // '성동봉제'
  st: OrderStatus;
  price: string;         // '1,850,000'
  fabrics?: OrderFabric[];
}

/**
 * 칸반 컬럼 키 (6개) — 기존 PROD_COLS.
 * '생산중' 상태는 봉제중 컬럼에, '원단대기' 는 원단발주 컬럼에 합쳐 표시.
 */
export type KanbanColumn =
  | "주문접수"
  | "원단발주"
  | "재단중"
  | "봉제중"
  | "검수중"
  | "배송예정";
