"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, CircleAlert, INDUSTRY_ICON } from "@/lib/icons";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { IndustryPicker, type IndustryOption } from "@/components/auth/IndustryPicker";
import { checkBusinessNumber, createBusiness, signOut } from "@/lib/auth/actions";
import { INDUSTRIES, INDUSTRY_DEFS } from "@/lib/industry/config";
import { formatBizRegNo, isValidBizRegNo, normalizeBizRegNo } from "@/lib/external/bizno";
import type { NtsStatus } from "@/lib/external/nts";

const BIZNO_FORMAT_ERROR = "사업자등록번호 형식(10자리·검증숫자)이 올바르지 않습니다";

/** 국세청 상태 배지 문구·강조. null = 배지 없음(키 없음/미조회). */
function ntsBadge(nts: NtsStatus | null | undefined): { text: string; warn: boolean } | null {
  if (!nts) return null;
  if (!nts.registered) return { text: "국세청 미등록 번호", warn: true };
  const tax = nts.taxType ? ` · ${nts.taxType}` : "";
  return { text: `${nts.status}${tax}${nts.endDate ? ` (${nts.endDate})` : ""}`, warn: nts.statusCode !== "01" };
}

const INDUSTRY_OPTIONS: IndustryOption[] = INDUSTRIES.map((key) => {
  const def = INDUSTRY_DEFS[key];
  return { key: def.key, name: def.name, desc: def.desc, icon: INDUSTRY_ICON[key] };
});

/**
 * 방어적 언랩 — lib/auth/actions.ts의 createBusiness() 반환 타입 버그는 메인이 근본 수정했다.
 * 이 함수는 이제 실제로는 항상 문자열을 받지만, 다시 회귀하거나 다른 형태로 바뀌어도
 * 이 화면에서 `/w/[object Object]`로 튀지 않도록 방어 코드로만 남겨둔다.
 */
function extractBusinessId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

/** 소속된 사업장이 하나도 없을 때만 보여준다. 가짜 성과 수치·데모 매장 없이 실제 생성 폼만. */
export function CreateBusinessForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [industry, setIndustry] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);
  // 사업자등록번호(선택). 체크섬 오류는 blur 즉시(클라이언트), 국세청 상태는 서버 액션(키 있을 때만).
  const [bizNo, setBizNo] = React.useState("");
  const [bizNoError, setBizNoError] = React.useState<string | undefined>(undefined);
  const [badge, setBadge] = React.useState<{ text: string; warn: boolean } | null>(null);

  const handleBizNoBlur = async () => {
    const digits = normalizeBizRegNo(bizNo);
    setBadge(null);
    if (!digits) {
      setBizNoError(undefined);
      return;
    }
    if (!isValidBizRegNo(digits)) {
      setBizNoError(BIZNO_FORMAT_ERROR);
      return;
    }
    setBizNoError(undefined);
    setBizNo(formatBizRegNo(digits));
    const r = await checkBusinessNumber(digits);
    if (!r.ok) {
      setBizNoError(r.message);
      return;
    }
    setBadge(r.ntsError ? { text: "국세청 조회 실패(나중에 다시 확인)", warn: true } : ntsBadge(r.nts));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!industry) {
      setError("업종을 선택하세요.");
      return;
    }
    const digits = normalizeBizRegNo(bizNo);
    if (digits && !isValidBizRegNo(digits)) {
      setBizNoError(BIZNO_FORMAT_ERROR);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const result = await createBusiness(name, industry, digits || undefined);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const bizId = extractBusinessId(result.businessId);
      if (!bizId) {
        setError("사업장을 만들었지만 이동 경로를 확인하지 못했습니다. 새로고침 후 목록에서 선택해 주세요.");
        router.refresh();
        return;
      }
      router.push(`/w/${bizId}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[520px] text-left">
      <h1 className="text-[24px] font-bold leading-tight tracking-tight text-auth-tx lg:text-[26px]">아직 소속된 사업장이 없습니다</h1>
      <p className="mb-6 mt-1.5 max-w-[380px] text-[13px] leading-relaxed text-auth-tx2 lg:mx-auto lg:mb-7">
        새 사업장을 만들거나, 기존 사업장 관리자에게 초대를 요청하세요.
      </p>

      <form onSubmit={handleSubmit} noValidate className="text-left">
        <p className="mb-2 px-1 text-[12.5px] font-medium text-auth-tx2">업종</p>
        <IndustryPicker industries={INDUSTRY_OPTIONS} value={industry} onChange={setIndustry} />

        <div className="mt-5 w-full">
          <AuthInput
            label="사업장 이름"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 누리 의류렌탈 강남점"
            disabled={pending}
          />
          <AuthInput
            label="사업자등록번호 (선택)"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            value={bizNo}
            onChange={(e) => {
              setBizNo(e.target.value);
              setBizNoError(undefined);
              setBadge(null);
            }}
            onBlur={handleBizNoBlur}
            error={bizNoError}
            disabled={pending}
          />
          {badge && (
            <p className="-mt-2 mb-4 px-1 text-[12.5px] text-auth-tx2">
              <span
                className={
                  badge.warn
                    ? "inline-flex items-center rounded-full border border-[var(--auth-error)] px-2 py-0.5 font-medium text-[var(--auth-error)]"
                    : "inline-flex items-center rounded-full border border-auth-input-bd bg-auth-field px-2 py-0.5 font-medium text-auth-tx"
                }
              >
                국세청 {badge.text}
              </span>
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-[8px] border border-[var(--auth-error)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--auth-error)]"
            >
              <CircleAlert size={15} className="mt-[1px] shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <AuthButton type="submit" loading={pending} className="mt-2">
            <Building2 size={16} aria-hidden />새 사업장 만들기
          </AuthButton>
        </div>
      </form>

      <div className="mt-4 flex items-center justify-center text-[12.5px] lg:mt-7">
        <button
          type="button"
          onClick={() => signOut()}
          className="inline-flex min-h-[44px] items-center rounded px-1 font-semibold text-[var(--auth-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--auth-accent)] lg:min-h-[32px]"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
