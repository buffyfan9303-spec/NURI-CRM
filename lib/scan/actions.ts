/**
 * 스캔 서버 액션. 전부 supabase/migrations/0014_scan.sql 의 RPC/테이블을 그대로 호출한다 —
 * 재고·금액을 바꾸는 로직은 여기 없다(스캔은 조회+담기일 뿐이다, 0014_scan.sql 주석 §5).
 *
 * "확정"(commitScanBatch)은 실제 재고·금액 확정 RPC(mark_items_out 등, 다른 도메인 소유)를
 * 절대 호출하지 않는다 — 프롬프트 §8 "스캔으로 바로 금액·재고를 확정하지 말 것"을 지키기 위해,
 * 담긴 목록을 사람이 검토했다는 사실만 기록(비움)한다. 실제 출고/반납/조정은 각 업무 화면
 * (예약 상세 / 재고 화면)에서 기존 확정 RPC로 처리한다 — 이 파일은 그리로 가는 목록만 만든다.
 */
"use server";

import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage, type Cap } from "@/lib/auth/access";
import { mustAffect } from "@/lib/db/mustAffect";
import type { ResolvedScan, StagedScan, ScanBatchItem, ScanMode, ScanCommitHandoff } from "./types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (e.code === "42501" || /forbidden/.test(msg)) return "이 작업을 수행할 권한이 없습니다.";
  if (/invalid_code/.test(msg)) return "스캔 코드 형식이 올바르지 않습니다.";
  if (/session_required/.test(msg)) return "배치 세션이 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.";
  if (/scan_url_rejected|url_not_allowed/.test(msg)) return "URL 형태의 코드는 스캔 대상이 아닙니다.";
  if (/mode_mismatch/.test(msg)) return "현재 모드에 맞지 않는 항목이 목록에 있습니다. 항목을 빼거나 모드를 바꾸세요.";
  if (/invalid_mode/.test(msg)) return "알 수 없는 스캔 모드입니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "대상을 찾을 수 없습니다.";
  // ponytail: 매핑 안 된 원문은 화면에 보이지 않는다(Postgres 내부 메시지 노출 금지) — 서버 콘솔에만 남긴다.
  console.error("[scan pgError] unmapped:", e.code, msg);
  return "처리 중 오류가 발생했습니다. 코드를 다시 확인해 주세요.";
}

async function withCap<T>(businessId: string, cap: Cap, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireCap(businessId, cap);
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  return fn();
}

function toResolvedScan(row: Record<string, unknown>): ResolvedScan {
  return {
    kind: row.kind as ResolvedScan["kind"],
    id: (row.id as string) ?? null,
    label: (row.label as string) ?? null,
    status: (row.status as string) ?? null,
    extra: (row.extra as Record<string, unknown>) ?? {},
  };
}

/**
 * 조회 + 담기(수량 누적)를 한 번에. crm.stage_scan_batch가 내부에서 resolve_scan을 먼저 호출하므로
 * (0014_scan.sql) 클라이언트는 스캔마다 이 함수 하나만 부르면 "스캔 → 목록에 담기"가 완성된다.
 * not_found/text는 서버가 담지 않고 결과만 돌려준다 — 배치에는 실재하는 대상만 쌓인다.
 * 담기는 조회보다 강한 동작이므로 write cap이 필요하다.
 */
export async function stageScan(businessId: string, session: string, code: string, qty = 1, mode: ScanMode = "generic"): Promise<ActionResult<StagedScan>> {
  // CP-230: 모드는 서버가 실제로 분기한다(0023 stage_scan_batch p_mode) — 모드에 맞지 않는 종류는 담지 않고 rejected 로 돌려준다.
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("stage_scan_batch", {
      p_business: businessId,
      p_session: session,
      p_code: code,
      p_qty: qty,
      p_mode: mode,
    });
    if (error) return { ok: false, message: pgError(error) };
    const row = data as Record<string, unknown>;
    return { ok: true, data: { ...toResolvedScan(row), staged: Boolean(row.staged), ...(row.rejected ? { rejected: row.rejected as "mode_mismatch" } : {}) } };
  });
}

