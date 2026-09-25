/**
 * 사이드바 메뉴 그룹 매핑 — §5.2: "오늘 업무 / 업종 핵심 업무 / 운영 관리 / 설정".
 *
 * lib/industry/config.ts 의 nav는 수정 금지 파일이라 그대로 둔다. 이 파일은
 * nav 항목의 `key` 문자열만 보고 어느 그룹에 속하는지 결정하는 순수 매핑이다.
 * 새 업종/새 nav key가 추가돼도 여기 없으면 자동으로 "업종 핵심 업무"에 떨어진다
 * (기본값이 안전한 쪽으로 무너지게).
 */

export type NavGroupKey = "today" | "core" | "ops" | "settings";

export const NAV_GROUP_ORDER: NavGroupKey[] = ["today", "core", "ops", "settings"];

export const NAV_GROUP_LABEL: Record<NavGroupKey, string> = {
  today: "오늘 업무",
  core: "업종 핵심 업무",
  ops: "운영 관리",
  settings: "설정",
};

/** 명시적으로 분류한 키만 여기 둔다. 나머지는 전부 "core"로 떨어진다. */
const EXPLICIT_GROUP: Partial<Record<string, NavGroupKey>> = {
  // 오늘 진입해서 바로 보는 화면 — 요약 홈 + 일정.
  dash: "today",
  calendar: "today",

  // 돈 관련 + 인력 근태 — 운영 관리.
  settlement: "ops",
  receivables: "ops",
  sales: "ops",
  tuition: "ops",
  "staff-shift": "ops",

  // 권한/직원 관리 — 설정.
  staff: "settings",
};

export function navGroupFor(key: string): NavGroupKey {
  return EXPLICIT_GROUP[key] ?? "core";
}
