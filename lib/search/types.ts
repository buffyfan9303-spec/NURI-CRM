/** ⌘K 전역 검색 결과 형태 — 서버 액션(actions.ts)과 셸 검색창(components/shell/CommandPalette.tsx)이 공유한다. */
export interface SearchHit {
  id: string;
  title: string;
  /** 상태·날짜 등 보조 문구. 금액·전화번호는 절대 넣지 않는다(0025 마스킹 뷰 원칙). */
  subtitle?: string;
  href: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  hits: SearchHit[];
}

export type SearchResult = { ok: true; groups: SearchGroup[] } | { ok: false; message: string };
