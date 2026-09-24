/**
 * 스타일북 카테고리 — 기존 STYLE_CATALOG[].cat 값.
 * UI 에서 카테고리별 색상·아이콘이 적용된다.
 */
export type StyleCategory = "수트" | "재킷" | "팬츠" | "코트" | "조끼";

export interface Style {
  id: string;          // 'STY-001'
  name: string;        // '싱글 2버튼 수트'
  cat: StyleCategory;
  fabric_m: number;    // 필요 원단 미터
  desc: string;
  tags: string[];
  base: number;        // 기본 단가 (원)
}