function toBatchItem(row: Record<string, unknown>): ScanBatchItem {
  return {
    id: row.id as string,
    kind: row.kind as ScanBatchItem["kind"],
    targetId: row.target_id as string,
    label: (row.label as string) ?? null,
    qty: row.qty as number,
    note: (row.note as string) ?? null,
    addedAt: row.added_at as string,
  };
}

export async function listScanBatch(businessId: string, session: string): Promise<ActionResult<ScanBatchItem[]>> {
  return withCap(businessId, "view", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb
      .schema("crm")
      .from("scan_batch_items")
      .select("id,kind,target_id,label,qty,note,added_at")
      .eq("business_id", businessId)
      .eq("session_key", session)
      .order("added_at", { ascending: false });
    if (error) return { ok: false, message: pgError(error) };
    return { ok: true, data: (data ?? []).map(toBatchItem) };
  });
}

export async function updateScanBatchItemQty(businessId: string, itemId: string, qty: number): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    if (qty < 1) return { ok: false, message: "수량은 1 이상이어야 합니다. 제거하려면 삭제를 사용하세요." };
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("scan_batch_items").update({ qty }).eq("id", itemId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 이미 목록에서 빠진 항목입니다." };
    return { ok: true, data: undefined };
  });
}

export async function removeScanBatchItem(businessId: string, itemId: string): Promise<ActionResult> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const r = await mustAffect(sb.schema("crm").from("scan_batch_items").delete().eq("id", itemId).eq("business_id", businessId));
    if (!r.ok) return { ok: false, message: r.error ? pgError(r.error) : "권한이 없거나 이미 목록에서 빠진 항목입니다." };
    return { ok: true, data: undefined };
  });
}

/**
 * "확정" — crm.commit_scan_batch(0023, 원자): 스냅샷 → 모드별 처리 → 비움.
 *  · unmanned_audit : 진행중 실사가 있으면 스캔 수량을 counted_qty 로 기록(재고는 안 바뀐다 — 실사 완료는 별도 RPC).
 *  · rental_checkout/return : 개체가 속한 예약·항목을 handoff 로 돌려준다(출고·반납 확정은 예약 상세의 기존 RPC).
 *  · 그 외 : 목록 비움만. 모드에 맞지 않는 항목이 있으면 mode_mismatch 로 거부한다.
 * 반환의 배열은 기존 호출부 호환(확정 직전 스냅샷)이고, handoff 는 같은 객체에 붙어 온다.
 */
export async function commitScanBatch(businessId: string, session: string, mode: ScanMode = "generic"): Promise<ActionResult<ScanBatchItem[] & { handoff?: ScanCommitHandoff }>> {
  return withCap(businessId, "write", async () => {
    const sb = getServerSupabase();
    const { data, error } = await sb.schema("crm").rpc("commit_scan_batch", { p_business: businessId, p_session: session, p_mode: mode });
    if (error) return { ok: false, message: pgError(error) };
    const j = data as { items: Record<string, unknown>[]; handoff: Record<string, unknown> };
    const snapshot = (j.items ?? []).map(toBatchItem) as ScanBatchItem[] & { handoff?: ScanCommitHandoff };
    const h = j.handoff ?? {};
    snapshot.handoff = {
      ...(h.stock_take_id !== undefined ? { stockTakeId: (h.stock_take_id as string | null) ?? null, countedLines: Number(h.counted_lines ?? 0) } : {}),
      ...(h.reservations ? { reservations: (h.reservations as Record<string, unknown>[]).map((r) => ({ reservationId: String(r.reservation_id), itemIds: (r.item_ids as string[]) ?? [], unitIds: ((r.unit_ids as (string | null)[]) ?? []).filter((u): u is string => Boolean(u)) })) } : {}),
    };
    return { ok: true, data: snapshot };
  });
}
