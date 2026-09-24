/**
 * Supabase UPDATE/DELETE 영향행 판정 — 단일 출처.
 *
 * PostgREST는 RLS가 막은 UPDATE/DELETE를 오류가 아니라 "0행 200"으로 돌려준다.
 * `const { error } = await sb...update(...)`처럼 error만 검사하면 권한이 없어 아무것도
 * 안 바뀐 요청이 성공으로 보고된다("화면에서만 됐고 새로고침하면 되살아난다").
 * 그래서 변이 뒤에 `.select()`를 붙여 실제 영향행을 받고, 0행이면 실패로 돌려준다.
 *
 * 이 함수는 "영향행이 있었나"만 판정한다. 메시지 변환은 도메인마다 결과 타입·문구가
 * 다르므로 호출부(각 도메인의 pgError)가 한다:
 *   const r = await mustAffect(sb.schema("crm").from("t").update(p).eq("id", id));
 *   if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : NO_ROWS_MESSAGE };
 *
 * 0행이 정상인 멱등 변이는 호출부 문장 안에 `// affected-ok: <이유>` 주석을 남긴다 —
 * scripts/verify-mutation-affected.mjs 가 mustAffect도 그 주석도 없는 변이를 잡는다.
 *
 * INSERT/UPSERT는 대상이 아니다: RLS WITH CHECK 위반과 ON CONFLICT DO UPDATE의 USING 위반은
 * Postgres가 42501 오류로 던지므로 error 검사만으로 잡힌다.
 */
import type { PostgrestError } from "@supabase/supabase-js";

type Mutation<Row> = {
  select(columns?: string): PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>;
};

/** 0행일 때 기본 문구. 도메인 문구가 더 정확하면 호출부가 덮어쓴다. */
export const NO_ROWS_MESSAGE = "권한이 없거나 이미 처리된 항목입니다.";

/** error === null 이면 오류 없이 0행(권한 없음·이미 처리됨·대상 없음). */
export type AffectResult<Row> = { ok: true; rows: Row[] } | { ok: false; error: PostgrestError | null };

export async function mustAffect<Row = { id: string }>(
  q: Mutation<Row>,
  columns = "id"
): Promise<AffectResult<Row>> {
  const { data, error } = await q.select(columns);
  if (error) return { ok: false, error };
  if (!data || data.length === 0) return { ok: false, error: null };
  return { ok: true, rows: data };
}
