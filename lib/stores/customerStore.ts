/**
 * 고객 + 주문 통합 스토어.
 *
 * 기존 코드 매핑:
 *   - CS / CL                       → customers
 *   - ORDER_STATE                   → editing*
 *   - registerCustomer / saveCustEdit / delOrder → add / updateCustomer / removeOrder
 *   - editOrder / saveOrder         → updateOrder / addOrder
 *   - 칸반 상태 전이 (M2 진입점)    → updateOrderStatus
 *
 * 본 스토어는 *순수* 합니다 — 재고 차감·토스트 등 부수효과는
 * Phase 1.7 의 useOrderSubmit 훅에서 fabricStore/toastStore 와 조합해 처리합니다.
 *
 * persist 미사용 — 새로고침 시 시드 13명으로 리셋 (원본 동일).
 */
import { create } from "zustand";
import type { Customer } from "@/types/customer";
import type { Order, OrderStatus } from "@/types/order";
import { SEED_CUSTOMERS } from "@/lib/data/seed";

interface CustomerState {
  customers: Customer[];

  /* 편집 상태 (구 ORDER_STATE) */
  editingOrderNo: string | null;
  editingCustomerName: string | null;
  startEditOrder: (orderNo: string, customerName: string) => void;
  clearEditOrder: () => void;

  /* Customer CRUD */
  addCustomer: (c: Customer) => void;
  updateCustomer: (name: string, patch: Partial<Customer>) => void;
  removeCustomer: (name: string) => void;

  /* Order CRUD (nested) */
  addOrder: (customerName: string, order: Order) => void;
  updateOrder: (orderNo: string, patch: Partial<Order>) => void;
  removeOrder: (orderNo: string) => void;

  /* 주문 상태 전이 — M2 QR 스캔 트랜잭션 진입점 */
  updateOrderStatus: (
    orderNo: string,
    next: OrderStatus
  ) => { prev: OrderStatus; next: OrderStatus; customer: Customer; order: Order } | null;

  /* selectors */
  getByName: (name: string) => Customer | undefined;
  findOrder: (orderNo: string) => { customer: Customer; order: Order } | null;
  /** 모든 주문 평탄화 (회계·배송 뷰용) */
  flattenOrders: () => Array<{ customer: Customer; order: Order }>;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: SEED_CUSTOMERS,
  editingOrderNo: null,
  editingCustomerName: null,

  startEditOrder: (orderNo, customerName) =>
    set({ editingOrderNo: orderNo, editingCustomerName: customerName }),

  clearEditOrder: () =>
    set({ editingOrderNo: null, editingCustomerName: null }),

  /* ── Customer ── */
  addCustomer: (c) => set((s) => ({ customers: [...s.customers, c] })),

  updateCustomer: (name, patch) =>
    set((s) => ({
      customers: s.customers.map((c) =>
        c.name === name ? { ...c, ...patch } : c
      ),
    })),

  removeCustomer: (name) =>
    set((s) => ({ customers: s.customers.filter((c) => c.name !== name) })),

  /* ── Order ── */
  addOrder: (customerName, order) =>
    set((s) => ({
      customers: s.customers.map((c) =>
        c.name === customerName
          ? { ...c, orders: [...c.orders, order] }
          : c
      ),
    })),

  updateOrder: (orderNo, patch) =>
    set((s) => ({
      customers: s.customers.map((c) => ({
        ...c,
        orders: c.orders.map((o) =>
          o.no === orderNo ? { ...o, ...patch } : o
        ),
      })),
    })),

  removeOrder: (orderNo) =>
    set((s) => ({
      customers: s.customers.map((c) => ({
        ...c,
        orders: c.orders.filter((o) => o.no !== orderNo),
      })),
    })),

  updateOrderStatus: (orderNo, next) => {
    const found = get().findOrder(orderNo);
    if (!found) return null;
    const prev = found.order.st;
    if (prev === next) {
      return { prev, next, customer: found.customer, order: found.order };
    }
    const updatedOrder: Order = { ...found.order, st: next };
    set((s) => ({
      customers: s.customers.map((c) =>
        c.name === found.customer.name
          ? {
              ...c,
              orders: c.orders.map((o) =>
                o.no === orderNo ? updatedOrder : o
              ),
            }
          : c
      ),
    }));
    return { prev, next, customer: found.customer, order: updatedOrder };
  },

  /* ── selectors ── */
  getByName: (name) => get().customers.find((c) => c.name === name),

  findOrder: (orderNo) => {
    for (const c of get().customers) {
      const o = c.orders.find((x) => x.no === orderNo);
      if (o) return { customer: c, order: o };
    }
    return null;
  },

  flattenOrders: () => {
    const rows: Array<{ customer: Customer; order: Order }> = [];
    for (const c of get().customers) {
      for (const o of c.orders) {
        rows.push({ customer: c, order: o });
      }
    }
    return rows;
  },
}));

/* DEV-only: expose store on window for browser-console debugging.
   타입 안전성을 위해 dev 환경에서만 노출. 프로덕션 빌드에서는 제거됨. */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__customerStore = useCustomerStore;
}

/**
 * 다음 주문번호 생성 — 'ORD-2026-{NNN}'.
 * 기존 saveOrder() 의 padStart 패턴과 1:1.
 */
export function nextOrderNo(): string {
  const total = useCustomerStore
    .getState()
    .customers.reduce((sum, c) => sum + c.orders.length, 0);
  return `ORD-2026-${String(total + 1).padStart(3, "0")}`;
}
