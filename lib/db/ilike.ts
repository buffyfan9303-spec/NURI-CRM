/**
 * PostgREST `.or("col.ilike.%needle%")` 에 넣는 검색어 정리 — 단일 출처.
 *
 *  - `% _ \` 는 ilike 와일드카드라 이스케이프한다(lib/domain/factory.ts listFactoryOrders 와 같은 방식).
 *  - `, ( )` 는 PostgREST or-필터의 구분자라 검색어에 남기면 필터 문법이 깨진다(500 또는 전체 노출).
 *    이름·전화 검색에 의미 없는 문자이므로 제거한다.
 */
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%…%` 패턴. 빈 문자열이면 null — 호출부가 필터를 붙이지 않게. */
export function ilikePattern(needle: string | undefined | null): string | null {
  const cleaned = (needle ?? "").replace(/[,()"]/g, "").trim();
  if (!cleaned) return null;
  return `%${escapeIlike(cleaned)}%`;
}
