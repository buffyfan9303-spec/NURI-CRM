"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, CircleAlert, INDUSTRY_ICON } from "@/lib/icons";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { IndustryPicker, type IndustryOption } from "@/components/auth/IndustryPicker";
import { createBusiness, signOut } from "@/lib/auth/actions";
import { INDUSTRIES, INDUSTRY_DEFS } from "@/lib/industry/config";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!industry) {
      setError("업종을 선택하세요.");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const result = await createBusiness(name, industry);
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
