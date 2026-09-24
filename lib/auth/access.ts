/**
 * 서버측 접근 판정 — 화면 렌더와 서버 액션이 공통으로 쓰는 유일한 관문.
 *
 * 설계 근거 (docs/crm-contract.md §5):
 *  1. 클라이언트가 보낸 businessId 는 힌트다. 여기서 auth.uid() 의 활성 소속을 다시 읽는다.
 *  2. 권한은 **항상 DB의 memberships 를 조회해** 계산한다(crm.my_caps).
 *     JWT claims 를 캐시해 쓰지 않으므로 권한 회수가 다음 요청부터 즉시 반영된다.
 *  3. "권한 부족 / 서버 장애 / 정상 빈 결과" 는 서로 다른 세 가지다.
 *     호출부가 구분해 처리할 수 있도록 판별 유니온으로 돌려준다.
 */
import { getServerSupabase } from "@/lib/supabase/server";
import type { Industry } from "@/lib/industry/config";
import { isIndustry } from "@/lib/industry/config";

export type Cap =
  | "view"
  | "pii.read"
  | "cost.read"
  | "revenue.read"
  | "write"
  | "inventory.adjust"
  | "refund"
  | "delete"
  | "export"
  | "staff.manage"
  | "attendance.self"
  | "attendance.all";

export interface AccessOk {
  ok: true;
  userId: string;
  email: string;
  businessId: string;
  businessName: string;
  industry: Industry;
  timezone: string;
  role: string;
  caps: Cap[];
  settings: Record<string, unknown>;
}

/** 실패 이유는 화면 문구와 HTTP 상태가 달라지므로 반드시 구분한다. */
export type AccessFail =
  | { ok: false; reason: "unauthenticated" }
  /** 로그인은 됐으나 이 사업장의 활성 소속이 없다(초대 대기·해지·타 사업장). */
  | { ok: false; reason: "not-member"; businessId: string }
  /** 소속은 있으나 요구 capability 가 없다. */
  | { ok: false; reason: "forbidden"; businessId: string; missing: Cap; caps: Cap[] }
  /** DB/네트워크 장애. 빈 화면으로 덮지 말고 재시도를 제공해야 한다. */
  | { ok: false; reason: "error"; message: string };

export type AccessResult = AccessOk | AccessFail;

/**
 * 사업장 접근 판정. cap 을 주면 그 능력까지 확인한다.
 *
 * businessId 가 uuid 형식이 아니면 DB에 보내기 전에 거른다(주입 시도).
 */
export async function checkAccess(
  businessId: string,
  cap?: Cap
): Promise<AccessResult> {
  if (!UUID_RE.test(businessId)) {
    return { ok: false, reason: "not-member", businessId };
  }

  const sb = getServerSupabase();

  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth?.user) return { ok: false, reason: "unauthenticated" };

  // caps 와 사업장 정보를 병렬로. 둘 다 RLS 아래에서 실행된다.
  const [capsRes, bizRes] = await Promise.all([
    sb.schema("crm").rpc("my_caps", { p_business: businessId }),
    sb
      .schema("crm")
      .from("businesses")
      .select("id,name,industry,timezone,settings,active")
      .eq("id", businessId)
      .maybeSingle(),
    ]);

  if (capsRes.error) {
    return { ok: false, reason: "error", message: capsRes.error.message };
  }
  if (bizRes.error) {
    return { ok: false, reason: "error", message: bizRes.error.message };
  }

  const caps = (capsRes.data ?? []) as Cap[];
  const biz = bizRes.data;

  // 소속이 없으면 RLS 때문에 businesses 조회도 0행이다 → 두 조건 모두 not-member.
  if (caps.length === 0 || !biz || biz.active === false) {
    return { ok: false, reason: "not-member", businessId };
  }

  if (cap && !caps.includes(cap)) {
    return { ok: false, reason: "forbidden", businessId, missing: cap, caps };
  }

  // 역할은 화면 표시용. 권한 판정에는 절대 쓰지 않는다(caps 만 쓴다).
  const { data: mem } = await sb
    .schema("crm")
    .from("memberships")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return {
    ok: true,
    userId: auth.user.id,
    email: auth.user.email ?? "",
    businessId: biz.id as string,
    businessName: biz.name as string,
    industry: isIndustry(biz.industry) ? biz.industry : "factory",
    timezone: (biz.timezone as string) ?? "Asia/Seoul",
    role: (mem?.role as string) ?? "viewer",
    caps,
    settings: (biz.settings as Record<string, unknown>) ?? {},
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 서버 액션에서 쓰는 단언 버전. 실패하면 AccessDenied 를 던진다. */
export class AccessDenied extends Error {
  constructor(public detail: AccessFail) {
    super(`access denied: ${detail.reason}`);
    this.name = "AccessDenied";
  }
}

export async function requireCap(businessId: string, cap: Cap): Promise<AccessOk> {
  const r = await checkAccess(businessId, cap);
  if (!r.ok) throw new AccessDenied(r);
  return r;
}

/** 실패 사유 → 사용자에게 보여줄 한국어 문구. 오류를 빈 데이터로 덮지 않기 위한 단일 출처. */
export function accessMessage(f: AccessFail): { title: string; detail: string } {
  switch (f.reason) {
    case "unauthenticated":
      return {
        title: "로그인이 필요합니다",
        detail: "세션이 만료되었거나 로그인하지 않았습니다. 다시 로그인해 주세요.",
      };
    case "not-member":
      return {
        title: "이 사업장에 접근할 수 없습니다",
        detail:
          "이 사업장의 활성 소속이 없습니다. 초대를 받았다면 관리자의 승인이 필요하고, " +
          "소속이 해지된 경우 다시 초대를 받아야 합니다.",
      };
    case "forbidden":
      return {
        title: "권한이 없습니다",
        detail: `이 기능에는 '${CAP_LABEL[f.missing] ?? f.missing}' 권한이 필요합니다. 사업장 관리자에게 요청하세요.`,
      };
    case "error":
      return {
        title: "불러오지 못했습니다",
        detail: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
  }
}

export const CAP_LABEL: Record<Cap, string> = {
  view: "화면 조회",
  "pii.read": "고객 개인정보 조회",
  "cost.read": "원가·마진 조회",
  "revenue.read": "매출·정산 조회",
  write: "생성·수정",
  "inventory.adjust": "재고 조정",
  refund: "환불·보증금 차감",
  delete: "삭제",
  export: "내보내기",
  "staff.manage": "직원·권한 관리",
  "attendance.self": "본인 근태",
  "attendance.all": "전 직원 근태",
};
