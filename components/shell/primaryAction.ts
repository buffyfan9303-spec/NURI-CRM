/**
 * 상단바 우측 주요 버튼(§4.2) — 업종별 실제 업무의 첫 동작 하나만 연결한다.
 *
 * navKey는 lib/industry/config.ts(수정 금지)의 실제 nav 항목 key와 맞춰야 한다.
 * WorkspaceShell은 이 navKey가 서버가 이미 권한으로 걸러 보낸 `nav` 목록에
 * 있을 때만 버튼을 그린다 — 없는 메뉴로 링크하거나 권한 없는 사용자에게
 * 보여주지 않는다. 새 페이지/모달을 만들지 않고 해당 업무 목록 화면으로
 * 이동시킨다(그 화면의 실제 생성 동작은 각 화면 소유자 몫).
 */
import type { Industry } from "@/lib/industry/config";

export interface PrimaryAction {
  label: string;
  navKey: string;
  /** navKey 메뉴의 path와 다른 하위 경로로 바로 보내야 할 때만 지정(예: 목록이 아니라 등록 폼). */
  subPath?: string;
}

export const PRIMARY_ACTION: Record<Industry, PrimaryAction> = {
  // 결함 CLICK-PATH-108: 예전엔 목록 화면(orders)으로만 갔다 — 실제 "새 주문" 동작인
  // 등록 폼으로 바로 이동시킨다. write 권한 없는 사용자에게는 WorkspaceShell이 숨긴다.
  factory: { label: "새 주문", navKey: "orders", subPath: "orders/new" },
  rental: { label: "새 예약", navKey: "reservations", subPath: "reservations/new" },
  unmanned: { label: "재고 등록", navKey: "stock" },
  salon: { label: "새 예약", navKey: "calendar" },
  academy: { label: "수강 등록", navKey: "classes" },
};
