/**
 * 공장 화면 공용 라벨 — 공정 상태 영문 코드와 담당자 uuid 를 사람이 읽는 글로 바꾼다(F15).
 * 칸반·주문 상세·대시보드가 같은 표를 쓴다(한 곳만 고치면 전부 바뀐다).
 */
import type { FactoryProcessStatus } from "@/lib/domain/factory-types";
import type { MemberOption } from "@/lib/domain/calendar-shared";

export const PROCESS_STATUS_LABEL: Record<FactoryProcessStatus, string> = {
  todo: "예정",
  doing: "진행중",
  done: "완료",
  hold: "보류",
  skip: "건너뜀",
};

// 역할 한국어는 lib/auth/roles.ts 단일 출처(셸·사업장 선택과 같은 말).
import { ROLE_LABEL } from "@/lib/auth/roles";
export { ROLE_LABEL };

/** 표시이름 → (없으면) 역할 한국어 + 이메일 앞부분. uuid 조각은 절대 보여 주지 않는다. */
export function memberLabel(m: MemberOption): string {
  const name = m.displayName?.trim();
  if (name && !name.includes("@")) return name;
  const localPart = name?.split("@")[0];
  const role = ROLE_LABEL[m.role] ?? m.role;
  return localPart ? `${localPart} (${role})` : role;
}

/** 담당자 uuid → 라벨. 목록에 없는(탈퇴 등) 사용자는 "이전 담당자"로 표시한다. */
export function assigneeLabel(members: MemberOption[], userId: string | null | undefined): string | null {
  if (!userId) return null;
  const m = members.find((x) => x.userId === userId);
  return m ? memberLabel(m) : "이전 담당자";
}

export const TYPE_LABEL: Record<string, string> = { suit: "정장", shirt: "셔츠", shoe: "구두" };

/** 셔츠·구두 주문 수량 키(F26) — 예전 주문은 's'(수트) 키로 저장돼 있어 그것도 읽는다. */
export const SIMPLE_QTY_KEY: Record<string, string> = { shirt: "shirt", shoe: "shoe" };

export function simpleOrderQty(type: string, qty: Record<string, number>): number {
  const key = SIMPLE_QTY_KEY[type];
  const v = key ? (qty[key] ?? qty.s) : qty.s;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1;
}
