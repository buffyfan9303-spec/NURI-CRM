/**
 * 공장 도메인 타입·상수 — next/headers를 쓰지 않는 클라이언트 세이프 모듈.
 *
 * lib/domain/factory.ts(getServerSupabase 사용, 서버 전용)와 분리한다 — rental.ts/rental-types.ts
 * 관례와 동일. "use client" 컴포넌트가 FACTORY_PROCESS_STAGES 같은 상수를 값으로 import하면서
 * factory.ts를 직접 import하면 next/headers가 클라이언트 번들에 끌려들어가 빌드가 깨진다.
 */
import type { OptionValue } from "./factory-options";

export type ReadResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type FactoryOrderType = "suit" | "shirt" | "shoe";
export type FactoryOrderStatus = "접수" | "진행중" | "완료" | "취소";
export type FactoryProcessStage = "작지" | "재단" | "봉제" | "가봉" | "외주" | "검수" | "출고";
export type FactoryProcessStatus = "todo" | "doing" | "done" | "hold" | "skip";

export const FACTORY_PROCESS_STAGES: FactoryProcessStage[] = [
  "작지", "재단", "봉제", "가봉", "외주", "검수", "출고",
];

export interface FactoryOrderRow {
  id: string;
  businessId: string;
  orderNo: string;
  customerId: string | null;
  customerName: string | null;
  type: FactoryOrderType;
  status: FactoryOrderStatus;
  orderDate: string;
  fittingDate: string | null;
  dueDate: string | null;
  deliveredDate: string | null;
  options: Record<string, OptionValue>;
  qty: Record<string, number>;
  supply: number;
  vat: number;
  total: number;
  assignedTo: string | null;
  memo: string | null;
  createdAt: string;
}

export interface FittingLogRow {
  id: string;
  orderId: string;
  at: string;
  notes: string | null;
  photoPaths: string[];
}

export interface FactoryProcessRow {
  id: string;
  orderId: string;
  stage: FactoryProcessStage;
  plannedMinutes: number | null;
  actualMinutes: number | null;
  assignee: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: FactoryProcessStatus;
}

export interface MaterialOption {
  id: string;
  kind: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  vendor: string | null;
  /**
   * 자재 색상·무늬 메타. 0019_material_assets.sql 로 crm.materials 에 실제 컬럼이 생겼고
   * v_materials(비민감, view cap)에 노출된다 — 이제 진짜 값이 들어온다.
   */
  colorHex: string | null;
  /**
   * ⚠ DB CHECK 는 solid/stripe/check 만 허용한다(0019). "herringbone" 은 **앱이 그릴 줄은 알지만
   *   DB 가 저장하지 못하는** 상태다(lib/garment/fabric.ts 에 렌더 분기가 있다).
   *   근거 자료가 생기면 CHECK 를 넓히는 마이그레이션으로 열면 되고, 그 전까지는 절대 오지 않는다.
   *   렌더 분기를 지우지 않는 이유: 지우면 나중에 다시 만들어야 하고, 지금 해를 끼치지 않는다.
   */
  patternKind: "solid" | "stripe" | "check" | "herringbone" | null;
  repeatMm: { w: number; h: number } | null;
  /** 반복 치수가 실측됐는가 = repeat_w_mm·repeat_h_mm 이 둘 다 있는가(별도 컬럼 없음, 파생값). */
  repeatCalibrated: boolean;
  /** Storage 경로(0008 규칙: `{businessId}/materials/{id}/…`). URL 이 아니다. */
  swatchPath: string | null;
  texturePath: string | null;
  /**
   * 서명 URL. **아직 항상 null 이다** — 경로를 URL 로 바꾸는 코드가 앱에 없다(`.storage.` 호출 0건 실측).
   * 그래서 미리보기는 색·무늬로 그리고 "원단 사진 미등록" 을 정직하게 표시한다.
   * 경로가 있는데 URL 이 없다고 사진이 있는 척하지 않는다.
   */
  imageUrl: string | null;
  imageVersion: string | null;
}

/** 공정 칸반 보드 — 진행 중(접수/진행중)인 주문의 공정 행 전부 + 주문 요약. */
export interface ProcessBoardRow extends FactoryProcessRow {
  orderNo: string;
  customerName: string | null;
  dueDate: string | null;
  orderStatus: FactoryOrderStatus;
}

export interface FactoryTodaySummary {
  fittingsToday: { orderId: string; orderNo: string; customerName: string | null }[];
  dueThisWeek: { orderId: string; orderNo: string; customerName: string | null; dueDate: string }[];
  delayedProcesses: {
    orderId: string;
    orderNo: string;
    stage: FactoryProcessStage;
    startedAt: string;
    plannedMinutes: number;
    elapsedMinutes: number;
  }[];
  lowStockMaterials: MaterialOption[];
  completedThisMonth: { count: number; totalSupply: number };
}
