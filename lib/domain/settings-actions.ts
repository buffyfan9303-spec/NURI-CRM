/**
 * 사업장 설정 서버 액션. 기능 스위치의 유일한 출처는 crm.businesses.settings.features 다 —
 * businesses.attendance_enabled 는 그 JSON 에서 파생된 생성 컬럼(0022)이라 따로 쓰지 않는다.
 * 권한: staff.manage(RPC crm.set_business_feature 가 다시 확인한다).
 */
"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireCap, AccessDenied, accessMessage } from "@/lib/auth/access";

export type SettingsActionResult = { ok: true; features: Record<string, boolean> } | { ok: false; message: string };

/** 설정 화면에서 켤/끌 수 있는 기능 키. 서버 RPC 화이트리스트와 같다. */
export type ConfigurableFeature = "attendance";

function pgError(e: { code?: string; message: string }): string {
  const msg = e.message ?? "";
  if (e.code === "42501" || /forbidden/.test(msg)) return "사업장 설정을 바꿀 권한(직원·권한 관리)이 없습니다.";
  if (/not_configurable/.test(msg)) return "이 업종에서는 근태 기능을 켤 수 없습니다.";
  if (/unknown_feature/.test(msg)) return "설정할 수 없는 기능입니다.";
  if (e.code === "P0002" || /not_found/.test(msg)) return "사업장을 찾을 수 없습니다.";
  console.error("[settings pgError] unmapped:", e.code, msg);
  return "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 기능 스위치 토글. 예: setBusinessFeatureAction(businessId, "attendance", true)
 * 성공 시 최종 features JSON 을 돌려준다 — 화면은 resolveFeatures(industry, { features }) 로 다시 계산하면 된다.
 */
export async function setBusinessFeatureAction(
  businessId: string,
  key: ConfigurableFeature,
  enabled: boolean
): Promise<SettingsActionResult> {
  try {
    await requireCap(businessId, "staff.manage");
  } catch (e) {
    if (e instanceof AccessDenied) return { ok: false, message: accessMessage(e.detail).detail };
    throw e;
  }
  const sb = getServerSupabase();
  const { data, error } = await sb.schema("crm").rpc("set_business_feature", {
    p_business: businessId,
    p_key: key,
    p_enabled: enabled,
  });
  if (error) return { ok: false, message: pgError(error) };
  for (const seg of ["settings", "staff-shift", ""]) revalidatePath(`/w/${businessId}${seg ? `/${seg}` : ""}`);
  return { ok: true, features: (data as Record<string, boolean>) ?? {} };
}
